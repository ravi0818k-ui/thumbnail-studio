import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { Segmented } from './ui'
import { cutout, loadPhoto, refine, refineRect, segment, type Masks, type Photo, type RemoverStage } from '../engine/bgRemover'
import type { MatteInfo } from '../engine/pythonImage'
import { PERSON_HINT_EXTRA, REMOVER_MODELS, downloadMegabytes } from '../engine/removerModels'
import {
  ASPECTS,
  BRUSH_DEFAULT,
  BRUSH_MAX,
  BRUSH_MIN,
  EditHistory,
  blendRefine,
  clampRadius,
  dragCrop,
  fitAspect,
  fullRect,
  outputName,
  renderOutput,
  resolveRatio,
  segmentBounds,
  stampCoverage,
  stampSegment,
  stepRadius,
  trimToSubject,
  unionRect,
  type Brush,
  type CropHandle,
  type Matte,
  type OutputFormat,
  type Point,
  type Rect,
} from '../engine/removerEdit'

type Phase = 'empty' | 'working' | 'edit' | 'error'
type Tool = 'restore' | 'erase' | 'refine' | 'crop' | 'hand'

interface View {
  zoom: number
  /** Screen position of the photo's top-left corner, in CSS pixels. */
  x: number
  y: number
}

const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'restore', label: 'Restore', key: 'R', hint: 'Paint back anything the removal took — hair, an ear, a hand' },
  { id: 'erase', label: 'Erase', key: 'E', hint: 'Paint away background the removal kept' },
  { id: 'refine', label: 'Refine hair', key: 'F', hint: 'Paint over a messy edge: strands come back, gaps between curls stay clear' },
  { id: 'crop', label: 'Crop', key: 'C', hint: 'Frame the cut-out — or fit it to the subject' },
  { id: 'hand', label: 'Hand', key: 'H', hint: 'Drag to move around. Space does this with any tool' },
]

const BACKDROPS = [
  { id: 'checker', label: 'Transparent' },
  { id: '#ffffff', label: 'White' },
  { id: '#000000', label: 'Black' },
  { id: '#22c55e', label: 'Green' },
]

/** Screen-space size of the crop handles, in CSS pixels. */
const HANDLE = 9

/**
 * The standalone background remover at /remove-background. Its pipeline is in
 * engine/bgRemover.ts and its editing in engine/removerEdit.ts; this component
 * is the canvas, the controls and the glue, and holds no image maths itself.
 */
