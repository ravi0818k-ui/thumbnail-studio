import type { RemoveResponse } from '../workers/bgRemove.worker'
import BgWorker from '../workers/bgRemove.worker?worker'
import { registerBlob, type LoadedAsset } from './assets'

/**
 * Two engines, one interface:
 *
 * - `ai`   — the ISNet segmentation model via @imgly/background-removal, running
 *            on ONNX Runtime Web. Handles photographic backgrounds, hair and
 *            subjects that touch the frame. The model is fetched once and then
 *            cached by the browser.
 * - `fast` — the built-in flood fill (src/engine/cutout.ts). Instant, tiny, and
 *            always available offline; best on flat or smoothly graded backdrops.
 *
 * Both run off the main thread and neither uploads the image anywhere.
 */
export type RemovalMode = 'ai' | 'fast'

export interface RemoveOptions {
  mode: RemovalMode
  /** `fast` only: colour distance that still counts as background. */
  tolerance: number
  /** `fast` only: edge softening in pixels. */
  feather: number
  onProgress?: (progress: number, stage: string) => void
}

/**
 * Where the model and ONNX runtime are loaded from. Unset means the library's
 * own CDN; `npm run fetch-model` populates `public/bg-model/` and you then set
 * VITE_BG_MODEL_PATH=/bg-model/ to run fully offline.
 */
const MODEL_PATH = (import.meta.env.VITE_BG_MODEL_PATH as string | undefined) || undefined

/** Largest dimension the fast path processes; bigger sources are downscaled. */
const MAX_EDGE = 1600

export function removeBackground(asset: LoadedAsset, options: RemoveOptions): Promise<LoadedAsset> {
  return options.mode === 'ai' ? removeBackgroundAI(asset, options) : removeBackgroundFast(asset, options)
}

// --------------------------------------------------------------- AI engine --

let modelWarmed = false

/** True once the model has been fetched in this session (later runs are quick). */
export function isModelWarm(): boolean {
  return modelWarmed
}

async function removeBackgroundAI(asset: LoadedAsset, options: RemoveOptions): Promise<LoadedAsset> {
  // Loaded on demand so the editor starts without paying for the runtime.
  const { removeBackground: segment } = await import('@imgly/background-removal')
  const blob = await segment(asset.blob, {
    publicPath: MODEL_PATH,
    model: 'isnet_quint8',
    output: { format: 'image/png' },
    progress: (key: string, current: number, total: number) => {
      options.onProgress?.(total > 0 ? current / total : 0, stageLabel(key))
    },
  })
  modelWarmed = true
  options.onProgress?.(1, 'Done')
  return registerBlob(blob, `${asset.name} (cutout)`)
}

function stageLabel(key: string): string {
  if (key.startsWith('fetch')) return key.includes('onnxruntime') ? 'Downloading runtime' : 'Downloading model'
  if (key.startsWith('compute')) return 'Finding the subject'
  return 'Preparing'
}

// ------------------------------------------------------------- fast engine --

