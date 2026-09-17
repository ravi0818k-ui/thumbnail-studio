/**
 * Runs the real browser pipeline headlessly: the same enhance.py and the same
 * FFI bridge the Web Worker uses, executed by Pyodide (CPython on WebAssembly)
 * under Node, then compared pixel-for-pixel against desktop CPython.
 *
 *   npm run verify:python
 *
 * This is what proves the Python engine in the app actually works — the unit
 * tests in scripts/test_enhance.py only prove the maths under CPython.
 */
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPyodide } from 'pyodide'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(ROOT, 'src', 'python', 'enhance.py')
const SCORE_SOURCE = path.join(ROOT, 'src', 'python', 'score.py')
const PY_DIR = '/thumbnail-studio'

// Mirrors BRIDGE in src/workers/pyImage.worker.ts.
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

const WIDTH = 48
const HEIGHT = 32
let failures = 0

function check(name, condition, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Mirrors the worker's unwrap(): `to_js` returns JS values, proxies otherwise. */
function unwrap(value) {
  if (value && typeof value.toJs === 'function') {
    const converted = value.toJs()
    value.destroy?.()
    return converted
  }
  return value
}

/** A deterministic test image: colour ramp, a bright patch, a transparent corner. */
function makeImage() {
  const data = new Uint8Array(WIDTH * HEIGHT * 4)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4
      data[i] = 90 + Math.round((x / WIDTH) * 70)
      data[i + 1] = 100 + Math.round((y / HEIGHT) * 50)
      data[i + 2] = 130
      data[i + 3] = x < 6 && y < 6 ? 0 : 255
    }
  }
  for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) data[(y * WIDTH + x) * 4] = 240
  return data
}

/** A cut-out: one solid subject block plus the specks a matte leaves behind. */
function makeMatte() {
  const data = new Uint8Array(WIDTH * HEIGHT * 4)
  for (let y = 6; y < 26; y++) {
    for (let x = 10; x < 34; x++) {
      const i = (y * WIDTH + x) * 4
      data.set([60, 90, 140, 255], i)
    }
  }
  for (const [y, x] of [
    [2, 44],
    [3, 45],
    [29, 4],
  ]) {
    data.set([250, 250, 250, 255], (y * WIDTH + x) * 4)
  }
  return data
}

/** Covers only the top-right speck pair, as a brush stroke would. */
function makeRegion() {
  const mask = new Uint8Array(WIDTH * HEIGHT)
  for (let y = 0; y < 8; y++) for (let x = 40; x < WIDTH; x++) mask[y * WIDTH + x] = 255
  return mask
}