export default function BgRemoverScreen() {
  const close = useEditor((s) => s.closeRemover)

  const [phase, setPhase] = useState<Phase>('empty')
  const [stage, setStage] = useState<RemoverStage | null>(null)
  const [error, setError] = useState('')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [info, setInfo] = useState<MatteInfo>({})
  const [personOnly, setPersonOnly] = useState(false)
  const [device, setDevice] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [tool, setTool] = useState<Tool>('restore')
  const [brush, setBrush] = useState<Brush>(BRUSH_DEFAULT)
  const [backdrop, setBackdrop] = useState('checker')
  const [comparing, setComparing] = useState(false)
  const [ghost, setGhost] = useState(false)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [aspect, setAspect] = useState('free')
  const [format, setFormat] = useState<OutputFormat>('png')
  const [jpegBackground, setJpegBackground] = useState('#ffffff')
  const [busy, setBusy] = useState('')
  const [, setVersion] = useState(0)
  const [dragging, setDragging] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const matteRef = useRef<Matte | null>(null)
  const masksRef = useRef<Masks | null>(null)
  const historyRef = useRef<EditHistory | null>(null)
  const cutCanvas = useRef<HTMLCanvasElement | null>(null)
  const cutImage = useRef<ImageData | null>(null)
  const origCanvas = useRef<HTMLCanvasElement | null>(null)
  const viewRef = useRef<View>({ zoom: 1, x: 0, y: 0 })
  const pointerRef = useRef<Point | null>(null)
  const spaceRef = useRef(false)
  const frame = useRef(0)
  const gesture = useRef<
    | { kind: 'none' }
    | { kind: 'pan'; last: Point }
    | { kind: 'paint'; last: Point; mode: 'restore' | 'erase' }
    | { kind: 'refine'; last: Point; coverage: Uint8Array; bounds: Rect | null; path: Point[] }
    | { kind: 'crop'; handle: CropHandle; start: Rect; from: Point }
  >({ kind: 'none' })

  const bump = () => setVersion((v) => v + 1)

  // ------------------------------------------------------------- drawing --

  const draw = useCallback(() => {
    frame.current = 0
    const canvas = canvasRef.current
    const host = stageRef.current
    const matte = matteRef.current
    if (!canvas || !host) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = host.clientWidth
    const height = host.clientHeight
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!matte || !cutCanvas.current || !origCanvas.current) return
    const view = viewRef.current
    const k = view.zoom * dpr

    // Backdrop under the photo only, so its edge stays visible.
    const px = view.x * dpr
    const py = view.y * dpr
    const pw = matte.width * k
    const ph = matte.height * k
    ctx.save()
    if (backdrop === 'checker') {
      ctx.fillStyle = checker(ctx, dpr)
    } else {
      ctx.fillStyle = backdrop
    }
    ctx.fillRect(px, py, pw, ph)
    ctx.restore()

    ctx.save()
    ctx.setTransform(k, 0, 0, k, px, py)
    // Smooth when zoomed out, crisp pixels when zoomed in to judge strands.
    ctx.imageSmoothingEnabled = view.zoom < 2
    ctx.imageSmoothingQuality = 'high'
    if (comparing) {
      ctx.drawImage(origCanvas.current, 0, 0)
    } else {
      if (ghost) {
        ctx.globalAlpha = 0.28
        ctx.drawImage(origCanvas.current, 0, 0)
        ctx.globalAlpha = 1
      }
      ctx.drawImage(cutCanvas.current, 0, 0)
    }
    ctx.restore()

    // Refine stroke in progress: shown as a tint, since nothing changes until it ends.
    const g = gesture.current
    if (g.kind === 'refine' && g.path.length > 0) {
      ctx.save()
      ctx.setTransform(k, 0, 0, k, px, py)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
      ctx.lineWidth = brush.radius * 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(g.path[0].x, g.path[0].y)
      for (const p of g.path) ctx.lineTo(p.x + 0.01, p.y)
      ctx.stroke()
      ctx.restore()
    }

    // Crop: always dims what is outside it; handles only with the crop tool.
    const rect = crop ?? fullRect(matte.width, matte.height)
    const cropped = crop !== null && (crop.width !== matte.width || crop.height !== matte.height)
    if (tool === 'crop' || cropped) {
      const rx = px + rect.x * k
      const ry = py + rect.y * k
      const rw = rect.width * k
      const rh = rect.height * k
      ctx.save()
      const shade = new Path2D()
      shade.rect(px, py, pw, ph)
      shade.rect(rx, ry, rw, rh)
      ctx.fillStyle = tool === 'crop' ? 'rgba(8, 10, 14, 0.62)' : 'rgba(8, 10, 14, 0.45)'
      ctx.fill(shade, 'evenodd')
      if (tool === 'crop') {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = dpr
        for (let i = 1; i < 3; i++) {
          ctx.beginPath()
          ctx.moveTo(rx + (rw / 3) * i, ry)
          ctx.lineTo(rx + (rw / 3) * i, ry + rh)
          ctx.moveTo(rx, ry + (rh / 3) * i)
          ctx.lineTo(rx + rw, ry + (rh / 3) * i)
          ctx.stroke()
        }
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2 * dpr
        ctx.strokeRect(rx, ry, rw, rh)
        ctx.fillStyle = '#ffffff'
        for (const [hx, hy] of handlePositions({ x: rx, y: ry, width: rw, height: rh })) {
          ctx.fillRect(hx - HANDLE * dpr * 0.5, hy - HANDLE * dpr * 0.5, HANDLE * dpr, HANDLE * dpr)
        }
      }
      ctx.restore()
    }

    // The brush circle: the exact area a stroke will touch, at this zoom.
    const pointer = pointerRef.current
    if (pointer && (tool === 'restore' || tool === 'erase' || tool === 'refine') && !spaceRef.current) {
      const cx = pointer.x * dpr
      const cy = pointer.y * dpr
      const r = Math.max(1.5, brush.radius * k)
      ctx.save()
      ctx.lineWidth = 3 * dpr
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 1.5 * dpr
      ctx.strokeStyle = tool === 'erase' ? '#f87171' : tool === 'refine' ? '#38bdf8' : '#4ade80'
      ctx.stroke()
      if (brush.hardness < 1 && r > 8) {
        ctx.setLineDash([3 * dpr, 3 * dpr])
        ctx.lineWidth = dpr
        ctx.beginPath()
        ctx.arc(cx, cy, r * brush.hardness, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    }
  }, [backdrop, brush, comparing, crop, ghost, tool])

  const requestDraw = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw)
  }, [draw])

  useLayoutEffect(() => {
    requestDraw()
  })

  useEffect(() => {
    const host = stageRef.current
    if (!host) return
    const observer = new ResizeObserver(() => requestDraw())
    observer.observe(host)
    return () => observer.disconnect()
  }, [requestDraw, phase])

  /** Copies changed pixels into the display canvas, then redraws. */
  const flush = useCallback(
    (rect: Rect | null) => {
      const canvas = cutCanvas.current
      const image = cutImage.current
      if (canvas && image && rect) {
        canvas.getContext('2d')!.putImageData(image, 0, 0, rect.x, rect.y, rect.width, rect.height)
      }
      requestDraw()
    },
    [requestDraw],
  )

  const fit = useCallback(() => {
    const host = stageRef.current
    const matte = matteRef.current
    if (!host || !matte) return
    const pad = 32
    const zoom = Math.min((host.clientWidth - pad * 2) / matte.width, (host.clientHeight - pad * 2) / matte.height, 4)
    viewRef.current = {
      zoom,
      x: (host.clientWidth - matte.width * zoom) / 2,
      y: (host.clientHeight - matte.height * zoom) / 2,
    }
    requestDraw()
    bump()
  }, [requestDraw])

  const zoomAt = useCallback(
    (factor: number, at?: Point) => {
      const host = stageRef.current
      if (!host) return
      const view = viewRef.current
      const point = at ?? { x: host.clientWidth / 2, y: host.clientHeight / 2 }
      const zoom = Math.max(0.02, Math.min(32, view.zoom * factor))
      const scale = zoom / view.zoom
      viewRef.current = { zoom, x: point.x - (point.x - view.x) * scale, y: point.y - (point.y - view.y) * scale }
      requestDraw()
      bump()
    },
    [requestDraw],
  )

  // ------------------------------------------------------------ pipeline --

  const install = useCallback(
    (loaded: Photo, pixels: Uint8ClampedArray) => {
      const { width, height } = loaded.image
      const matte: Matte = { width, height, original: loaded.image.data, pixels }
      matteRef.current = matte
      historyRef.current = new EditHistory(width, height)
      const cut = document.createElement('canvas')
      cut.width = width
      cut.height = height
      // Shares the cut-out's buffer, so a brush edit is visible after one putImageData.
      cutImage.current = new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height)
      cut.getContext('2d')!.putImageData(cutImage.current, 0, 0)
      cutCanvas.current = cut
      const orig = document.createElement('canvas')
      orig.width = width
      orig.height = height
      orig.getContext('2d')!.putImageData(loaded.image, 0, 0)
      origCanvas.current = orig
      setCrop(null)
      setAspect('free')
    },
    [],
  )

  const start = useCallback(
    async (file: Blob, name: string) => {
      if (!file.type.startsWith('image/')) {
        setError('That file is not an image. Try a JPEG, PNG or WEBP photo.')
        setPhase('error')
        return
      }
      setPhase('working')
      setError('')
      setStage(null)
      setPersonOnly(false)
      const started = performance.now()
      try {
        const loaded = await loadPhoto(file, name)
        setPhoto(loaded)
        const masks = await segment(loaded.image, setStage)
        masksRef.current = masks
        setDevice(masks.device)
        setStage({ stage: 'matte' })
        const result = await cutout(loaded, masks, false)
        install(loaded, result.pixels)
        setInfo(result.info)
        setSeconds((performance.now() - started) / 1000)
        setPhase('edit')
        setTool('restore')
        requestAnimationFrame(fit)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setPhase('error')
      }
    },
    [fit, install],
  )

  /** Re-solves the whole cut-out — "Person only" on or off — as one undoable step. */
  const rerun = useCallback(
    async (nextPersonOnly: boolean) => {
      const matte = matteRef.current
      const masks = masksRef.current
      const history = historyRef.current
      if (!matte || !masks || !photo || !history) return
      setBusy(nextPersonOnly ? 'Keeping only the person…' : 'Keeping the whole subject…')
      try {
        const result = await cutout(photo, masks, nextPersonOnly)
        const all = fullRect(matte.width, matte.height)
        history.begin()
        history.touch(matte, all)
        matte.pixels.set(result.pixels)
        history.commit(matte)
        setPersonOnly(nextPersonOnly)
        flush(all)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy('')
        bump()
      }
    },
    [flush, photo],
  )

  const undo = useCallback(() => {
    const matte = matteRef.current
    if (!matte || busy) return
    flush(historyRef.current?.undo(matte) ?? null)
    bump()
  }, [busy, flush])

  const redo = useCallback(() => {
    const matte = matteRef.current
    if (!matte || busy) return
    flush(historyRef.current?.redo(matte) ?? null)
    bump()
  }, [busy, flush])

  // ------------------------------------------------------------- pointer --

  const toPhoto = (p: Point): Point => {
    const view = viewRef.current
    return { x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom }
  }

  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = stageRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const onPointerDown = (event: React.PointerEvent) => {
    const matte = matteRef.current
    const history = historyRef.current
    if (!matte || !history || phase !== 'edit') return
    const at = local(event)
    ;(event.target as Element).setPointerCapture(event.pointerId)
    if (event.button === 1 || spaceRef.current || tool === 'hand') {
      gesture.current = { kind: 'pan', last: at }
      return
    }
    if (event.button !== 0 || busy) return
    const p = toPhoto(at)
    if (tool === 'crop') {
      const rect = crop ?? fullRect(matte.width, matte.height)
      const handle = hitCropHandle(rect, p, viewRef.current.zoom)
      if (handle) gesture.current = { kind: 'crop', handle, start: rect, from: p }
      return
    }
    if (tool === 'refine') {
      const coverage = new Uint8Array(matte.width * matte.height)
      const bounds = stampCoverage(coverage, matte.width, matte.height, p, p, brush)
      gesture.current = { kind: 'refine', last: p, coverage, bounds, path: [p] }
      requestDraw()
      return
    }
    const mode = tool === 'erase' ? 'erase' : 'restore'
    history.begin()
    history.touch(matte, segmentBounds(p, p, brush.radius, matte.width, matte.height))
    flush(stampSegment(matte, p, p, brush, mode))
    gesture.current = { kind: 'paint', last: p, mode }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const at = local(event)
    pointerRef.current = at
    const matte = matteRef.current
    const g = gesture.current
    if (!matte) return
    if (g.kind === 'pan') {
      const view = viewRef.current
      viewRef.current = { ...view, x: view.x + at.x - g.last.x, y: view.y + at.y - g.last.y }
      g.last = at
      requestDraw()
      return
    }
    const p = toPhoto(at)
    if (g.kind === 'paint') {
      historyRef.current?.touch(matte, segmentBounds(g.last, p, brush.radius, matte.width, matte.height))
      flush(stampSegment(matte, g.last, p, brush, g.mode))
      g.last = p
      return
    }
    if (g.kind === 'refine') {
      g.bounds = unionRect(g.bounds, stampCoverage(g.coverage, matte.width, matte.height, g.last, p, brush))
      g.path.push(p)
      g.last = p
      requestDraw()
      return
    }
    if (g.kind === 'crop') {
      const ratio = resolveRatio(ASPECTS.find((a) => a.id === aspect)!, matte.width, matte.height)
      setCrop(dragCrop(g.start, g.handle, p.x - g.from.x, p.y - g.from.y, ratio, fullRect(matte.width, matte.height)))
      return
    }
    requestDraw()
  }

  const onPointerUp = async () => {
    const g = gesture.current
    gesture.current = { kind: 'none' }
    const matte = matteRef.current
    const history = historyRef.current
    if (!matte || !history) return
    if (g.kind === 'paint') {
      history.commit(matte)
      bump()
      return
    }
    if (g.kind === 'refine' && g.bounds) {
      const rect = refineRect(matte, g.bounds)
      setBusy('Refining the edge…')
      requestDraw()
      try {
        const solved = await refine(matte, g.coverage, rect)
        history.begin()
        history.touch(matte, g.bounds)
        blendRefine(matte, rect, solved, g.coverage)
        history.commit(matte)
        flush(rect)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy('')
        bump()
      }
    }
  }

  // Wheel zooms around the cursor; it needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const host = stageRef.current
    if (!host) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.altKey) {
        setBrush((b) => ({ ...b, radius: stepRadius(b.radius, event.deltaY < 0 ? 1 : -1) }))
        return
      }
      const rect = host.getBoundingClientRect()
      zoomAt(Math.exp(-event.deltaY * 0.0015), { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [zoomAt, phase])

  // ------------------------------------------------------------ keyboard --

  useEffect(() => {
    if (phase !== 'edit') return
    const onDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (mod) return
      if (event.code === 'Space') {
        event.preventDefault()
        spaceRef.current = true
        requestDraw()
        return
      }
      if (event.key === '[') setBrush((b) => ({ ...b, radius: stepRadius(b.radius, -1) }))
      else if (event.key === ']') setBrush((b) => ({ ...b, radius: stepRadius(b.radius, 1) }))
      else if (event.key === '0') fit()
      else {
        const picked = TOOLS.find((t) => t.key.toLowerCase() === event.key.toLowerCase())
        if (picked) setTool(picked.id)
      }
    }
    const onUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceRef.current = false
        requestDraw()
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [fit, phase, redo, requestDraw, undo])

  // A photo can be pasted straight in, as well as dropped or chosen.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file && phase !== 'working') void start(file, file.name || 'pasted photo')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [phase, start])

  // ------------------------------------------------------------ download --

  const download = async () => {
    const matte = matteRef.current
    if (!matte || !photo) return
    const out = renderOutput(matte, crop ?? fullRect(matte.width, matte.height), format, jpegBackground)
    const canvas = document.createElement('canvas')
    canvas.width = out.width
    canvas.height = out.height
    canvas.getContext('2d')!.putImageData(new ImageData(out.data, out.width, out.height), 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, format === 'jpeg' ? 'image/jpeg' : 'image/png', format === 'jpeg' ? 0.92 : undefined),
    )
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = outputName(photo.name, format)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const pickFile = () => fileRef.current?.click()
  const onFile = (file: File | undefined) => {
    if (file) void start(file, file.name)
  }

  const matte = matteRef.current
  const history = historyRef.current
  const cropRect = crop ?? (matte ? fullRect(matte.width, matte.height) : null)
  const suggestPerson = !!info.person && (info.extra ?? 0) >= PERSON_HINT_EXTRA && !personOnly
  const activeTool = TOOLS.find((t) => t.id === tool)!
  const cursor =
    phase !== 'edit'
      ? 'default'
      : tool === 'hand' || spaceRef.current
        ? gesture.current.kind === 'pan'
          ? 'grabbing'
          : 'grab'
        : tool === 'crop'
          ? 'default'
          : 'none'

  return (
    <div
      className={`rm-screen${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onFile(e.dataTransfer.files[0])
      }}
    >
      <header className="rm-top">
        <button className="btn ghost" onClick={close} title="Back to Thumbnail Studio">
          ← Back
        </button>
        <h1 className="rm-title">Background remover</h1>
        <div className="spacer" />
        {phase === 'edit' && (
          <>
            <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!history?.canUndo || !!busy} onClick={undo}>
              ↶
            </button>
            <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!history?.canRedo || !!busy} onClick={redo}>
              ↷
            </button>
            <button className="btn ghost" onClick={pickFile}>
              New photo
            </button>
            <button className="btn primary" onClick={download} disabled={!!busy}>
              Download {format === 'jpeg' ? 'JPEG' : 'PNG'}
            </button>
          </>
        )}
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {phase === 'empty' && <EmptyState onPick={pickFile} />}
      {phase === 'working' && <Working stage={stage} photo={photo} />}
      {phase === 'error' && (
        <div className="rm-center">
          <div className="rm-card">
            <h2>That did not work</h2>
            <p className="muted">{error}</p>
            <p className="muted">
              The models download from the Hugging Face CDN on first use, so a blocked or offline connection stops them.
            </p>
            <button className="btn primary" onClick={pickFile}>
              Try another photo
            </button>
          </div>
        </div>
      )}

      {phase === 'edit' && matte && (
        <div className="rm-body">
          <nav className="rm-tools" aria-label="Tools">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={`rm-tool${tool === t.id ? ' active' : ''}`}
                title={`${t.label} (${t.key}) — ${t.hint}`}
                onClick={() => setTool(t.id)}
              >
                <ToolIcon id={t.id} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          <div
            ref={stageRef}
            className="rm-stage"
            style={{ cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => {
              pointerRef.current = null
              requestDraw()
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <canvas ref={canvasRef} />
            {busy && <div className="rm-busy">{busy}</div>}
            {/* Inside the stage, so its presses must not reach the stage and paint. */}
            <div className="rm-zoom" onPointerDown={(e) => e.stopPropagation()}>
              <button className="icon-btn" title="Zoom out" onClick={() => zoomAt(1 / 1.25)}>
                −
              </button>
              <span>{Math.round(viewRef.current.zoom * 100)}%</span>
              <button className="icon-btn" title="Zoom in" onClick={() => zoomAt(1.25)}>
                +
              </button>
              <button className="btn ghost small" title="Fit (0)" onClick={fit}>
                Fit
              </button>
              <button
                className={`btn ghost small${comparing ? ' active' : ''}`}
                title="Hold to see the original photo"
                onPointerDown={() => setComparing(true)}
                onPointerUp={() => setComparing(false)}
                onPointerLeave={() => setComparing(false)}
              >
                Hold to compare
              </button>
            </div>
          </div>

          <aside className="rm-panel">
            {(info.person || personOnly) && (
              <section className="rm-section">
                <h3>Subject</h3>
                <Segmented
                  value={personOnly ? 'person' : 'whole'}
                  onChange={(v: string) => void rerun(v === 'person')}
                  options={[
                    { value: 'whole', label: 'Whole subject', title: 'Everything the model found, never missing a hand or a knee' },
                    { value: 'person', label: 'Person only', title: 'Drops the chair, the desk, the wall behind the hair' },
                  ]}
                />
                {suggestPerson && (
                  <p className="rm-hint">
                    Something besides the person was kept — a chair or a wall, by the look of it. Try <b>Person only</b>.
                  </p>
                )}
                {personOnly && (
                  <p className="muted rm-note">If a hand or a knee went missing, the Restore brush brings it back exactly.</p>
                )}
              </section>
            )}

            {(tool === 'restore' || tool === 'erase' || tool === 'refine') && (
              <section className="rm-section">
                <h3>{activeTool.label}</h3>
                <p className="muted rm-note">{activeTool.hint}.</p>
                <label className="rm-slider">
                  <span>
                    Size <b>{brush.radius * 2} px</b>
                  </span>
                  <input
                    type="range"
                    min={Math.log(BRUSH_MIN)}
                    max={Math.log(BRUSH_MAX)}
                    step={0.01}
                    value={Math.log(brush.radius)}
                    onChange={(e) => setBrush((b) => ({ ...b, radius: clampRadius(Math.exp(Number(e.target.value))) }))}
                  />
                </label>
                <label className="rm-slider">
                  <span>
                    Hardness <b>{Math.round(brush.hardness * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={brush.hardness}
                    onChange={(e) => setBrush((b) => ({ ...b, hardness: Number(e.target.value) }))}
                  />
                </label>
                <p className="muted rm-note">
                  <kbd>[</kbd> <kbd>]</kbd> or Alt + scroll to resize. Zoom in to work on single strands.
                </p>
              </section>
            )}

            {tool === 'crop' && cropRect && (
              <section className="rm-section">
                <h3>Crop</h3>
                <div className="rm-aspects">
                  {ASPECTS.map((a) => (
                    <button
                      key={a.id}
                      className={`btn small${aspect === a.id ? ' active' : ''}`}
                      onClick={() => {
                        setAspect(a.id)
                        const ratio = resolveRatio(a, matte.width, matte.height)
                        if (ratio) setCrop(fitAspect(cropRect, ratio, fullRect(matte.width, matte.height)))
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <button
                    className="btn small"
                    title="Trim to the cut-out, with a little room around it"
                    onClick={() => {
                      const trimmed = trimToSubject(matte.pixels, matte.width, matte.height)
                      if (!trimmed) return
                      const ratio = resolveRatio(ASPECTS.find((a) => a.id === aspect)!, matte.width, matte.height)
                      setCrop(ratio ? fitAspect(trimmed, ratio, fullRect(matte.width, matte.height), true) : trimmed)
                    }}
                  >
                    Fit to subject
                  </button>
                  <button
                    className="btn small ghost"
                    onClick={() => {
                      setCrop(null)
                      setAspect('free')
                    }}
                  >
                    Reset
                  </button>
                </div>
                <p className="muted rm-note">
                  {cropRect.width} × {cropRect.height} px. Drag the frame or its handles.
                </p>
              </section>
            )}

            <section className="rm-section">
              <h3>Preview on</h3>
              <div className="rm-backdrops">
                {BACKDROPS.map((b) => (
                  <button
                    key={b.id}
                    className={`rm-backdrop${backdrop === b.id ? ' active' : ''}`}
                    title={b.label}
                    style={b.id === 'checker' ? undefined : { background: b.id }}
                    data-checker={b.id === 'checker' || undefined}
                    onClick={() => setBackdrop(b.id)}
                  />
                ))}
                <input
                  type="color"
                  className="rm-backdrop"
                  title="Custom colour"
                  value={backdrop.startsWith('#') ? backdrop : '#3b82f6'}
                  onChange={(e) => setBackdrop(e.target.value)}
                />
              </div>
              <label className="toggle" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} />
                <span>Show what was removed, faintly</span>
              </label>
            </section>

            <section className="rm-section">
              <h3>Download</h3>
              <Segmented
                value={format}
                onChange={(v: OutputFormat) => setFormat(v)}
                options={[
                  { value: 'png', label: 'PNG', title: 'Transparent background' },
                  { value: 'jpeg', label: 'JPEG', title: 'Smaller file, on a solid colour' },
                ]}
              />
              {format === 'jpeg' && (
                <label className="rm-inline">
                  <span>JPEG has no transparency, so it goes on</span>
                  <input type="color" value={jpegBackground} onChange={(e) => setJpegBackground(e.target.value)} />
                </label>
              )}
              {cropRect && (
                <p className="muted rm-note">
                  {cropRect.width} × {cropRect.height} px{photo?.scaled ? ' — the upload was larger and was scaled to 4096 px' : ''}.
                </p>
              )}
              <button className="btn primary block" onClick={download} disabled={!!busy}>
                Download {format === 'jpeg' ? 'JPEG' : 'PNG'}
              </button>
            </section>

            <p className="muted rm-footnote">
              Done in {seconds.toFixed(1)} s{device ? ` on ${device.startsWith('webgpu') ? 'your GPU' : 'your CPU'}` : ''}.
              Nothing was uploaded.
              {device && !device.startsWith('webgpu') && (
                <>
                  {' '}
                  Without a usable GPU this browser ran the lighter model, which can miss an arm or a leg — the Restore
                  brush puts it back.
                </>
              )}
            </p>
          </aside>
        </div>
      )}

      {dragging && <div className="rm-drop">Drop the photo anywhere</div>}
    </div>
  )
}

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <div className="rm-center">
      <div className="rm-hero">
        <h2>Remove the background from any photo</h2>
        <p className="muted">
          Curly hair included. Then touch up with a restore brush, crop, and download a PNG or a JPEG. It all runs in
          your browser — your photo is never uploaded.
        </p>
        <button className="rm-dropzone" onClick={onPick}>
          <b>Choose a photo</b>
          <span className="muted">or drop it here, or paste it with Ctrl+V</span>
        </button>
        <ul className="rm-models">
          {REMOVER_MODELS.map((m) => (
            <li key={m.id}>
              <b>{m.name}</b> · {m.licence} · {m.megabytes} MB — <span className="muted">{m.role}</span>
            </li>
          ))}
        </ul>
        <p className="muted rm-note">
          The first photo downloads about {downloadMegabytes(true)} MB of models with a GPU ({downloadMegabytes(false)} MB
          without), and the ~15 MB Python engine. After that they are cached and it starts in seconds.
        </p>
      </div>
    </div>
  )
}

function Working({ stage, photo }: { stage: RemoverStage | null; photo: Photo | null }) {
  const steps: { id: string; label: string }[] = [
    { id: 'download', label: 'Downloading the models' },
    { id: 'general', label: 'Finding the subject' },
    { id: 'person', label: 'Checking for a person' },
    { id: 'matte', label: 'Refining every edge at full resolution' },
  ]
  const order = steps.map((s) => s.id)
  const current = stage ? order.indexOf(stage.stage) : 0
  return (
    <div className="rm-center">
      <div className="rm-card">
        <h2>Removing the background…</h2>
        {photo && (
          <p className="muted">
            {photo.image.width} × {photo.image.height} px
          </p>
        )}
        <ol className="rm-steps">
          {steps.map((s, i) => (
            <li key={s.id} className={i < current ? 'done' : i === current ? 'active' : ''}>
              {s.label}
              {s.id === 'download' && stage?.stage === 'download' && stage.total > 0 && (
                <span className="muted">
                  {' '}
                  — {Math.round(stage.loaded / 1e6)} of {Math.round(stage.total / 1e6)} MB
                </span>
              )}
            </li>
          ))}
        </ol>
        {stage?.stage === 'download' && (
          <div className="score">
            <span style={{ width: `${Math.round(stage.progress * 100)}%`, background: 'var(--accent)' }} />
          </div>
        )}
        <p className="muted rm-note">The first run downloads the models; later photos skip straight to the work.</p>
      </div>
    </div>
  )
}

function ToolIcon({ id }: { id: Tool }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }
  if (id === 'restore')
    return (
      <svg {...common}>
        <path d="M3 21c3 0 5-2 5-5l9-9a2.1 2.1 0 0 0-3-3l-9 9c-3 0-5 2-5 5" />
        <path d="M14 7l3 3" />
      </svg>
    )
  if (id === 'erase')
    return (
      <svg {...common}>
        <path d="M7 21h10" />
        <path d="M5.5 13.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8l-8 8H8l-2.5-2.5a1.8 1.8 0 0 1 0-2.5z" />
        <path d="M9 10l5 5" />
      </svg>
    )
  if (id === 'refine')
    return (
      <svg {...common}>
        <path d="M4 20c2-6 3-12 8-16" />
        <path d="M9 20c1-5 3-9 7-12" />
        <path d="M14 20c1-3 3-6 6-8" />
      </svg>
    )
  if (id === 'crop')
    return (
      <svg {...common}>
        <path d="M6 2v14a2 2 0 0 0 2 2h14" />
        <path d="M18 22V8a2 2 0 0 0-2-2H2" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 11.5v-7a1.5 1.5 0 0 1 3 0V12" />
      <path d="M14 10.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M17 11.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-4.5-2.1L4 16a1.6 1.6 0 0 1 2.4-2l1.6 1.5" />
    </svg>
  )
}

let checkerTile: HTMLCanvasElement | null = null

/** The transparency checkerboard as a fill pattern, a fixed size on screen. */
function checker(ctx: CanvasRenderingContext2D, dpr: number): CanvasPattern {
  const size = Math.round(8 * dpr)
  if (!checkerTile || checkerTile.width !== size * 2) {
    checkerTile = document.createElement('canvas')
    checkerTile.width = checkerTile.height = size * 2
    const t = checkerTile.getContext('2d')!
    t.fillStyle = '#e8e8e8'
    t.fillRect(0, 0, size * 2, size * 2)
    t.fillStyle = '#c8c8c8'
    t.fillRect(0, 0, size, size)
    t.fillRect(size, size, size, size)
  }
  return ctx.createPattern(checkerTile, 'repeat')!
}

function handlePositions(r: Rect): [number, number][] {
  const mx = r.x + r.width / 2
  const my = r.y + r.height / 2
  return [
    [r.x, r.y],
    [mx, r.y],
    [r.x + r.width, r.y],
    [r.x + r.width, my],
    [r.x + r.width, r.y + r.height],
    [mx, r.y + r.height],
    [r.x, r.y + r.height],
    [r.x, my],
  ]
}

/** Which crop handle (or the inside, to move) a photo-space point is on. */
function hitCropHandle(rect: Rect, p: Point, zoom: number): CropHandle | null {
  const tol = (HANDLE + 6) / zoom
  const left = Math.abs(p.x - rect.x) <= tol
  const right = Math.abs(p.x - (rect.x + rect.width)) <= tol
  const top = Math.abs(p.y - rect.y) <= tol
  const bottom = Math.abs(p.y - (rect.y + rect.height)) <= tol
  const withinX = p.x >= rect.x - tol && p.x <= rect.x + rect.width + tol
  const withinY = p.y >= rect.y - tol && p.y <= rect.y + rect.height + tol
  if (!withinX || !withinY) return null
  const v = top ? 'n' : bottom ? 's' : ''
  const h = left ? 'w' : right ? 'e' : ''
  if (v || h) return `${v}${h}` as CropHandle
  return 'move'
}
