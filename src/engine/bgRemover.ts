import SegmentWorker from '../workers/segment.worker?worker'
import type { SegmentMask, SegmentProgress, SegmentResponse } from '../workers/segment.worker'
import { runMatte, type MatteInfo } from './pythonImage'
import { REFINE_MARGIN } from './removerModels'
import { cropRgba, growRect, workingSize, type Matte, type Rect } from './removerEdit'

// ---------------------------------------------------------------------------
// The background remover's pipeline, in three steps that each run off the
// main thread:
//
//   photo ─► segment.worker (BiRefNet-lite + MODNet, low-res masks)
//         ─► masks scaled to photo size on a canvas (the GPU does the filter)
//         ─► pyImage.worker / matte.py (alpha at photo size + edge colour)
//
// The editing that follows is removerEdit.ts, which has no I/O at all.
// ---------------------------------------------------------------------------

export interface Photo {
  name: string
  image: ImageData
  /** Was the upload scaled down to MAX_EDGE? Then the page says so. */
  scaled: boolean
}

export interface Masks {
  general: Uint8Array
  person: Uint8Array | null
  device: string
}

export type RemoverStage =
  | { stage: 'download'; progress: number; loaded: number; total: number }
  | { stage: 'general' }
  | { stage: 'person' }
  | { stage: 'matte' }

export async function loadPhoto(file: Blob, name: string): Promise<Photo> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const size = workingSize(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  return { name, image: ctx.getImageData(0, 0, size.width, size.height), scaled: size.scale < 1 }
}

let worker: Worker | null = null
let nextId = 1
/** Set once the GPU has failed on this page; every later photo goes straight to the CPU. */
let cpuOnly = false

function segmentWorker(): Worker {
  // One worker for the page's life: the models stay loaded between photos.
  worker ??= new SegmentWorker()
  return worker
}

/**
 * Runs both models and returns their masks at the photo's own size. A GPU
 * that cannot run the model gets one more try on a fresh, CPU-only worker.
 */
export async function segment(image: ImageData, onStage: (stage: RemoverStage) => void): Promise<Masks> {
  try {
    return await segmentOnce(image, onStage)
  } catch (error) {
    if (cpuOnly || !(error instanceof GpuFailure)) throw error
    cpuOnly = true
    worker?.terminate()
    worker = null
    return segmentOnce(image, onStage)
  }
}

class GpuFailure extends Error {}

function segmentOnce(image: ImageData, onStage: (stage: RemoverStage) => void): Promise<Masks> {
  const id = nextId++
  const w = segmentWorker()
  const copy = image.data.slice().buffer
  return new Promise<Masks>((resolve, reject) => {
    const onMessage = (event: MessageEvent<SegmentResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        onStage(stageOf(message))
        return
      }
      if ('id' in message && message.id !== undefined && message.id !== id) return
      w.removeEventListener('message', onMessage)
      if (message.type === 'error') {
        reject(message.gpu ? new GpuFailure(message.message) : new Error(message.message))
        return
      }
      resolve({
        general: upscaleMask(message.general, image.width, image.height),
        person: message.person ? upscaleMask(message.person, image.width, image.height) : null,
        device: message.device,
      })
    }
    w.addEventListener('message', onMessage)
    w.onerror = (event) => {
      w.removeEventListener('message', onMessage)
      reject(new Error(event.message || 'The background model could not start'))
    }
    w.postMessage({ type: 'segment', id, width: image.width, height: image.height, buffer: copy, cpuOnly }, [copy])
  })
}

function stageOf(message: SegmentProgress): RemoverStage {
  if (message.stage === 'download') {
    return { stage: 'download', progress: message.progress ?? 0, loaded: message.loaded ?? 0, total: message.total ?? 0 }
  }
  return { stage: message.stage }
}

/** A low-resolution mask scaled to (width, height) with the canvas's own smooth filter. */
function upscaleMask(mask: SegmentMask, width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(mask.buffer)
  const source = document.createElement('canvas')
  source.width = mask.width
  source.height = mask.height
  const sctx = source.getContext('2d')!
  const rgba = sctx.createImageData(mask.width, mask.height)
  for (let i = 0; i < bytes.length; i++) {
    rgba.data[i * 4] = bytes[i]
    rgba.data[i * 4 + 3] = 255
  }
  sctx.putImageData(rgba, 0, 0)
  const target = document.createElement('canvas')
  target.width = width
  target.height = height
  const tctx = target.getContext('2d', { willReadFrequently: true })!
  tctx.imageSmoothingEnabled = true
  tctx.imageSmoothingQuality = 'high'
  tctx.drawImage(source, 0, 0, width, height)
  const data = tctx.getImageData(0, 0, width, height).data
  const out = new Uint8Array(width * height)
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4]
  return out
}

export interface CutoutResult {
  pixels: Uint8ClampedArray
  info: MatteInfo
  millis: number
}

/** The refined cut-out for the whole photo. */
export async function cutout(photo: Photo, masks: Masks, personOnly: boolean): Promise<CutoutResult> {
  const image = new ImageData(photo.image.data.slice(), photo.image.width, photo.image.height)
  const result = await runMatte('cutout', image, masks.general.slice(), masks.person?.slice() ?? null, {
    person_only: personOnly,
  })
  return { pixels: result.image.data, info: result.info, millis: result.millis }
}

/** Short side of the photo, which every matte radius is a share of. */
export function shortSide(matte: Pick<Matte, 'width' | 'height'>): number {
  return Math.min(matte.width, matte.height)
}

/** The area sent for a refine stroke: the stroke plus the context matte.py reads around it. */
export function refineRect(matte: Pick<Matte, 'width' | 'height'>, stroke: Rect): Rect {
  return growRect(stroke, Math.ceil(shortSide(matte) * REFINE_MARGIN) + 4, matte.width, matte.height)
}

/**
 * Re-solves one refine stroke. Only a crop around it goes to the worker, with
 * the photo's short side so the radii match the ones the cut-out used.
 * Returns the solved RGBA for `rect`; the caller blends it in under the stroke.
 */
export async function refine(matte: Matte, coverage: Uint8Array, rect: Rect): Promise<Uint8ClampedArray> {
  const original = cropRgba(matte.original, matte.width, rect)
  const alpha = new Uint8Array(rect.width * rect.height)
  const region = new Uint8Array(rect.width * rect.height)
  for (let row = 0; row < rect.height; row++) {
    for (let col = 0; col < rect.width; col++) {
      const i = (rect.y + row) * matte.width + rect.x + col
      alpha[row * rect.width + col] = matte.pixels[i * 4 + 3]
      region[row * rect.width + col] = coverage[i] > 0 ? 255 : 0
    }
  }
  const result = await runMatte('refine', new ImageData(original, rect.width, rect.height), alpha, region, {
    side: shortSide(matte),
  })
  return result.image.data
}