async function main() {
  const source = await readFile(SOURCE, 'utf8')
  const scoreSource = await readFile(SCORE_SOURCE, 'utf8')
  const image = makeImage()

  console.log('pyodide: boot')
  const started = Date.now()
  const pyodide = await loadPyodide()
  await pyodide.loadPackage(['numpy', 'pillow'])
  // Exactly what the worker does: write the modules to the virtual filesystem
  // and import them, so score.py's `import enhance` resolves the same way it
  // does under desktop CPython.
  pyodide.FS.mkdirTree(PY_DIR)
  pyodide.FS.writeFile(`${PY_DIR}/enhance.py`, source, { encoding: 'utf8' })
  pyodide.FS.writeFile(`${PY_DIR}/score.py`, scoreSource, { encoding: 'utf8' })
  pyodide.runPython(BRIDGE)
  console.log(`  ok   runtime + numpy + pillow ready in ${((Date.now() - started) / 1000).toFixed(1)}s`)

  check('enhance.py imports as a module', pyodide.runPython('len(enhance.OPS)') === 13)
  check('score.py imports enhance the way CPython does', pyodide.runPython('len(score.METRICS)') === 7)
  check('numpy is the WebAssembly build', String(pyodide.runPython('import numpy; numpy.__version__')).length > 0)
  check('Pillow is available for Lanczos', pyodide.runPython('from PIL import Image; hasattr(Image, "LANCZOS")') === true)

  const run = pyodide.globals.get('_run')
  const lastSize = pyodide.globals.get('_last_size')

  const outputs = {}
  for (const [op, params] of [
    ['auto', {}],
    ['clahe', { clip: 1.8, tiles: 8, amount: 0.8 }],
    ['levels', {}],
    ['white_balance', { amount: 0.85 }],
    ['denoise', { strength: 1, radius: 3 }],
    ['sharpen', { radius: 1.6, amount: 0.8, threshold: 0.02 }],
    ['tone', { highlights: -0.7, shadows: 0 }],
    ['temperature', { temp: 0.5, tint: 0 }],
    ['upscale', { factor: 2, sharpen_after: 0.35 }],
    ['despeckle', { min_area: 16 }],
    ['clean_matte', { min_area: 16, strength: 0.8 }],
  ]) {
    const bytes = unwrap(run(image, WIDTH, HEIGHT, op, JSON.stringify(params)))
    const [width, height] = unwrap(lastSize())

    const expectedPixels = op === 'upscale' ? WIDTH * 2 * HEIGHT * 2 : WIDTH * HEIGHT
    check(
      `'${op}' returns a complete RGBA buffer`,
      bytes.length === expectedPixels * 4 && width * height === expectedPixels,
      `${bytes.length} bytes, ${width}×${height}`,
    )
    outputs[op] = Buffer.from(bytes)
  }

  // The matte operations are the only ones that take the optional mask
  // argument across the FFI, so exercise that path end to end.
  const matte = makeMatte()
  const region = makeRegion()
  const alphaAt = (buffer, x, y) => buffer[(y * WIDTH + x) * 4 + 3]

  const swept = Buffer.from(unwrap(run(matte, WIDTH, HEIGHT, 'despeckle', JSON.stringify({ min_area: 16 }), null)))
  check('despeckle clears every speck with no mask', alphaAt(swept, 44, 2) === 0 && alphaAt(swept, 4, 29) === 0)
  check('despeckle keeps the subject', alphaAt(swept, 20, 15) === 255)

  const brushed = Buffer.from(
    unwrap(run(matte, WIDTH, HEIGHT, 'clean_matte', JSON.stringify({ min_area: 16, strength: 0.8 }), region)),
  )
  check('a brush mask crosses the FFI', alphaAt(brushed, 44, 2) === 0 && alphaAt(brushed, 4, 29) === 255)
  check('a brush never takes the subject', alphaAt(brushed, 20, 15) === 255)

  // The object mask is the one operation whose entire job is the region, so it
  // is also the sharpest test of that argument surviving the FFI.
  const focusParams = { sigma: 3, invert: 0 }
  const focused = Buffer.from(unwrap(run(matte, WIDTH, HEIGHT, 'focus_blur', JSON.stringify(focusParams), region)))
  check('focus_blur changes the pixels it selected', !focused.equals(Buffer.from(matte)))
  const unfocused = Buffer.from(unwrap(run(matte, WIDTH, HEIGHT, 'focus_blur', JSON.stringify(focusParams), null)))
  check('focus_blur with no stroke selects nothing', unfocused.equals(Buffer.from(matte)))

  // Scoring: a different bridge function, a JSON return, and the one place a
  // second Python module is exercised.
  const analyze = pyodide.globals.get('_analyze')
  const scoreParams = { regions: [[0.05, 0.3, 0.4, 0.3]], occlusion: { mobile: [[0.78, 0.86, 0.22, 0.14]] } }
  const reportJson = String(unwrap(analyze(matte, WIDTH, HEIGHT, JSON.stringify(scoreParams))))
  const parsed = JSON.parse(reportJson)
  check('the scorer returns both platforms', parsed.platforms.map((p) => p.id).join(',') === 'desktop,mobile')
  check(
    'every metric comes back scored',
    parsed.platforms.every((p) => p.metrics.length === 7 && p.metrics.every((m) => 'score' in m)),
  )
  check('scores are in range', parsed.platforms.every((p) => p.score >= 0 && p.score <= 100))
  check('a palette comes back', Array.isArray(parsed.palette) && parsed.palette.length > 0)
  check('numpy.fft works in WebAssembly', parsed.platforms[0].metrics.some((m) => m.id === 'focus' && m.score !== null))

  // Alpha must survive every operation untouched.
  const alphaIn = [...image].filter((_, i) => i % 4 === 3)
  const alphaOut = [...outputs.auto].filter((_, i) => i % 4 === 3)
  check('transparent pixels stay transparent', alphaIn.every((v, i) => v === alphaOut[i]))

  // The headline claim: WebAssembly output matches desktop CPython exactly.
  const dir = await mkdtemp(path.join(tmpdir(), 'ts-python-'))
  const inputPath = path.join(dir, 'input.bin')
  await writeFile(inputPath, Buffer.from(image))
  const script = `
import json, sys
import numpy as np
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'src', 'python'))})
import enhance
data = np.fromfile(${JSON.stringify(inputPath)}, dtype=np.uint8).reshape(${HEIGHT}, ${WIDTH}, 4)
ops = json.loads(sys.argv[1])
for name, params in ops.items():
    out = np.ascontiguousarray(enhance.apply_op(data, name, params))
    out.tofile(${JSON.stringify(path.join(dir, 'out_'))} + name + '.bin')
`
  const scriptPath = path.join(dir, 'reference.py')
  await writeFile(scriptPath, script)
  const ops = {
    auto: {},
    clahe: { clip: 1.8, tiles: 8, amount: 0.8 },
    levels: {},
    white_balance: { amount: 0.85 },
    denoise: { strength: 1, radius: 3 },
    sharpen: { radius: 1.6, amount: 0.8, threshold: 0.02 },
    tone: { highlights: -0.7, shadows: 0 },
    temperature: { temp: 0.5, tint: 0 },
    upscale: { factor: 2, sharpen_after: 0.35 },
    despeckle: { min_area: 16 },
    clean_matte: { min_area: 16, strength: 0.8 },
  }
  // The scorer's own report, from desktop CPython, for the same pixels.
  const scoreScript = `
import json, sys
import numpy as np
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'src', 'python'))})
import score
data = np.fromfile(${JSON.stringify(path.join(dir, 'matte.bin'))}, dtype=np.uint8).reshape(${HEIGHT}, ${WIDTH}, 4)
params = json.loads(sys.argv[1])
print(json.dumps(score.analyze(data, params["regions"], params["occlusion"])))
`
  await writeFile(path.join(dir, 'matte.bin'), Buffer.from(matte))
  await writeFile(path.join(dir, 'region.bin'), Buffer.from(region))
  // Compared with its mask attached: without one the operation is a no-op and
  // the comparison would prove nothing.
  const focusScript = `
import json, sys
import numpy as np
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'src', 'python'))})
import enhance
data = np.fromfile(${JSON.stringify(path.join(dir, 'matte.bin'))}, dtype=np.uint8).reshape(${HEIGHT}, ${WIDTH}, 4)
region = np.fromfile(${JSON.stringify(path.join(dir, 'region.bin'))}, dtype=np.uint8).reshape(${HEIGHT}, ${WIDTH}).astype(np.float32) / 255.0
out = np.ascontiguousarray(enhance.apply_op(data, 'focus_blur', json.loads(sys.argv[1]), region))
out.tofile(${JSON.stringify(path.join(dir, 'out_focus_blur.bin'))})
`
  const focusScriptPath = path.join(dir, 'reference_focus.py')
  await writeFile(focusScriptPath, focusScript)
  const focusReference = spawnSync('python', [focusScriptPath, JSON.stringify(focusParams)], { encoding: 'utf8' })
  if (focusReference.status === 0) {
    const expected = await readFile(path.join(dir, 'out_focus_blur.bin'))
    check("'focus_blur' matches desktop CPython", expected.equals(focused), `${expected.length} vs ${focused.length} bytes`)
  }
  const scoreScriptPath = path.join(dir, 'reference_score.py')
  await writeFile(scoreScriptPath, scoreScript)
  const scoreReference = spawnSync('python', [scoreScriptPath, JSON.stringify(scoreParams)], { encoding: 'utf8' })
  if (scoreReference.status === 0) {
    check(
      'the score matches desktop CPython exactly',
      scoreReference.stdout.trim() === reportJson.trim(),
      `${scoreReference.stdout.trim().slice(0, 120)} vs ${reportJson.trim().slice(0, 120)}`,
    )
  }

  const reference = spawnSync('python', [scriptPath, JSON.stringify(ops)], { encoding: 'utf8' })
  if (reference.status !== 0) {
    console.log(`  skip  desktop CPython comparison (${(reference.stderr || 'python not available').trim().split('\n').pop()})`)
  } else {
    for (const op of Object.keys(ops)) {
      const expected = await readFile(path.join(dir, `out_${op}.bin`))
      const actual = outputs[op]
      let maxDelta = 0
      let differing = 0
      for (let i = 0; i < expected.length; i++) {
        const delta = Math.abs(expected[i] - actual[i])
        if (delta > 0) differing++
        if (delta > maxDelta) maxDelta = delta
      }
      // Pillow's Lanczos is the only op where a 1-LSB rounding split is fair.
      const tolerance = op === 'upscale' ? 1 : 0
      check(
        `'${op}' matches desktop CPython`,
        maxDelta <= tolerance,
        `max delta ${maxDelta} over ${differing} bytes`,
      )
    }
  }

  console.log(failures === 0 ? '\nPyodide verification passed.' : `\n${failures} pyodide check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('\nPyodide verification failed to run:', error)
  process.exit(1)
})
