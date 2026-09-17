import PyWorker from '../workers/pyImage.worker?worker'
import type { PyResponse } from '../workers/pyImage.worker'
import { registerBlob, type LoadedAsset } from './assets'

// ---------------------------------------------------------------------------
// Main-thread client for the Python image engine. The worker (and the ~15 MB
// runtime behind it) is only created when a creator actually asks for one of
// these operations, so the editor still starts instantly.
// ---------------------------------------------------------------------------

export type PythonOp =
  | 'auto'
  | 'clahe'
  | 'white_balance'
  | 'levels'
  | 'sharpen'
  | 'denoise'
  | 'upscale'
  | 'tone'
  | 'temperature'
  | 'despeckle'
  | 'defringe'
  | 'clean_matte'
  | 'focus_blur'

export interface PythonEnhancement {
  id: string
  label: string
  op: PythonOp
  hint: string
  params?: Record<string, number>
}

/** The line-up shown in the panel, tuned for thumbnail and Shorts artwork. */
export const ENHANCEMENTS: PythonEnhancement[] = [
  { id: 'auto', label: 'Auto enhance', op: 'auto', hint: 'White balance, levels, local contrast and a light sharpen' },
  { id: 'clahe', label: 'Local contrast', op: 'clahe', hint: 'CLAHE — makes a flat photo read as crisp', params: { clip: 1.8, tiles: 8, amount: 0.8 } },
  { id: 'levels', label: 'Auto levels', op: 'levels', hint: 'Percentile stretch — rescues a washed-out capture' },
  { id: 'white_balance', label: 'Fix colour cast', op: 'white_balance', hint: 'Grey-world white balance', params: { amount: 0.85 } },
  { id: 'denoise', label: 'Denoise', op: 'denoise', hint: 'Edge-preserving guided filter for phone and webcam noise', params: { strength: 1, radius: 3 } },
  { id: 'sharpen', label: 'Sharpen', op: 'sharpen', hint: 'True unsharp mask with a threshold that spares skin', params: { radius: 1.6, amount: 0.8, threshold: 0.02 } },
  { id: 'highlights', label: 'Recover highlights', op: 'tone', hint: 'Pulls blown areas back', params: { highlights: -0.7, shadows: 0 } },
  { id: 'shadows', label: 'Lift shadows', op: 'tone', hint: 'Opens up the dark end', params: { highlights: 0, shadows: 0.7 } },
  { id: 'upscale2', label: 'Upscale 2×', op: 'upscale', hint: 'Lanczos resampling — for a small upload on a big canvas', params: { factor: 2, sharpen_after: 0.35 } },
  { id: 'upscale4', label: 'Upscale 4×', op: 'upscale', hint: 'For very small sources; slower', params: { factor: 4, sharpen_after: 0.3 } },
]

export type PythonStatus = 'idle' | 'loading' | 'ready' | 'failed'

let worker: Worker | null = null
let status: PythonStatus = 'idle'
let stage = ''
let nextId = 1
const pending = new Map<number, { resolve: (value: ImageData) => void; reject: (error: Error) => void }>()
/** Scoring returns a JSON report rather than pixels, so it waits separately. */
const analyses = new Map<number, { resolve: (value: string) => void; reject: (error: Error) => void }>()
const listeners = new Set<() => void>()

export function pythonStatus(): { status: PythonStatus; stage: string } {
  return { status, stage }
}

export function onPythonStatus(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function announce(next: PythonStatus, nextStage = stage) {
  status = next
  stage = nextStage
  listeners.forEach((fn) => fn())
}

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new PyWorker()
  worker.onmessage = (event: MessageEvent<PyResponse>) => {
    const message = event.data
    if (message.type === 'progress') {
      announce(message.ready ? 'ready' : 'loading', message.stage)
      return
    }
    if (message.type === 'error') {
      if (message.id !== undefined) {
        pending.get(message.id)?.reject(new Error(message.message))
        analyses.get(message.id)?.reject(new Error(message.message))
        pending.delete(message.id)
        analyses.delete(message.id)
      }
      if (status !== 'ready') announce('failed', message.message)
      return
    }
    if (message.type === 'report') {
      analyses.get(message.id)?.resolve(message.json)
      analyses.delete(message.id)
      return
    }
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    entry.resolve(new ImageData(new Uint8ClampedArray(message.buffer), message.width, message.height))
  }
  worker.onerror = (event) => {
    announce('failed', event.message || 'The Python engine could not start')
    const failure = new Error('The Python engine could not start')
    pending.forEach((entry) => entry.reject(failure))
    analyses.forEach((entry) => entry.reject(failure))
    pending.clear()
    analyses.clear()
  }
  return worker
}

/** Downloads and starts the runtime without running an operation. */
export function preloadPython(): void {
  if (status === 'ready' || status === 'loading') return
  announce('loading', 'Starting…')
  ensureWorker().postMessage({ type: 'init' })
}

