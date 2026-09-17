import type { Asset, ProjectRecord } from '../types'

const DB_NAME = 'thumbnail-studio'
const DB_VERSION = 1
const PROJECTS = 'projects'
const ASSETS = 'assets'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = run(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export function putProject(project: ProjectRecord): Promise<IDBValidKey> {
  return tx(PROJECTS, 'readwrite', (s) => s.put(project))
}

export function getProject(id: string): Promise<ProjectRecord | undefined> {
  return tx(PROJECTS, 'readonly', (s) => s.get(id) as IDBRequest<ProjectRecord | undefined>)
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const all = await tx(PROJECTS, 'readonly', (s) => s.getAll() as IDBRequest<ProjectRecord[]>)
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function deleteProject(id: string): Promise<undefined> {
  return tx(PROJECTS, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>)
}

export function putAsset(asset: Asset): Promise<IDBValidKey> {
  return tx(ASSETS, 'readwrite', (s) => s.put(asset))
}

export function getAsset(id: string): Promise<Asset | undefined> {
  return tx(ASSETS, 'readonly', (s) => s.get(id) as IDBRequest<Asset | undefined>)
}

/** Drops assets that no surviving project references. */
export async function pruneAssets(keep: Set<string>): Promise<void> {
  const db = await open()
  const t = db.transaction(ASSETS, 'readwrite')
  const store = t.objectStore(ASSETS)
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const req = store.getAllKeys()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  keys.forEach((key) => {
    if (typeof key === 'string' && !keep.has(key)) store.delete(key)
  })
}
