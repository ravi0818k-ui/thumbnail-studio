/// <reference lib="webworker" />

import { applyCutout } from '../engine/cutout'

export interface RemoveRequest {
  type: 'remove'
  width: number
  height: number
  buffer: ArrayBuffer
  tolerance: number // 0..100
  feather: number // px
}

export interface RemoveResponse {
  type: 'done' | 'progress'
  progress?: number
  width?: number
  height?: number
  buffer?: ArrayBuffer
}

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<RemoveRequest>) => {
  const msg = event.data
  if (msg.type !== 'remove') return
  const { width, height, tolerance, feather } = msg
  const data = new Uint8ClampedArray(msg.buffer)

  applyCutout(data, width, height, {
    tolerance,
    feather,
    onProgress: (progress) => ctx.postMessage({ type: 'progress', progress } satisfies RemoveResponse),
  })

  const out = data.buffer
  ctx.postMessage({ type: 'done', width, height, buffer: out } satisfies RemoveResponse, [out])
}
