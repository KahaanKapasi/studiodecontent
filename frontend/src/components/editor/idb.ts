/** Minimal promise wrapper over IndexedDB. Stores: designs, assets, fonts. Every call can reject
 * (private windows, blocked storage) - callers treat persistence as best-effort. */

const DB_NAME = 'contentstudio-editor'
const DB_VERSION = 1
export type StoreName = 'designs' | 'assets' | 'fonts'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const name of ['designs', 'assets', 'fonts'] as StoreName[]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    })
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export const idb = {
  get: <T>(store: StoreName, id: string) => run<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>),
  getAll: <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  put: (store: StoreName, value: unknown) => run(store, 'readwrite', (s) => s.put(value)),
  delete: (store: StoreName, id: string) => run(store, 'readwrite', (s) => s.delete(id)),
}