function toImageData(asset: LoadedAsset): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = asset.width
  canvas.height = asset.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(asset.bitmap, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

async function toAsset(image: ImageData, name: string): Promise<LoadedAsset> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
  return registerBlob(blob, name)
}

/** Sends one image through the worker. `mask` confines the matte operations. */
function run(image: ImageData, op: PythonOp, params: Record<string, number>, mask?: Uint8Array): Promise<ImageData> {
  if (status !== 'ready') announce('loading', 'Starting the Python engine')
  const id = nextId++
  return new Promise<ImageData>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const buffer = image.data.buffer
    const transfer: Transferable[] = [buffer]
    if (mask) transfer.push(mask.buffer)
    ensureWorker().postMessage(
      {
        type: 'run',
        id,
        op,
        params,
        width: image.width,
        height: image.height,
        buffer,
        mask: mask?.buffer,
      },
      transfer,
    )
  })
}

/** Runs one operation and registers the result as a new asset. */
export async function enhanceAsset(asset: LoadedAsset, enhancement: PythonEnhancement): Promise<LoadedAsset> {
  const result = await run(toImageData(asset), enhancement.op, enhancement.params ?? {})
  return toAsset(result, `${stripSuffix(asset.name)} (${enhancement.label.toLowerCase()})`)
}

// ------------------------------------------------------------ matte clean --

export interface CleanMatteOptions {
  /**
   * Islands of cut-out smaller than this many pixels are dropped. The subject
   * is the largest island and is never a candidate, so this can be generous.
   */
  minArea: number
  /** Edge colour decontamination, 0..1 — removes the halo from the old backdrop. */
  strength: number
  /** How far interior colour is carried outward, in pixels. */
  radius: number
  /** Raises the transparency floor, shaving the faintest rim pixels. */
  shrink: number
  /**
   * 8-bit stroke mask at asset resolution. Given, only components mostly under
   * the stroke are dropped and only that patch is decontaminated.
   */
  region?: Uint8Array
}

export const DEFAULT_CLEAN: CleanMatteOptions = { minArea: 0, strength: 0.8, radius: 2, shrink: 0 }

/**
 * Clears the speckles a background remover leaves behind and cleans the edge.
 * Returns a **new** asset, so the previous cut-out stays in the registry and
 * Ctrl+Z restores it (see the asset notes in CLAUDE.md).
 */
export async function cleanMatte(asset: LoadedAsset, options: CleanMatteOptions): Promise<LoadedAsset> {
  const image = toImageData(asset)
  // A speck is anything smaller than this share of the frame unless the caller
  // is more specific; a subject never comes close to it.
  const minArea = options.minArea > 0 ? options.minArea : Math.max(24, image.width * image.height * 0.0004)
  const result = await run(
    image,
    'clean_matte',
    { min_area: minArea, strength: options.strength, radius: options.radius, shrink: options.shrink },
    options.region,
  )
  return toAsset(result, `${stripSuffix(asset.name)} (cleaned)`)
}

// --------------------------------------------------------- object blur --

export interface FocusBlurOptions {
  /** Stroke coverage at asset resolution — the scribble the selection grows from. */
  region: Uint8Array
  /** Gaussian radius in pixels of this asset. */
  sigma: number
  /** True blurs everything *except* the selection. */
  invert: boolean
}

/**
 * Grows the scribble into an object mask and blurs one side of it, returning a
 * **new** asset. The region is copied rather than transferred: the caller keeps
 * it so the strength can be changed without scribbling again.
 */
export async function focusBlurAsset(asset: LoadedAsset, options: FocusBlurOptions): Promise<LoadedAsset> {
  const result = await run(
    toImageData(asset),
    'focus_blur',
    { sigma: options.sigma, invert: options.invert ? 1 : 0 },
    options.region.slice(),
  )
  return toAsset(result, `${stripSuffix(asset.name)} (blurred)`)
}

function stripSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '')
}

// ------------------------------------------------------------- scoring ---

export interface AnalyzeParams {
  /** Normalised [x, y, w, h] boxes of the text layers. */
  regions: number[][]
  /** Normalised rectangles each platform's own interface covers. */
  occlusion: Record<string, number[][]>
}

/** Runs the scorer over a rendered thumbnail and returns its raw report. */
export async function analyzeImage(image: ImageData, params: AnalyzeParams): Promise<unknown> {
  if (status !== 'ready') announce('loading', 'Starting the Python engine')
  const id = nextId++
  const json = await new Promise<string>((resolve, reject) => {
    analyses.set(id, { resolve, reject })
    const buffer = image.data.buffer
    ensureWorker().postMessage(
      { type: 'analyze', id, width: image.width, height: image.height, buffer, params },
      [buffer],
    )
  })
  return JSON.parse(json)
}

/** Rough guide shown before the first download. */
export const PYTHON_DOWNLOAD_MB = 15