function toCanvas(asset: LoadedAsset): HTMLCanvasElement {
  const scale = Math.min(1, MAX_EDGE / Math.max(asset.width, asset.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(asset.width * scale)
  canvas.height = Math.round(asset.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(asset.bitmap, 0, 0, canvas.width, canvas.height)
  return canvas
}

function removeBackgroundFast(asset: LoadedAsset, options: RemoveOptions): Promise<LoadedAsset> {
  const canvas = toCanvas(asset)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)

  return new Promise((resolve, reject) => {
    const worker = new BgWorker()
    worker.onerror = (err) => {
      worker.terminate()
      reject(err)
    }
    worker.onmessage = async (event: MessageEvent<RemoveResponse>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        options.onProgress?.(msg.progress ?? 0, 'Tracing the background')
        return
      }
      worker.terminate()
      const result = new ImageData(new Uint8ClampedArray(msg.buffer!), msg.width!, msg.height!)
      const out = document.createElement('canvas')
      out.width = result.width
      out.height = result.height
      out.getContext('2d')!.putImageData(result, 0, 0)
      const blob = await new Promise<Blob>((res) => out.toBlob((b) => res(b!), 'image/png'))
      resolve(await registerBlob(blob, `${asset.name} (cutout)`))
    }
    const buffer = image.data.buffer
    worker.postMessage(
      {
        type: 'remove',
        width: image.width,
        height: image.height,
        buffer,
        tolerance: options.tolerance,
        feather: options.feather,
      },
      [buffer],
    )
  })
}

// ---------------------------------------------------------------------------
// Erase / restore brush. Works on a persistent canvas per cutout asset so a
// stroke never has to re-decode the image.
// ---------------------------------------------------------------------------

const brushCanvases = new Map<string, HTMLCanvasElement>()

export function getBrushCanvas(asset: LoadedAsset): HTMLCanvasElement {
  const existing = brushCanvases.get(asset.id)
  if (existing) return existing
  const canvas = document.createElement('canvas')
  canvas.width = asset.width
  canvas.height = asset.height
  canvas.getContext('2d')!.drawImage(asset.bitmap, 0, 0)
  brushCanvases.set(asset.id, canvas)
  return canvas
}

export function forgetBrushCanvas(assetId: string): void {
  brushCanvases.delete(assetId)
}

export interface BrushStroke {
  from: { x: number; y: number }
  to: { x: number; y: number }
  radius: number
  mode: 'erase' | 'restore'
}

// ---------------------------------------------------------------------------
// Clean brush. Rather than erasing pixels under the cursor, the stroke is
// collected as a coverage mask at asset resolution and handed to the Python
// matte pass on pointer-up: one stroke is one analysis, one new asset and one
// undo step. Nothing is destroyed while the pointer is down.
// ---------------------------------------------------------------------------

export function createStrokeMask(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export function paintMaskStroke(canvas: HTMLCanvasElement, stroke: Omit<BrushStroke, 'mode'>): void {
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.lineWidth = stroke.radius * 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(stroke.from.x, stroke.from.y)
  // A click that never moves still has to leave a dab, and a zero-length
  // subpath is not reliably painted even with a round cap.
  const still = stroke.from.x === stroke.to.x && stroke.from.y === stroke.to.y
  ctx.lineTo(stroke.to.x + (still ? 0.01 : 0), stroke.to.y)
  ctx.stroke()
  ctx.restore()
}

/** One byte of coverage per pixel, which is what the Python side expects. */
export function strokeMaskBytes(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const out = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3]
  return out
}

/** Paints one segment; `source` supplies pixels for restore. */
export function paintStroke(canvas: HTMLCanvasElement, stroke: BrushStroke, source: LoadedAsset | null): void {
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.lineWidth = stroke.radius * 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(stroke.from.x, stroke.from.y)
  ctx.lineTo(stroke.to.x, stroke.to.y)
  if (stroke.mode === 'erase') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.stroke()
  } else if (source) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.save()
    ctx.clip(strokePath(stroke))
    ctx.drawImage(source.bitmap, 0, 0, canvas.width, canvas.height)
    ctx.restore()
  }
  ctx.restore()
}

function strokePath(stroke: BrushStroke): Path2D {
  const p = new Path2D()
  p.arc(stroke.from.x, stroke.from.y, stroke.radius, 0, Math.PI * 2)
  p.arc(stroke.to.x, stroke.to.y, stroke.radius, 0, Math.PI * 2)
  const angle = Math.atan2(stroke.to.y - stroke.from.y, stroke.to.x - stroke.from.x) + Math.PI / 2
  const ox = Math.cos(angle) * stroke.radius
  const oy = Math.sin(angle) * stroke.radius
  p.moveTo(stroke.from.x + ox, stroke.from.y + oy)
  p.lineTo(stroke.to.x + ox, stroke.to.y + oy)
  p.lineTo(stroke.to.x - ox, stroke.to.y - oy)
  p.lineTo(stroke.from.x - ox, stroke.from.y - oy)
  p.closePath()
  return p
}

export async function canvasToAsset(canvas: HTMLCanvasElement, name: string): Promise<LoadedAsset> {
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
  return registerBlob(blob, name)
}
