/// <reference lib="webworker" />

import { AutoModel, AutoProcessor, RawImage, env, type PreTrainedModel, type Processor } from '@huggingface/transformers'

// ---------------------------------------------------------------------------
// Segmentation for the background remover: two models, both run here so the
// page never blocks.
//
// - General: BiRefNet-lite (MIT). Crisp edges on any subject at 1024 px; the
//   best of the browser-sized models on hair. It keeps whatever is most
//   salient, which is sometimes the person *and* the chair.
// - CPU fallback: ormbg (Apache-2.0, ISNet architecture, 44 MB uint8).
//   BiRefNet's 1024 px graph does not fit WebAssembly's 4 GB address space
//   (std::bad_alloc), and its input size is fixed, so a machine without a
//   usable GPU gets this lighter model. Hair is close; it is likelier to drop
//   a limb, which the Restore brush puts back.
// - Person: MODNet (Apache-2.0), quantised to 6.6 MB. Knows what a person is,
//   so it is what "Person only" uses to veto the chair. Its own 512 px edge is
//   too soft to use as the matte.
//
// Both return low-resolution masks; matte.py does the work at photo size. The
// weights come from the Hugging Face CDN on first use and are then cached by
// the browser. Nothing is uploaded — the pixels never leave this worker.
// ---------------------------------------------------------------------------

export const GENERAL_MODEL = 'onnx-community/BiRefNet_lite-ONNX'
export const CPU_MODEL = 'Orangebot/ormbg-ONNX'
export const PERSON_MODEL = 'Xenova/modnet'

export interface SegmentRequest {
  type: 'segment'
  id: number
  width: number
  height: number
  /** RGBA bytes of the photo. */
  buffer: ArrayBuffer
  /** Skip WebGPU: set after the GPU failed once on this page. */
  cpuOnly: boolean
}

export interface SegmentMask {
  width: number
  height: number
  /** One byte per pixel, 0..255. */
  buffer: ArrayBuffer
}

export interface SegmentResult {
  type: 'masks'
  id: number
  general: SegmentMask
  person: SegmentMask | null
  device: string
  millis: number
}

export interface SegmentProgress {
  type: 'progress'
  stage: 'download' | 'general' | 'person'
  /** 0..1 for downloads; absent while inferring. */
  progress?: number
  loaded?: number
  total?: number
}

export interface SegmentError {
  type: 'error'
  id?: number
  message: string
  /** The failure happened on the GPU, so a fresh worker on the CPU may succeed. */
  gpu: boolean
}

export type SegmentResponse = SegmentResult | SegmentProgress | SegmentError

const ctx = self as unknown as DedicatedWorkerGlobalScope

env.allowLocalModels = false

interface Loaded {
  model: PreTrainedModel
  processor: Processor
  device: string
}

/** Bytes per file, so one progress bar can cover every download. */
const downloads = new Map<string, { loaded: number; total: number }>()

function reportDownload() {
  let loaded = 0
  let total = 0
  for (const entry of downloads.values()) {
    loaded += entry.loaded
    total += entry.total
  }
  ctx.postMessage({
    type: 'progress',
    stage: 'download',
    progress: total > 0 ? loaded / total : 0,
    loaded,
    total,
  } satisfies SegmentProgress)
}

function onProgress(info: { status: string; file?: string; name?: string; loaded?: number; total?: number }) {
  if (info.status !== 'progress' || !info.file) return
  downloads.set(`${info.name}/${info.file}`, { loaded: info.loaded ?? 0, total: info.total ?? 0 })
  reportDownload()
}

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
  if (!gpu) return false
  try {
    return (await gpu.requestAdapter()) !== null
  } catch {
    return false
  }
}

/**
 * The fastest combination that loads: WebGPU in half precision where there is
 * a GPU, otherwise the CPU. A model that fails to compile on one backend is
 * retried on the next rather than failing the page.
 */
