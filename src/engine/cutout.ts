// ---------------------------------------------------------------------------
// Background removal algorithm. Kept free of DOM and worker globals so it can
// run in the worker, and be exercised directly by the self-test.
//
// It is a multi-seed flood fill ("magic wand from every edge"): every border
// pixel seeds a region, and a neighbour joins that region while it stays within
// `tolerance` of the seed colour. Whatever the frame can reach is background;
// the subject, which it cannot reach, is kept.
// ---------------------------------------------------------------------------

export interface CutoutOptions {
  tolerance: number // 0..100
  feather: number // px
  onProgress?: (progress: number) => void
}

/** Applies the cut-out in place and returns the same pixel buffer. */
export function applyCutout(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: CutoutOptions,
): Uint8ClampedArray {
  const mask = floodFillBackground(data, width, height, options.tolerance, options.onProgress)
  const alpha = options.feather > 0 ? featherMask(mask, width, height, options.feather) : mask
  for (let i = 0, px = 0; i < data.length; i += 4, px++) {
    data[i + 3] = Math.round((data[i + 3] * alpha[px]) / 255)
  }
  return data
}

/** Per-pixel keep mask: 255 = subject, 0 = background. */
export function floodFillBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
  onProgress?: (progress: number) => void,
): Uint8Array {
  const total = width * height
  const keep = new Uint8Array(total).fill(255)
  const visited = new Uint8Array(total)
  // Tolerance is a squared distance in RGB space.
  const limit = Math.pow((tolerance / 100) * 200, 2) * 3

  const queue = new Int32Array(total)
  const seedR = new Uint8Array(total)
  const seedG = new Uint8Array(total)
  const seedB = new Uint8Array(total)
  let head = 0
  let tail = 0

  const push = (index: number, r: number, g: number, b: number) => {
    if (visited[index]) return
    visited[index] = 1
    keep[index] = 0
    seedR[tail] = r
    seedG[tail] = g
    seedB[tail] = b
    queue[tail++] = index
  }

  const seedFrom = (index: number) => {
    const i = index * 4
    push(index, data[i], data[i + 1], data[i + 2])
  }

  for (let x = 0; x < width; x++) {
    seedFrom(x)
    seedFrom((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    seedFrom(y * width)
    seedFrom(y * width + width - 1)
  }

  let processed = 0
  let nextReport = total / 20

  while (head < tail) {
    const index = queue[head]
    const sr = seedR[head]
    const sg = seedG[head]
    const sb = seedB[head]
    head++
    processed++
    if (onProgress && processed > nextReport) {
      nextReport += total / 20
      onProgress(Math.min(0.95, processed / total))
    }

    const x = index % width
    const y = (index - x) / width

    for (let dir = 0; dir < 4; dir++) {
      const nx = x + (dir === 0 ? 1 : dir === 1 ? -1 : 0)
      const ny = y + (dir === 2 ? 1 : dir === 3 ? -1 : 0)
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nIndex = ny * width + nx
      if (visited[nIndex]) continue
      const i = nIndex * 4
      if (data[i + 3] === 0) {
        push(nIndex, sr, sg, sb)
        continue
      }
      const dr = data[i] - sr
      const dg = data[i + 1] - sg
      const db = data[i + 2] - sb
      if (dr * dr + dg * dg + db * db <= limit) push(nIndex, sr, sg, sb)
    }
  }

  onProgress?.(1)
  return keep
}

/** Separable box blur on the mask, which softens the cut-out edge. */
export function featherMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const r = Math.max(1, Math.round(radius))
  const tmp = new Float32Array(width * height)
  const out = new Uint8Array(width * height)
  const span = r * 2 + 1

  for (let y = 0; y < height; y++) {
    let sum = 0
    for (let x = -r; x <= r; x++) sum += mask[y * width + clamp(x, 0, width - 1)]
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / span
      sum -= mask[y * width + clamp(x - r, 0, width - 1)]
      sum += mask[y * width + clamp(x + r + 1, 0, width - 1)]
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += tmp[clamp(y, 0, height - 1) * width + x]
    for (let y = 0; y < height; y++) {
      out[y * width + x] = Math.round(sum / span)
      sum -= tmp[clamp(y - r, 0, height - 1) * width + x]
      sum += tmp[clamp(y + r + 1, 0, height - 1) * width + x]
    }
  }
  return out
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value
}
