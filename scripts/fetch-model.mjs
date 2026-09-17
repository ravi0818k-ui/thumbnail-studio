/**
 * Downloads the background-removal model into `public/bg-model/` so the editor
 * can cut out backgrounds with no network at all.
 *
 *   npm run fetch-model            # quantised model + CPU runtime (~54 MB)
 *   npm run fetch-model -- --gpu   # also the WebGPU runtime (+22 MB)
 *   npm run fetch-model -- --verify # only the tiny loaders, to check the setup
 *
 * Then run the app with VITE_BG_MODEL_PATH=/bg-model/ (see .env.example).
 *
 * The files are content-hashed chunks; re-running only fetches what is missing.
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

// The package does not export package.json, so read it off disk. The data must
// match the library version exactly — the manifest format changes between them.
const { version } = JSON.parse(
  await readFile(path.resolve('node_modules/@imgly/background-removal/package.json'), 'utf8'),
)

const BASE = `https://staticimgly.com/@imgly/background-removal-data/${version}/dist/`
const OUT = path.resolve('public/bg-model')

const args = process.argv.slice(2)
const verifyOnly = args.includes('--verify')
const withGpu = args.includes('--gpu')

// Matches the `model` and default device used in src/engine/backgroundRemoval.ts.
const WANTED = [
  '/models/isnet_quint8',
  '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
  '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
  ...(withGpu ? ['/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm', '/onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs'] : []),
]

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`

async function main() {
  console.log(`Model data for @imgly/background-removal@${version}`)
  const manifest = await fetchJson(`${BASE}resources.json`)

  const missing = WANTED.filter((key) => !manifest[key])
  if (missing.length > 0) throw new Error(`Manifest has no entry for ${missing.join(', ')}`)

  const kept = Object.fromEntries(WANTED.map((key) => [key, manifest[key]]))
  let entries = Object.entries(kept)
  if (verifyOnly) {
    entries = entries.filter(([, value]) => value.size < 2 * 1024 * 1024)
    console.log('--verify: fetching only the small loader files')
  }

  const total = entries.reduce((sum, [, value]) => sum + value.size, 0)
  console.log(`Destination: ${OUT}\nTo download: ${mb(total)}\n`)
  await mkdir(OUT, { recursive: true })

  for (const [key, entry] of entries) {
    console.log(`${key} (${mb(entry.size)}, ${entry.chunks.length} chunks)`)
    for (const chunk of entry.chunks) {
      const size = chunk.offsets[1] - chunk.offsets[0]
      const target = path.join(OUT, chunk.name)
      if (existsSync(target) && (await stat(target)).size === size) {
        process.stdout.write('  ·')
        continue
      }
      const response = await fetch(BASE + chunk.name)
      if (!response.ok) throw new Error(`${response.status} for ${chunk.name}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length !== size) throw new Error(`${chunk.name}: expected ${size} bytes, got ${buffer.length}`)
      await writeFile(target, buffer)
      process.stdout.write('  ✓')
    }
    process.stdout.write('\n')
  }

  // The library reads this manifest from publicPath and fetches chunks by name,
  // so it must list only what actually landed on disk.
  await writeFile(path.join(OUT, 'resources.json'), JSON.stringify(Object.fromEntries(entries), null, 2))

  const files = await readdir(OUT)
  console.log(`\nWrote ${files.length} files to public/bg-model/.`)
  console.log(verifyOnly ? 'Verify run complete — re-run without --verify for the full model.' : 'Set VITE_BG_MODEL_PATH=/bg-model/ to use it.')
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`)
  return response.json()
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`)
  process.exit(1)
})
