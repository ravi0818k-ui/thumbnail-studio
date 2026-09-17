import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import type { ImageObject, SceneObject, TextObject } from '../types'
import { renderProject } from '../engine/renderer'
import {
  boundingRect,
  cursorForHandle,
  handlePoints,
  hitTest,
  objectCenter,
  rotatePoint,
  toRadians,
  type HandleId,
  type Point,
  type Rect,
} from '../engine/geometry'
import { applyCropRect, cropFromBox, fullFrameRect, panCrop } from '../engine/crop'
import { onAssetsChanged, getLoadedAsset } from '../engine/assets'
import { autoSizePatch } from '../engine/text'
import { fontStack } from '../data/fonts'
import {
  createStrokeMask,
  getBrushCanvas,
  paintMaskStroke,
  paintStroke,
  strokeMaskBytes,
} from '../engine/backgroundRemoval'
import { cleanMatte, DEFAULT_CLEAN, onPythonStatus, pythonStatus } from '../engine/pythonImage'
import { runFocus } from '../engine/runFocus'
import type { FocusSelection } from '../engine/objectMask'
import { updateAssetFromCanvas } from '../engine/assets'
import ContextMenu, { type ContextMenuState } from './ContextMenu'
import { safeZoneRects } from '../data/formats'

type Drag =
  | { kind: 'none' }
  | { kind: 'move'; start: Point; originals: Map<string, { x: number; y: number }> }
  | {
      kind: 'resize'
      handle: HandleId
      id: string
      start: SceneObject
      anchor: Point
    }
  | { kind: 'rotate'; id: string; center: Point; startAngle: number; startRotation: number }
  | { kind: 'marquee'; start: Point; current: Point }
  | { kind: 'brush'; last: Point; assetId: string; object: ImageObject }
  | {
      // One stroke collected as a coverage mask, handed to Python on pointer-up.
      // 'clean' drops the specks under it; 'blur' grows it into an object mask.
      kind: 'mask'
      job: 'clean' | 'blur'
      slot: 'asset' | 'cutout'
      last: Point
      assetId: string
      object: ImageObject
      mask: HTMLCanvasElement
      radius: number
    }
  | { kind: 'crop'; handle: HandleId; start: ImageObject; full: Rect; anchor: Point }
  | { kind: 'cropPan'; start: ImageObject; last: Point }

interface Guide {
  orientation: 'v' | 'h'
  position: number
}

const SNAP_THRESHOLD = 7

