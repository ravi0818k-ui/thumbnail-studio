/// <reference lib="webworker" />

import enhanceSource from '../python/enhance.py?raw'
import scoreSource from '../python/score.py?raw'

// ---------------------------------------------------------------------------
// Python image engine: CPython 3.14 compiled to WebAssembly (Pyodide) running
// numpy, inside a Web Worker so the editor never blocks (spec §29).
//
// The runtime is fetched on first use and then cached by the browser. Nothing
// is uploaded: the pixels go from the canvas into WebAssembly memory and back.
// ---------------------------------------------------------------------------

const PYODIDE_VERSION = '314.0.7'
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

export interface PyInitRequest {
  type: 'init'
}

export interface PyRunRequest {
  type: 'run'
  id: number
  op: string
  params: Record<string, number | string>
  width: number
  height: number
  buffer: ArrayBuffer
  /** Optional 8-bit brush mask, one byte per pixel, confining matte work. */
  mask?: ArrayBuffer
}

export interface PyAnalyzeRequest {
  type: 'analyze'
  id: number
  width: number
  height: number
  buffer: ArrayBuffer
  /** Text boxes and per-platform interface rectangles, all normalised. */
  params: { regions: number[][]; occlusion: Record<string, number[][]> }
}

export type PyRequest = PyInitRequest | PyRunRequest | PyAnalyzeRequest

export interface PyProgress {
  type: 'progress'
  stage: string
  ready: boolean
}

export interface PyResult {
  type: 'result'
  id: number
  width: number
  height: number
  buffer: ArrayBuffer
  millis: number
}

export interface PyError {
  type: 'error'
  id?: number
  message: string
}

export interface PyReport {
  type: 'report'
  id: number
  /** The scorer's report, as JSON — the labels for it live in TypeScript. */
  json: string
  millis: number
}

export type PyResponse = PyProgress | PyResult | PyError | PyReport

const ctx = self as unknown as DedicatedWorkerGlobalScope

/**
 * The Python modules are written to Pyodide's filesystem and imported, rather
 * than exec'd into globals, so `score.py` can `import enhance` exactly as it
 * does under desktop CPython — one environment, one set of tests.
 */
const PY_DIR = '/thumbnail-studio'

/** Glue kept out of the modules so they stay plain, testable CPython. */
const BRIDGE = `
import json
import sys
import numpy as np
from pyodide.ffi import to_js

sys.path.insert(0, ${JSON.stringify(PY_DIR)})
import enhance
import score

_size = [0, 0]

def _run(buf, width, height, op, params_json, mask_buf=None):
    data = np.frombuffer(buf.to_py(), dtype=np.uint8).reshape(height, width, 4)
    region = None
    # A JS null arrives as JsNull, not None, so test for the conversion method
    # rather than for None — an absent mask must not raise.
    if hasattr(mask_buf, "to_py"):
        region = np.frombuffer(mask_buf.to_py(), dtype=np.uint8).reshape(height, width).astype(np.float32) / 255.0
    out = np.ascontiguousarray(enhance.apply_op(data, op, json.loads(params_json), region))
    _size[0], _size[1] = int(out.shape[1]), int(out.shape[0])
    return to_js(out.tobytes())

def _last_size():
    return to_js(_size)

def _analyze(buf, width, height, params_json):
    data = np.frombuffer(buf.to_py(), dtype=np.uint8).reshape(height, width, 4)
    params = json.loads(params_json)
    report = score.analyze(data, params.get("regions") or [], params.get("occlusion") or {})
    return to_js(json.dumps(report))
`

type Pyodide = {
  loadPackage: (names: string[]) => Promise<unknown>
  runPython: (code: string) => unknown
  globals: { get: (name: string) => unknown }
  FS: {
    mkdirTree: (path: string) => void
    writeFile: (path: string, data: string, options?: { encoding: string }) => void
  }
}

let pyodide: Pyodide | null = null
let loading: Promise<Pyodide> | null = null

function report(stage: string, ready = false) {
  ctx.postMessage({ type: 'progress', stage, ready } satisfies PyProgress)
}

async function boot(): Promise<Pyodide> {
  if (pyodide) return pyodide
  if (loading) return loading
  loading = (async () => {
    report('Downloading the Python runtime')
    const module = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`)
    const instance = (await module.loadPyodide({ indexURL: PYODIDE_URL })) as Pyodide
    report('Loading numpy and Pillow')
    await instance.loadPackage(['numpy', 'pillow'])
    report('Starting the image pipeline')
    instance.FS.mkdirTree(PY_DIR)
    instance.FS.writeFile(`${PY_DIR}/enhance.py`, enhanceSource, { encoding: 'utf8' })
    instance.FS.writeFile(`${PY_DIR}/score.py`, scoreSource, { encoding: 'utf8' })
    instance.runPython(BRIDGE)
    pyodide = instance
    report('Python engine ready', true)
    return instance
  })()
  return loading
}

interface MaybeProxy {
  toJs?: () => unknown
  destroy?: () => void
}

function unwrap(value: unknown): unknown {
  const proxy = value as MaybeProxy
  if (proxy && typeof proxy.toJs === 'function') {
    const converted = proxy.toJs()
    proxy.destroy?.()
    return converted
  }
  return value
}

function asBytes(value: unknown): Uint8Array {
  const result = unwrap(value)
  if (result instanceof Uint8Array) return result
  if (result instanceof ArrayBuffer) return new Uint8Array(result)
  throw new Error('The Python engine returned an unexpected buffer')
}

function asNumbers(value: unknown): number[] {
  const result = unwrap(value)
  if (Array.isArray(result)) return result as number[]
  throw new Error('The Python engine returned an unexpected size')
}

ctx.onmessage = async (event: MessageEvent<PyRequest>) => {
  const message = event.data
  try {
    if (message.type === 'init') {
      await boot()
      return
    }
    if (message.type === 'analyze') {
      const instance = await boot()
      const started = Date.now()
      const analyze = instance.globals.get('_analyze') as (
        buffer: Uint8Array,
        width: number,
        height: number,
        params: string,
      ) => unknown
      const json = String(
        unwrap(analyze(new Uint8Array(message.buffer), message.width, message.height, JSON.stringify(message.params))),
      )
      ctx.postMessage({ type: 'report', id: message.id, json, millis: Date.now() - started } satisfies PyReport)
      return
    }
    if (message.type !== 'run') return

    const instance = await boot()
    const started = Date.now()
    const run = instance.globals.get('_run') as (
      buffer: Uint8Array,
      width: number,
      height: number,
      op: string,
      params: string,
      mask: Uint8Array | null,
    ) => unknown

    // `to_js` on the Python side hands back real JS values, but be tolerant of
    // a proxy so a Pyodide version change cannot break this silently.
    const bytes = asBytes(
      run(
        new Uint8Array(message.buffer),
        message.width,
        message.height,
        message.op,
        JSON.stringify(message.params ?? {}),
        message.mask ? new Uint8Array(message.mask) : null,
      ),
    )
    const [width, height] = asNumbers((instance.globals.get('_last_size') as () => unknown)())

    // Copy out of the wasm heap before transferring.
    const out = new Uint8Array(bytes.length)
    out.set(bytes)
    ctx.postMessage(
      { type: 'result', id: message.id, width, height, buffer: out.buffer, millis: Date.now() - started } satisfies PyResult,
      [out.buffer],
    )
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      id: message.type === 'run' || message.type === 'analyze' ? message.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    } satisfies PyError)
  }
}