async function loadModel(repo: string, attempts: { device: 'webgpu' | 'wasm'; dtype: string }[]): Promise<Loaded> {
  let lastError: unknown = null
  for (const attempt of attempts) {
    try {
      const model = await AutoModel.from_pretrained(repo, {
        device: attempt.device,
        dtype: attempt.dtype as 'fp32',
        progress_callback: onProgress,
      })
      const processor = await AutoProcessor.from_pretrained(repo, { progress_callback: onProgress })
      return { model, processor, device: `${attempt.device}/${attempt.dtype}/${repo.split('/')[1]}` }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not load ${repo}`)
}

let general: Promise<Loaded> | null = null

function loadCpuModel(): Promise<Loaded> {
  return loadModel(CPU_MODEL, [{ device: 'wasm', dtype: 'uint8' }])
}
let person: Promise<Loaded | null> | null = null

async function models(cpuOnly: boolean): Promise<{ general: Loaded; person: Loaded | null }> {
  general ??= (cpuOnly ? Promise.resolve(false) : hasWebGpu()).then((gpu) =>
    gpu
      ? loadModel(GENERAL_MODEL, [{ device: 'webgpu', dtype: 'fp16' }]).catch(() => loadCpuModel())
      : loadCpuModel(),
  )
  // The person model is a refinement: if it cannot load, the remover still
  // works and simply does not offer "Person only".
  person ??= loadModel(PERSON_MODEL, [{ device: 'wasm', dtype: 'uint8' }]).catch(() => null)
  const [g, p] = await Promise.all([general, person])
  return { general: g, person: p }
}

interface Tensorish {
  dims: number[]
  data: ArrayLike<number>
}

/** The model's output as bytes, whether it returned logits or probabilities. */
function toMask(output: Record<string, Tensorish>): SegmentMask {
  const tensor = Object.values(output).at(-1) as Tensorish
  const [height, width] = tensor.dims.slice(-2)
  const data = tensor.data
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < width * height; i++) {
    const v = Number(data[i])
    if (v < min) min = v
    if (v > max) max = v
  }
  const logits = min < -0.01 || max > 1.01
  const bytes = new Uint8Array(width * height)
  for (let i = 0; i < bytes.length; i++) {
    const v = Number(data[i])
    const p = logits ? 1 / (1 + Math.exp(-v)) : v
    bytes[i] = Math.round(Math.max(0, Math.min(1, p)) * 255)
  }
  return { width, height, buffer: bytes.buffer }
}

async function infer(loaded: Loaded, image: RawImage): Promise<SegmentMask> {
  const inputs = await loaded.processor(image)
  const name = loaded.model.sessions.model.inputNames[0]
  const output = await loaded.model({ [name]: inputs.pixel_values })
  return toMask(output as Record<string, Tensorish>)
}

ctx.onmessage = async (event: MessageEvent<SegmentRequest>) => {
  const message = event.data
  if (message.type !== 'segment') return
  let onGpu = false
  try {
    const loaded = await models(message.cpuOnly)
    onGpu = loaded.general.device.startsWith('webgpu')
    const started = Date.now()
    const image = new RawImage(new Uint8ClampedArray(message.buffer), message.width, message.height, 4).rgb()

    ctx.postMessage({ type: 'progress', stage: 'general' } satisfies SegmentProgress)
    // A GPU can load the model and still fail to run it — a software or
    // low-end adapter runs out of storage buffers per shader stage. ONNX
    // Runtime keeps that GPU state for the worker's life, so the page answers
    // such an error with a fresh, CPU-only worker (bgRemover.ts), not a retry here.
    const generalModel = loaded.general
    const generalMask = await infer(generalModel, image)
    let personMask: SegmentMask | null = null
    if (loaded.person) {
      ctx.postMessage({ type: 'progress', stage: 'person' } satisfies SegmentProgress)
      personMask = await infer(loaded.person, image).catch(() => null)
    }

    const transfer = [generalMask.buffer, ...(personMask ? [personMask.buffer] : [])]
    ctx.postMessage(
      {
        type: 'masks',
        id: message.id,
        general: generalMask,
        person: personMask,
        device: generalModel.device,
        millis: Date.now() - started,
      } satisfies SegmentResult,
      transfer,
    )
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
      gpu: onGpu,
    } satisfies SegmentError)
  }
}