export default function CanvasStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag>({ kind: 'none' })
  const [guides, setGuides] = useState<Guide[]>([])
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  /** Clean-brush stroke, drawn as overlay only — nothing is erased until it ends. */
  const [strokePreview, setStrokePreview] = useState<Point[]>([])
  const [cursor, setCursor] = useState<Point | null>(null)
  const cleaningRef = useRef(false)
  const [, forceRender] = useState(0)

  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const zoom = useEditor((s) => s.zoom)
  const gridMode = useEditor((s) => s.gridMode)
  const showSafeZone = useEditor((s) => s.showSafeZone)
  const showGuides = useEditor((s) => s.showGuides)
  const snapping = useEditor((s) => s.snapping)
  const editingTextId = useEditor((s) => s.editingTextId)
  const eraseMode = useEditor((s) => s.eraseMode)
  const brushSize = useEditor((s) => s.brushSize)
  const croppingId = useEditor((s) => s.croppingId)
  const cropping = croppingId
    ? (project.objects.find((o) => o.id === croppingId) as ImageObject | undefined)
    : undefined

  // Redraw whenever a bitmap finishes decoding.
  useEffect(() => onAssetsChanged(() => forceRender((n) => n + 1)), [])

  // ---------------------------------------------------------------- render
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const scale = zoom * dpr
    const width = Math.round(project.width * scale)
    const height = Math.round(project.height * scale)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    const scene = editingTextId
      ? { ...project, objects: project.objects.map((o) => (o.id === editingTextId ? { ...o, hidden: true } : o)) }
      : project
    renderProject(ctx, scene, { scale })
    drawOverlay(ctx, scale)
  })

  const drawGrid = (ctx: CanvasRenderingContext2D, px: number) => {
    if (gridMode === 'none') return
    const { width, height } = project
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'
    ctx.lineWidth = px
    const verticals: number[] = []
    const horizontals: number[] = []
    if (gridMode === 'grid') {
      const step = width / 12
      for (let x = step; x < width; x += step) verticals.push(x)
      for (let y = step; y < height; y += step) horizontals.push(y)
    } else if (gridMode === 'thirds') {
      verticals.push(width / 3, (width * 2) / 3)
      horizontals.push(height / 3, (height * 2) / 3)
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    } else {
      verticals.push(width / 2)
      horizontals.push(height / 2)
      ctx.strokeStyle = 'rgba(79,140,255,0.6)'
    }
    for (const x of verticals) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (const y of horizontals) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  /**
   * Three regions from the spec: restricted (host UI may cover it), warning
   * (usable but crowded) and the clear safe area. Editor-only — the exporter
   * never sees this, because it lives outside renderProject.
   */
  const drawSafeZone = (ctx: CanvasRenderingContext2D, px: number) => {
    const { width, height } = project
    const { safe, warning } = safeZoneRects(project.safeZone, width, height)

    const cutout = (outer: { x: number; y: number; width: number; height: number }, inner: typeof outer, fill: string) => {
      const path = new Path2D()
      path.rect(outer.x, outer.y, outer.width, outer.height)
      path.rect(inner.x, inner.y, inner.width, inner.height)
      ctx.fillStyle = fill
      ctx.fill(path, 'evenodd')
    }

    ctx.save()
    cutout({ x: 0, y: 0, width, height }, warning, 'rgba(255,59,92,0.18)')
    cutout(warning, safe, 'rgba(245,165,36,0.16)')

    ctx.setLineDash([10 * px, 8 * px])
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = 'rgba(34,197,94,0.85)'
    ctx.strokeRect(safe.x, safe.y, safe.width, safe.height)
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(255,59,92,0.5)'
    ctx.lineWidth = px
    ctx.strokeRect(warning.x, warning.y, warning.width, warning.height)

    // Labels only when there is room to read them.
    const fontSize = Math.max(14, Math.min(28, height * 0.016))
    if (zoom > 0.18) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (warning.y > fontSize * 1.6) ctx.fillText('MAY BE COVERED', width / 2, warning.y / 2)
      if (height - (warning.y + warning.height) > fontSize * 1.6) {
        ctx.fillText('TITLE & CHANNEL ROW', width / 2, (warning.y + warning.height + height) / 2)
      }
      const rail = width - (warning.x + warning.width)
      if (rail > fontSize * 2.2) {
        ctx.save()
        ctx.translate(width - rail / 2, height / 2)
        ctx.rotate(Math.PI / 2)
        ctx.fillText('ACTION RAIL', 0, 0)
        ctx.restore()
      }
    }
    ctx.restore()
  }

  /**
   * Crop mode: the discarded part of the photo is shown ghosted outside the
   * crop box, so you can see what you are cutting away and pan it back.
   */
  const drawCropOverlay = (ctx: CanvasRenderingContext2D, obj: ImageObject, px: number) => {
    const full = fullFrameRect(obj)
    const asset = getLoadedAsset(obj.useCutout && obj.cutoutAssetId ? obj.cutoutAssetId : obj.assetId)
    const centre = objectCenter(obj)

    ctx.save()
    ctx.translate(centre.x, centre.y)
    ctx.rotate(toRadians(obj.rotation))
    ctx.translate(-centre.x, -centre.y)

    if (asset) {
      ctx.save()
      ctx.globalAlpha = 0.28
      ctx.translate(obj.flipH ? full.x * 2 + full.width : 0, obj.flipV ? full.y * 2 + full.height : 0)
      ctx.scale(obj.flipH ? -1 : 1, obj.flipV ? -1 : 1)
      ctx.drawImage(asset.bitmap, full.x, full.y, full.width, full.height)
      ctx.restore()
    }

    // Dim everything outside the crop box.
    const shade = new Path2D()
    shade.rect(full.x - 4, full.y - 4, full.width + 8, full.height + 8)
    shade.rect(obj.x, obj.y, obj.width, obj.height)
    ctx.fillStyle = 'rgba(6,8,12,0.55)'
    ctx.fill(shade, 'evenodd')

    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = px
    ctx.setLineDash([6 * px, 5 * px])
    ctx.strokeRect(full.x, full.y, full.width, full.height)
    ctx.setLineDash([])

    // Thirds inside the crop, the way every crop tool shows them.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    for (let i = 1; i < 3; i++) {
      const x = obj.x + (obj.width / 3) * i
      const y = obj.y + (obj.height / 3) * i
      ctx.beginPath()
      ctx.moveTo(x, obj.y)
      ctx.lineTo(x, obj.y + obj.height)
      ctx.moveTo(obj.x, y)
      ctx.lineTo(obj.x + obj.width, y)
      ctx.stroke()
    }

    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2 * px
    ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)

    // Corner brackets, which read as "crop" rather than "resize".
    const arm = Math.min(obj.width, obj.height) * 0.14
    ctx.lineWidth = 5 * px
    ctx.lineCap = 'square'
    const corners: [number, number, number, number][] = [
      [obj.x, obj.y, 1, 1],
      [obj.x + obj.width, obj.y, -1, 1],
      [obj.x + obj.width, obj.y + obj.height, -1, -1],
      [obj.x, obj.y + obj.height, 1, -1],
    ]
    for (const [cx, cy, sx, sy] of corners) {
      ctx.beginPath()
      ctx.moveTo(cx + sx * arm, cy)
      ctx.lineTo(cx, cy)
      ctx.lineTo(cx, cy + sy * arm)
      ctx.stroke()
    }

    // Edge grips.
    ctx.fillStyle = '#ffffff'
    const grip = 4 * px
    const edges: [number, number][] = [
      [obj.x + obj.width / 2, obj.y],
      [obj.x + obj.width, obj.y + obj.height / 2],
      [obj.x + obj.width / 2, obj.y + obj.height],
      [obj.x, obj.y + obj.height / 2],
    ]
    for (const [ex, ey] of edges) {
      ctx.beginPath()
      ctx.arc(ex, ey, grip, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  const drawOverlay = (ctx: CanvasRenderingContext2D, scale: number) => {
    const selected = project.objects.filter((o) => selection.includes(o.id))
    ctx.save()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    const px = 1 / zoom

    drawGrid(ctx, px)
    if (showSafeZone) drawSafeZone(ctx, px)

    if (cropping) {
      drawCropOverlay(ctx, cropping, px)
      ctx.restore()
      return
    }

    for (const obj of selected) {
      ctx.save()
      ctx.translate(obj.x + obj.width / 2, obj.y + obj.height / 2)
      ctx.rotate(toRadians(obj.rotation))
      ctx.strokeStyle = '#ff3b5c'
      ctx.lineWidth = 1.6 * px
      ctx.strokeRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height)
      ctx.restore()
    }

    if (selected.length === 1 && !editingTextId && eraseMode === 'off') {
      const obj = selected[0]
      const points = handlePoints(obj, 26 / zoom)
      const size = 8 * px
      ctx.save()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#ff3b5c'
      ctx.lineWidth = 1.6 * px
      const center = objectCenter(obj)
      const top = rotatePoint({ x: center.x, y: obj.y }, center, obj.rotation)
      ctx.beginPath()
      ctx.moveTo(top.x, top.y)
      ctx.lineTo(points.rotate.x, points.rotate.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(points.rotate.x, points.rotate.y, size * 0.7, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      for (const key of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as HandleId[]) {
        const p = points[key]
        ctx.beginPath()
        ctx.rect(p.x - size / 2, p.y - size / 2, size, size)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }

    if (guides.length > 0) {
      ctx.save()
      ctx.strokeStyle = '#4f8cff'
      ctx.lineWidth = px
      ctx.setLineDash([5 * px, 4 * px])
      for (const g of guides) {
        ctx.beginPath()
        if (g.orientation === 'v') {
          ctx.moveTo(g.position, 0)
          ctx.lineTo(g.position, project.height)
        } else {
          ctx.moveTo(0, g.position)
          ctx.lineTo(project.width, g.position)
        }
        ctx.stroke()
      }
      ctx.restore()
    }

    // Brush chrome: the stroke being collected, and a ring showing its size.
    if (eraseMode !== 'off') {
      const radius = brushSize / 2
      ctx.save()
      if (strokePreview.length > 0) {
        ctx.strokeStyle = 'rgba(79,140,255,0.45)'
        ctx.lineWidth = brushSize
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(strokePreview[0].x, strokePreview[0].y)
        for (const pt of strokePreview.slice(1)) ctx.lineTo(pt.x, pt.y)
        if (strokePreview.length === 1) ctx.lineTo(strokePreview[0].x + 0.01, strokePreview[0].y)
        ctx.stroke()
      }
      if (cursor) {
        ctx.beginPath()
        ctx.arc(cursor.x, cursor.y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.lineWidth = 2.4 * px
        ctx.stroke()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.2 * px
        ctx.stroke()
      }
      ctx.restore()
    }

    if (marquee) {
      ctx.save()
      ctx.fillStyle = 'rgba(79,140,255,0.16)'
      ctx.strokeStyle = '#4f8cff'
      ctx.lineWidth = px
      ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h)
      ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h)
      ctx.restore()
    }

    ctx.restore()
  }

  // ------------------------------------------------------------ pointer io
  const toScene = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = hostRef.current!.getBoundingClientRect()
      return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom }
    },
    [zoom],
  )

  const hitHandle = (p: Point): HandleId | null => {
    const state = useEditor.getState()
    if (state.selection.length !== 1 || state.eraseMode !== 'off') return null
    const obj = state.project.objects.find((o) => o.id === state.selection[0])
    if (!obj || obj.locked) return null
    const points = handlePoints(obj, 26 / zoom)
    const tolerance = 9 / zoom
    for (const key of Object.keys(points) as HandleId[]) {
      const hp = points[key]
      if (Math.abs(hp.x - p.x) <= tolerance && Math.abs(hp.y - p.y) <= tolerance) return key
    }
    return null
  }

  const topmostAt = (p: Point): SceneObject | null => {
    const objects = useEditor.getState().project.objects
    for (let i = objects.length - 1; i >= 0; i--) {
      if (hitTest(p, objects[i])) return objects[i]
    }
    return null
  }

  /** Selecting one member of a group selects the whole group. */
  const expandGroup = (obj: SceneObject): string[] => {
    if (!obj.groupId) return [obj.id]
    return useEditor.getState().project.objects.filter((o) => o.groupId === obj.groupId).map((o) => o.id)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const state = useEditor.getState()
    const p = toScene(e)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    if (state.eraseMode !== 'off') {
      const obj = state.project.objects.find((o) => o.id === state.selection[0])
      if (obj && obj.type === 'image') {
        const cut = !!obj.cutoutAssetId && obj.useCutout
        if (state.eraseMode === 'blur') {
          // The blur is a selection, not an eraser, so it works on whatever is
          // on screen — a cut-out layer or a plain photograph.
          startMaskStroke(obj, cut ? obj.cutoutAssetId! : obj.assetId, cut ? 'cutout' : 'asset', 'blur', p)
        } else if (cut) {
          if (state.eraseMode === 'clean') startMaskStroke(obj, obj.cutoutAssetId!, 'cutout', 'clean', p)
          else {
            state.pushHistory('brush')
            dragRef.current = { kind: 'brush', last: p, assetId: obj.cutoutAssetId!, object: obj }
            paintAt(obj, obj.cutoutAssetId!, p, p)
          }
        }
      }
      return
    }

    if (cropping) {
      const handle = cropHandleAt(p, cropping)
      if (handle) {
        dragRef.current = {
          kind: 'crop',
          handle,
          start: cropping,
          full: fullFrameRect(cropping),
          anchor: anchorFor(cropping, handle),
        }
      } else {
        dragRef.current = { kind: 'cropPan', start: cropping, last: p }
      }
      return
    }

    const handle = hitHandle(p)
    if (handle) {
      const obj = state.project.objects.find((o) => o.id === state.selection[0])!
      state.pushHistory()
      if (handle === 'rotate') {
        const center = objectCenter(obj)
        dragRef.current = {
          kind: 'rotate',
          id: obj.id,
          center,
          startAngle: Math.atan2(p.y - center.y, p.x - center.x),
          startRotation: obj.rotation,
        }
      } else {
        dragRef.current = { kind: 'resize', handle, id: obj.id, start: obj, anchor: anchorFor(obj, handle) }
      }
      return
    }

    const hit = topmostAt(p)
    if (!hit) {
      if (!e.shiftKey) state.select([])
      dragRef.current = { kind: 'marquee', start: p, current: p }
      setMarquee({ x: p.x, y: p.y, w: 0, h: 0 })
      return
    }

    const ids = expandGroup(hit)
    let nextSelection = state.selection
    if (e.shiftKey) {
      nextSelection = state.selection.includes(hit.id)
        ? state.selection.filter((id) => !ids.includes(id))
        : [...state.selection, ...ids]
      state.select(nextSelection)
    } else if (!state.selection.includes(hit.id)) {
      nextSelection = ids
      state.select(ids)
    }

    state.pushHistory()
    const originals = new Map<string, { x: number; y: number }>()
    useEditor
      .getState()
      .project.objects.filter((o) => nextSelection.includes(o.id) && !o.locked)
      .forEach((o) => originals.set(o.id, { x: o.x, y: o.y }))
    dragRef.current = { kind: 'move', start: p, originals }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    const state = useEditor.getState()
    const p = toScene(e)

    // The clean brush is sized in scene units, so it needs a visible ring.
    if (state.eraseMode !== 'off') setCursor(p)
    else if (cursor) setCursor(null)

    if (drag.kind === 'none') {
      const handle = hitHandle(p)
      const host = hostRef.current
      if (host) {
        if (cropping) {
          const cropHandle = cropHandleAt(p, cropping)
          host.style.cursor = cropHandle ? cursorForHandle(cropHandle, cropping.rotation) : 'move'
        } else if (state.eraseMode !== 'off') host.style.cursor = 'crosshair'
        else if (handle) {
          const obj = state.project.objects.find((o) => o.id === state.selection[0])
          host.style.cursor = cursorForHandle(handle, obj?.rotation ?? 0)
        } else host.style.cursor = topmostAt(p) ? 'move' : 'default'
      }
      return
    }

    switch (drag.kind) {
      case 'move': {
        let dx = p.x - drag.start.x
        let dy = p.y - drag.start.y
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        const moving = state.project.objects.filter((o) => drag.originals.has(o.id))
        if (snapping && moving.length > 0) {
          const snap = computeSnap(moving, drag.originals, dx, dy, state.project, zoom)
          dx = snap.dx
          dy = snap.dy
          setGuides(showGuides ? snap.guides : [])
        }
        const objects = state.project.objects.map((o) => {
          const start = drag.originals.get(o.id)
          return start ? { ...o, x: Math.round(start.x + dx), y: Math.round(start.y + dy) } : o
        })
        useEditor.setState({ project: { ...state.project, objects, updatedAt: Date.now() }, dirty: true })
        break
      }
      case 'resize': {
        applyResize(drag, p, e.shiftKey)
        break
      }
      case 'rotate': {
        const angle = Math.atan2(p.y - drag.center.y, p.x - drag.center.x)
        let deg = drag.startRotation + ((angle - drag.startAngle) * 180) / Math.PI
        if (e.shiftKey) deg = Math.round(deg / 15) * 15
        state.updateObject(drag.id, { rotation: Math.round(deg * 10) / 10 })
        break
      }
      case 'marquee': {
        const rect = {
          x: Math.min(drag.start.x, p.x),
          y: Math.min(drag.start.y, p.y),
          w: Math.abs(p.x - drag.start.x),
          h: Math.abs(p.y - drag.start.y),
        }
        dragRef.current = { ...drag, current: p }
        setMarquee(rect)
        const ids = state.project.objects
          .filter((o) => !o.locked && !o.hidden)
          .filter((o) => {
            const b = boundingRect([o])!
            return !(b.x + b.width < rect.x || rect.x + rect.w < b.x || b.y + b.height < rect.y || rect.y + rect.h < b.y)
          })
          .map((o) => o.id)
        state.select(ids)
        break
      }
      case 'brush': {
        paintAt(drag.object, drag.assetId, drag.last, p)
        dragRef.current = { ...drag, last: p }
        break
      }
      case 'mask': {
        paintMaskStroke(drag.mask, { from: toAssetPoint(drag.object, drag.mask, drag.last), to: toAssetPoint(drag.object, drag.mask, p), radius: drag.radius })
        dragRef.current = { ...drag, last: p }
        setStrokePreview((prev) => [...prev, p])
        break
      }
      case 'crop': {
        applyCropDrag(drag, p)
        break
      }
      case 'cropPan': {
        const current = state.project.objects.find((o) => o.id === drag.start.id) as ImageObject | undefined
        if (!current) break
        // Pointer delta in the layer's own axes, so panning follows the drag
        // even on a rotated layer.
        const delta = rotatePoint({ x: p.x - drag.last.x, y: p.y - drag.last.y }, { x: 0, y: 0 }, -current.rotation)
        state.updateObject<ImageObject>(current.id, { crop: panCrop(current, delta.x, delta.y) })
        dragRef.current = { ...drag, last: p }
        break
      }
    }
  }

  const onPointerUp = () => {
    const drag = dragRef.current
    dragRef.current = { kind: 'none' }
    setGuides([])
    setMarquee(null)
    if (drag.kind === 'brush') {
      const asset = getLoadedAsset(drag.assetId)
      if (asset) void updateAssetFromCanvas(drag.assetId, getBrushCanvas(asset), true)
    }
    if (drag.kind === 'mask') void finishMaskStroke(drag)
  }

  // ---------------------------------------------------- clean / mask brush
  /** Scene point to a pixel in the cut-out asset, through crop, flips and rotation. */
  const toAssetPoint = (obj: ImageObject, canvas: { width: number; height: number }, pt: Point): Point => {
    const local = rotatePoint(pt, objectCenter(obj), -obj.rotation)
    let lx = (local.x - obj.x) / obj.width
    let ly = (local.y - obj.y) / obj.height
    if (obj.flipH) lx = 1 - lx
    if (obj.flipV) ly = 1 - ly
    return {
      x: (obj.crop.x + lx * obj.crop.width) * canvas.width,
      y: (obj.crop.y + ly * obj.crop.height) * canvas.height,
    }
  }

  const startMaskStroke = (
    obj: ImageObject,
    assetId: string,
    slot: 'asset' | 'cutout',
    job: 'clean' | 'blur',
    p: Point,
  ) => {
    const asset = getLoadedAsset(assetId)
    // A second stroke while the first is still in Python would be applied to
    // the asset the first one is about to replace. A stale error message, on
    // the other hand, must not block a retry.
    if (!asset || cleaningRef.current) return
    useEditor.getState().setBrushStatus(null)
    const mask = createStrokeMask(asset.width, asset.height)
    const radius = (brushSize / 2 / obj.width) * asset.width * obj.crop.width
    paintMaskStroke(mask, { from: toAssetPoint(obj, mask, p), to: toAssetPoint(obj, mask, p), radius })
    dragRef.current = { kind: 'mask', job, slot, last: p, assetId, object: obj, mask, radius }
    setStrokePreview([p])
  }

  /**
   * One stroke, one Python pass, one new asset — so a clean is undoable and the
   * previous cut-out is still there (assets are never mutated here).
   */
  const finishMaskStroke = async (drag: Extract<Drag, { kind: 'mask' }>) => {
    const asset = getLoadedAsset(drag.assetId)
    const store = useEditor.getState()
    if (!asset) {
      setStrokePreview([])
      return
    }
    cleaningRef.current = true
    const ready = pythonStatus().status === 'ready'
    const working = drag.job === 'blur' ? 'Finding the object…' : 'Cleaning…'
    store.setBrushStatus(ready ? working : 'Starting the Python engine…')
    // The first stroke of a session pays for the runtime download; say so.
    const unsubscribe = onPythonStatus(() => {
      const engine = pythonStatus()
      if (engine.status !== 'ready') useEditor.getState().setBrushStatus(`${engine.stage}…`)
    })
    try {
      if (drag.job === 'blur') {
        // The scribble is kept, not just its result: the strength can then be
        // changed from the bar without drawing the selection again.
        const selection: FocusSelection = {
          objectId: drag.object.id,
          sourceAssetId: drag.assetId,
          slot: drag.slot,
          region: strokeMaskBytes(drag.mask),
        }
        const blurred = await runFocus(selection, useEditor.getState().focus)
        const state = useEditor.getState()
        if (blurred) {
          state.pushHistory()
          state.updateObject<ImageObject>(
            drag.object.id,
            drag.slot === 'cutout' ? { cutoutAssetId: blurred.id } : { assetId: blurred.id },
          )
          state.setFocusSelection(selection)
        }
        state.setBrushStatus(null)
      } else {
        const cleaned = await cleanMatte(asset, {
          ...DEFAULT_CLEAN,
          // Anything loose and smaller than the brush itself goes; the subject
          // is the largest island and is never a candidate.
          minArea: Math.PI * drag.radius * drag.radius,
          region: strokeMaskBytes(drag.mask),
        })
        const state = useEditor.getState()
        state.pushHistory()
        state.updateObject<ImageObject>(drag.object.id, { cutoutAssetId: cleaned.id, useCutout: true })
        state.setBrushStatus(null)
      }
    } catch (error) {
      console.warn('Mask brush failed', error)
      store.setBrushStatus('The Python engine could not run — check your connection and try again.')
    } finally {
      cleaningRef.current = false
      unsubscribe()
      setStrokePreview([])
    }
  }

  const paintAt = (obj: ImageObject, assetId: string, from: Point, to: Point) => {
    const asset = getLoadedAsset(assetId)
    if (!asset) return
    const canvas = getBrushCanvas(asset)
    const radius = (brushSize / 2 / obj.width) * canvas.width * obj.crop.width
    paintStroke(canvas, {
      from: toAssetPoint(obj, canvas, from),
      to: toAssetPoint(obj, canvas, to),
      radius,
      mode: useEditor.getState().eraseMode === 'restore' ? 'restore' : 'erase',
    }, getLoadedAsset(obj.assetId))
    void updateAssetFromCanvas(assetId, canvas)
  }

  /** Crop handles are the object's own handles, minus rotate. */
  const cropHandleAt = (p: Point, obj: ImageObject): HandleId | null => {
    const points = handlePoints(obj)
    const tolerance = 12 / zoom
    for (const key of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as HandleId[]) {
      const hp = points[key]
      if (Math.abs(hp.x - p.x) <= tolerance && Math.abs(hp.y - p.y) <= tolerance) return key
    }
    return null
  }

  /**
   * Dragging a crop handle moves that edge of the crop box within the fixed
   * full frame; the box and the crop are then updated together so the surviving
   * pixels stay put.
   */
  const applyCropDrag = (drag: Extract<Drag, { kind: 'crop' }>, pointer: Point) => {
    const obj = drag.start
    const local = rotatePoint(pointer, drag.anchor, -obj.rotation)
    const signX = drag.handle.includes('e') ? 1 : drag.handle.includes('w') ? -1 : 0
    const signY = drag.handle.includes('s') ? 1 : drag.handle.includes('n') ? -1 : 0

    const width = signX === 0 ? obj.width : Math.max(8, (local.x - drag.anchor.x) * signX)
    const height = signY === 0 ? obj.height : Math.max(8, (local.y - drag.anchor.y) * signY)
    const box = {
      x: signX < 0 ? drag.anchor.x - width : drag.anchor.x,
      y: signY < 0 ? drag.anchor.y - height : drag.anchor.y,
      width,
      height,
    }
    // Keep the box inside the photo: you cannot crop to empty space.
    const clamped = {
      x: Math.max(drag.full.x, Math.min(box.x, drag.full.x + drag.full.width - 8)),
      y: Math.max(drag.full.y, Math.min(box.y, drag.full.y + drag.full.height - 8)),
      width: 0,
      height: 0,
    }
    clamped.width = Math.min(box.x + box.width, drag.full.x + drag.full.width) - clamped.x
    clamped.height = Math.min(box.y + box.height, drag.full.y + drag.full.height) - clamped.y

    useEditor.getState().updateObject<ImageObject>(obj.id, applyCropRect(obj, cropFromBox(obj, clamped)))
  }

  const applyResize = (drag: Extract<Drag, { kind: 'resize' }>, pointer: Point, keepAspect: boolean) => {
    const obj = drag.start
    const state = useEditor.getState()
    const rotation = obj.rotation
    const anchor = drag.anchor
    // Work in a frame rotated so the object is axis-aligned and the anchor is
    // fixed; the new box is then a plain rectangle growing away from it.
    const local = rotatePoint(pointer, anchor, -rotation)
    const signX = drag.handle.includes('e') ? 1 : drag.handle.includes('w') ? -1 : 0
    const signY = drag.handle.includes('s') ? 1 : drag.handle.includes('n') ? -1 : 0

    let width = signX === 0 ? obj.width : Math.max(8, (local.x - anchor.x) * signX)
    let height = signY === 0 ? obj.height : Math.max(8, (local.y - anchor.y) * signY)

    const corner = signX !== 0 && signY !== 0
    const proportionalByDefault = obj.type === 'image' || obj.type === 'text'
    if (corner && (proportionalByDefault ? !keepAspect : keepAspect)) {
      const aspect = obj.width / obj.height
      if (width / height > aspect) width = height * aspect
      else height = width / aspect
    }

    const x0 = signX < 0 ? anchor.x - width : anchor.x
    const y0 = signY < 0 ? anchor.y - height : anchor.y
    const center = rotatePoint({ x: x0 + width / 2, y: y0 + height / 2 }, anchor, rotation)

    const patch: Record<string, unknown> = {
      width: Math.round(width),
      height: Math.round(height),
      x: Math.round(center.x - width / 2),
      y: Math.round(center.y - height / 2),
    }
    if (obj.type === 'text') {
      // With Auto Fit on, the box drives the size; otherwise a corner drag
      // scales the type the way every design tool does.
      if (corner && obj.autoFit === 'off') {
        const factor = height / obj.height
        patch.fontSize = Math.max(6, Math.round(obj.fontSize * factor))
      } else if (signY !== 0 && obj.autoFit !== 'box') {
        patch.autoHeight = false
      }
    }
    state.updateObject(obj.id, patch)
    if (obj.type === 'text') {
      const next = useEditor.getState().project.objects.find((o) => o.id === obj.id) as TextObject
      const sized = autoSizePatch(next)
      if (Object.keys(sized).length > 0) state.updateObject(obj.id, sized)
    }
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const state = useEditor.getState()
    const hit = topmostAt(toScene(e))
    if (hit && !state.selection.includes(hit.id)) state.select(expandGroup(hit))
    if (!hit) state.select([])
    setMenu({ x: e.clientX, y: e.clientY, objectId: hit?.id ?? null })
  }

  const onDoubleClick = (e: React.PointerEvent) => {
    const p = toScene(e)
    if (cropping) {
      useEditor.getState().endCrop(true)
      return
    }
    const hit = topmostAt(p)
    // Double-clicking a photo is the standard way into a crop.
    if (hit?.type === 'image' && hit.assetId) {
      useEditor.getState().startCrop(hit.id)
      return
    }
    if (hit?.type === 'text') {
      useEditor.getState().select([hit.id])
      useEditor.getState().setEditingText(hit.id)
    }
  }

  // Ctrl/⌘ + wheel zooms, like every other design tool.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const state = useEditor.getState()
      state.setZoom(state.zoom * (e.deltaY > 0 ? 0.92 : 1.08))
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  const editing = editingTextId ? (project.objects.find((o) => o.id === editingTextId) as TextObject | undefined) : undefined

  return (
    <div className="stage" ref={stageRef} style={{ overflow: 'auto', padding: 28 }}>
      <div
        ref={hostRef}
        className="canvas-host"
        style={{ width: project.width * zoom, height: project.height * zoom }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={onDoubleClick as unknown as React.MouseEventHandler}
        onContextMenu={onContextMenu}
      >
        <canvas ref={canvasRef} />
        {editing && <TextEditorOverlay object={editing} zoom={zoom} />}
      </div>
      {menu && <ContextMenu state={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

function anchorFor(obj: SceneObject, handle: HandleId): Point {
  // The opposite corner/edge stays put while resizing.
  const x = handle.includes('w') ? obj.x + obj.width : obj.x
  const y = handle.includes('n') ? obj.y + obj.height : obj.y
  return { x, y }
}

function computeSnap(
  moving: SceneObject[],
  originals: Map<string, { x: number; y: number }>,
  dx: number,
  dy: number,
  project: { width: number; height: number; objects: SceneObject[] },
  zoom: number,
): { dx: number; dy: number; guides: Guide[] } {
  const threshold = SNAP_THRESHOLD / zoom
  const movingIds = new Set(moving.map((o) => o.id))
  const proposed = moving.map((o) => {
    const start = originals.get(o.id)!
    return { ...o, x: start.x + dx, y: start.y + dy }
  })
  const bounds = boundingRect(proposed)!

  const targetsV = [0, project.width / 2, project.width]
  const targetsH = [0, project.height / 2, project.height]
  for (const other of project.objects) {
    if (movingIds.has(other.id) || other.hidden) continue
    const b = boundingRect([other])!
    targetsV.push(b.x, b.x + b.width / 2, b.x + b.width)
    targetsH.push(b.y, b.y + b.height / 2, b.y + b.height)
  }

  const guides: Guide[] = []
  let bestV: { delta: number; position: number } | null = null
  for (const edge of [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width]) {
    for (const target of targetsV) {
      const delta = target - edge
      if (Math.abs(delta) <= threshold && (!bestV || Math.abs(delta) < Math.abs(bestV.delta))) {
        bestV = { delta, position: target }
      }
    }
  }
  let bestH: { delta: number; position: number } | null = null
  for (const edge of [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height]) {
    for (const target of targetsH) {
      const delta = target - edge
      if (Math.abs(delta) <= threshold && (!bestH || Math.abs(delta) < Math.abs(bestH.delta))) {
        bestH = { delta, position: target }
      }
    }
  }
  if (bestV) {
    dx += bestV.delta
    guides.push({ orientation: 'v', position: bestV.position })
  }
  if (bestH) {
    dy += bestH.delta
    guides.push({ orientation: 'h', position: bestH.position })
  }
  return { dx, dy, guides }
}

function TextEditorOverlay({ object, zoom }: { object: TextObject; zoom: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [object.id])

  const pad = object.bgEnabled ? object.bgPadding : 0
  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={object.text}
      style={{
        left: object.x * zoom,
        top: object.y * zoom,
        width: object.width * zoom,
        height: object.height * zoom,
        padding: pad * zoom,
        fontFamily: fontStack(object.fontFamily),
        fontSize: object.fontSize * zoom,
        fontWeight: object.fontWeight,
        fontStyle: object.italic ? 'italic' : 'normal',
        lineHeight: `${object.fontSize * object.lineHeight * zoom}px`,
        letterSpacing: object.letterSpacing * zoom,
        textAlign: object.align,
        textTransform: object.uppercase ? 'uppercase' : 'none',
        color: object.color === 'transparent' ? '#ffffff' : object.color,
        transform: `rotate(${object.rotation}deg)`,
        transformOrigin: 'center',
      }}
      onChange={(e) => {
        const state = useEditor.getState()
        state.pushHistory(`text:${object.id}`)
        state.updateObject(object.id, { text: e.target.value })
        const next = useEditor.getState().project.objects.find((o) => o.id === object.id) as TextObject
        const sized = autoSizePatch(next)
        if (Object.keys(sized).length > 0) state.updateObject(object.id, sized)
      }}
      onBlur={() => useEditor.getState().setEditingText(null)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') useEditor.getState().setEditingText(null)
      }}
    />
  )
}
