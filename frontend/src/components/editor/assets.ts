import { postsApi } from '../../api/client'
import { prepareImage } from '../posts/imageSource'
import { idb } from './idb'
import type { Doc, ImageObj } from './model'
import { uid } from './model'

/** Uploaded photos (and background-removed twins). Blobs live in IndexedDB, decoded bitmaps in memory.
 * The editor reads bitmaps synchronously through getBitmap(); a miss triggers a load and an
 * 'assets changed' notification so the canvases re-bake. */

export interface AssetMeta {
  id: string
  name: string
  mime: string
  w: number
  h: number
  thumb: string
  createdAt: number
  inGallery: boolean
  kind: 'upload' | 'cutout'
}
interface AssetRecord extends AssetMeta {
  blob: Blob
}

const metas = new Map<string, AssetMeta>()
const bitmaps = new Map<string, ImageBitmap>()
const loading = new Map<string, Promise<ImageBitmap | undefined>>()
const memoryBlobs = new Map<string, Blob>() // fallback when IndexedDB is unavailable
const listeners = new Set<() => void>()

export function onAssetsChanged(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function notify() {
  for (const l of listeners) l()
}

export function getBitmap(id: string | null | undefined): ImageBitmap | undefined {
  if (!id) return undefined
  const b = bitmaps.get(id)
  if (!b) void ensureAsset(id)
  return b
}
export function getMeta(id: string | null | undefined): AssetMeta | undefined {
  return id ? metas.get(id) : undefined
}

export function ensureAsset(id: string): Promise<ImageBitmap | undefined> {
  const have = bitmaps.get(id)
  if (have) return Promise.resolve(have)
  let p = loading.get(id)
  if (!p) {
    p = (async () => {
      try {
        let blob = memoryBlobs.get(id)
        if (!blob) {
          const rec = await idb.get<AssetRecord>('assets', id)
          if (!rec) return undefined
          const { blob: b, ...meta } = rec
          metas.set(id, meta)
          blob = b
        }
        const bmp = await createImageBitmap(blob)
        bitmaps.set(id, bmp)
        notify()
        return bmp
      } catch {
        return undefined
      } finally {
        loading.delete(id)
      }
    })()
    loading.set(id, p)
  }
  return p
}

export function docAssetIds(doc: Doc): string[] {
  const ids = new Set<string>()
  for (const p of doc.pages)
    for (const o of p.objects)
      if (o.type === 'image') {
        if (o.assetId) ids.add(o.assetId)
        if (o.cutoutId) ids.add(o.cutoutId)
      }
  return [...ids]
}
export async function preloadDocAssets(doc: Doc) {
  await Promise.all(docAssetIds(doc).map((id) => ensureAsset(id)))
}

async function makeThumb(bmp: ImageBitmap, alpha: boolean): Promise<string> {
  const k = Math.min(1, 220 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * k))
  c.height = Math.max(1, Math.round(bmp.height * k))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.8)
}

async function storeBlob(blob: Blob, name: string, kind: AssetMeta['kind'], inGallery: boolean): Promise<AssetMeta> {
  const bmp = await createImageBitmap(blob)
  const alpha = blob.type !== 'image/jpeg'
  const meta: AssetMeta = {
    id: uid(),
    name,
    mime: blob.type || 'image/jpeg',
    w: bmp.width,
    h: bmp.height,
    thumb: await makeThumb(bmp, alpha),
    createdAt: Date.now(),
    inGallery,
    kind,
  }
  metas.set(meta.id, meta)
  bitmaps.set(meta.id, bmp)
  memoryBlobs.set(meta.id, blob)
  try {
    await idb.put('assets', { ...meta, blob } satisfies AssetRecord)
    memoryBlobs.delete(meta.id)
  } catch {
    // keep the in-memory copy: the image works this session but won't survive a reload
  }
  notify()
  return meta
}

/** Downscales (<= 2048 px) and stores a photo the user brought in. */
export async function addAssetFromFile(file: File): Promise<AssetMeta> {
  const prepared = await prepareImage(file)
  return storeBlob(prepared, file.name || 'image', 'upload', true)
}

export async function getAssetFile(id: string): Promise<File> {
  let blob = memoryBlobs.get(id)
  if (!blob) blob = (await idb.get<AssetRecord>('assets', id))?.blob
  if (!blob) throw new Error('Image data is missing')
  return new File([blob], metas.get(id)?.name ?? 'image', { type: blob.type })
}

const cutoutJobs = new Map<string, Promise<AssetMeta>>()
/** Background removal through the existing backend endpoint. One request per asset. */
export function requestCutout(assetId: string): Promise<AssetMeta> {
  let p = cutoutJobs.get(assetId)
  if (!p) {
    p = (async () => {
      const file = await getAssetFile(assetId)
      const png = await postsApi.cutout(file)
      return storeBlob(png, (metas.get(assetId)?.name ?? 'image') + ' (cutout)', 'cutout', false)
    })()
    p.catch(() => cutoutJobs.delete(assetId)) // allow a retry
    cutoutJobs.set(assetId, p)
  }
  return p
}

export async function listGallery(): Promise<AssetMeta[]> {
  let all: AssetMeta[] = []
  try {
    const recs = await idb.getAll<AssetRecord>('assets')
    all = recs.map(({ blob: _blob, ...meta }) => {
      void _blob
      metas.set(meta.id, meta)
      return meta
    })
  } catch {
    all = [...metas.values()]
  }
  return all.filter((a) => a.inGallery).sort((a, b) => b.createdAt - a.createdAt)
}

/** Remove from the Uploads grid. The blob is only deleted when no design still references it. */
export async function removeFromGallery(id: string, stillUsed: boolean) {
  const meta = metas.get(id)
  if (!meta) return
  if (stillUsed) {
    meta.inGallery = false
    try {
      const rec = await idb.get<AssetRecord>('assets', id)
      if (rec) await idb.put('assets', { ...rec, inGallery: false })
    } catch {
      // best effort
    }
  } else {
    metas.delete(id)
    bitmaps.delete(id)
    memoryBlobs.delete(id)
    try {
      await idb.delete('assets', id)
    } catch {
      // best effort
    }
  }
  notify()
}

export function assetDims(img: Pick<ImageObj, 'assetId'>): { w: number; h: number } | null {
  const b = img.assetId ? bitmaps.get(img.assetId) : undefined
  if (b) return { w: b.width, h: b.height }
  const m = img.assetId ? metas.get(img.assetId) : undefined
  return m ? { w: m.w, h: m.h } : null
}
