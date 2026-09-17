import type { Asset } from '../types'
import { putAsset, getAsset } from '../storage/db'

export interface LoadedAsset {
  id: string
  bitmap: ImageBitmap
  width: number
  height: number
  blob: Blob
  name: string
}

/**
 * Decoded bitmaps live here for the lifetime of the tab. The renderer is
 * synchronous, so anything it draws must already be in this registry.
 */
const registry = new Map<string, LoadedAsset>()
const pending = new Map<string, Promise<LoadedAsset | null>>()
const listeners = new Set<() => void>()

export function onAssetsChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  listeners.forEach((fn) => fn())
}

export function getLoadedAsset(id: string | null | undefined): LoadedAsset | null {
  if (!id) return null
  return registry.get(id) ?? null
}

export function hasAsset(id: string): boolean {
  return registry.has(id)
}

let counter = 0
export function newId(prefix = 'a'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/** Decodes a blob, registers it and persists it so reopening a project works. */
export async function registerBlob(blob: Blob, name: string, id = newId('img'), persist = true): Promise<LoadedAsset> {
  const bitmap = await createImageBitmap(blob)
  const asset: LoadedAsset = { id, bitmap, width: bitmap.width, height: bitmap.height, blob, name }
  registry.set(id, asset)
  if (persist) {
    const record: Asset = { id, name, type: blob.type, blob, width: bitmap.width, height: bitmap.height }
    void putAsset(record)
  }
  notify()
  return asset
}

/** Pulls an asset out of IndexedDB on demand (used when reopening projects). */
export function ensureAsset(id: string): Promise<LoadedAsset | null> {
  const existing = registry.get(id)
  if (existing) return Promise.resolve(existing)
  const inFlight = pending.get(id)
  if (inFlight) return inFlight
  const p = (async () => {
    const record = await getAsset(id)
    if (!record) return null
    const loaded = await registerBlob(record.blob, record.name, id, false)
    return loaded
  })()
    .catch(() => null)
    .finally(() => pending.delete(id))
  pending.set(id, p)
  return p
}

export async function ensureAssets(ids: (string | null | undefined)[]): Promise<void> {
  await Promise.all(ids.filter((id): id is string => !!id).map((id) => ensureAsset(id)))
}

/** Registers an already-decoded bitmap (background removal output). */
export async function registerBitmap(bitmap: ImageBitmap, name: string): Promise<LoadedAsset> {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
  return registerBlob(blob, name)
}

/** Swaps the decoded bitmap for an asset in place (brush editing). */
export async function updateAssetFromCanvas(id: string, canvas: HTMLCanvasElement, persist = false): Promise<void> {
  const existing = registry.get(id)
  if (!existing) return
  const bitmap = await createImageBitmap(canvas)
  existing.bitmap.close?.()
  existing.bitmap = bitmap
  existing.width = bitmap.width
  existing.height = bitmap.height
  if (persist) {
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
    existing.blob = blob
    void putAsset({ id, name: existing.name, type: 'image/png', blob, width: bitmap.width, height: bitmap.height })
  }
  notify()
}
