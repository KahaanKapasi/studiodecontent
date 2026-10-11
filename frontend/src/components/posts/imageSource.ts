import { postsApi } from '../../api/client'

/** Browser-side image preparation for the Posts editor: big uploads are shrunk once (so the
 * upload, the cutout request and every fabric filter pass work on <= 2048 px, not a 12 MP photo),
 * and decoded bitmaps are cached by File identity so template/aspect switches never re-decode. */

export const MAX_SOURCE_SIDE = 2048
const REENCODE_ABOVE_BYTES = 3 * 1024 * 1024
const ALPHA_TYPES = new Set(['image/png', 'image/webp', 'image/gif', 'image/avif'])

const bitmapCache = new WeakMap<File, Promise<ImageBitmap>>()
const cutoutCache = new WeakMap<File, Promise<ImageBitmap>>()
const cutoutReady = new WeakMap<File, ImageBitmap>()

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function loadBitmap(file: File): Promise<ImageBitmap> {
  let p = bitmapCache.get(file)
  if (!p) {
    p = createImageBitmap(file) // honours EXIF orientation by default
    p.catch(() => bitmapCache.delete(file))
    bitmapCache.set(file, p)
  }
  return p
}

/** Downscales to MAX_SOURCE_SIDE (JPEG 0.9, or PNG when the source can carry transparency).
 * Returns the original File untouched when it is already small. */
export async function prepareImage(file: File): Promise<File> {
  const bmp = await createImageBitmap(file)
  const long = Math.max(bmp.width, bmp.height)
  if (long <= MAX_SOURCE_SIDE && file.size <= REENCODE_ABOVE_BYTES) {
    bitmapCache.set(file, Promise.resolve(bmp))
    return file
  }
  const k = Math.min(1, MAX_SOURCE_SIDE / long)
  const w = Math.max(1, Math.round(bmp.width * k))
  const h = Math.max(1, Math.round(bmp.height * k))
  const canvas = newCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const type = ALPHA_TYPES.has(file.type) ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.9))
  if (!blob) throw new Error('Could not process image')
  const ext = type === 'image/png' ? 'png' : 'jpg'
  const out = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type })
  bitmapCache.set(out, createImageBitmap(canvas))
  return out
}

/** Scale-to-cover + centre crop of the source onto a w x h canvas (the browser twin of the
 * server's _fit_cover), so every treatment starts from a canvas-shaped bitmap. */
export function coverCanvas(src: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const canvas = newCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  const scale = Math.max(w / src.width, h / src.height)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h)
  return canvas
}

/** Mean luminance (0..255) of a canvas, from a 32x32 downsample. */
export function meanLuma(source: CanvasImageSource): number {
  const c = newCanvas(32, 32)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, 32, 32)
  const d = ctx.getImageData(0, 0, 32, 32).data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  return Math.round(sum / (d.length / 4))
}

/** Same placement as the server (image_processing._treat_background_removed): fit inside
 * (W-120) x 75% H, centred, nudged 40 px up, on solid black. */
export function composeCutout(cutout: ImageBitmap, w: number, h: number): HTMLCanvasElement {
  const canvas = newCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  const maxW = w - 120
  const maxH = Math.floor(h * 0.75)
  const scale = Math.min(maxW / cutout.width, maxH / cutout.height)
  const cw = Math.max(1, Math.round(cutout.width * scale))
  const ch = Math.max(1, Math.round(cutout.height * scale))
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(cutout, Math.floor((w - cw) / 2), Math.floor((h - ch) / 2) - 40, cw, ch)
  return canvas
}

export function getReadyCutout(file: File): ImageBitmap | undefined {
  return cutoutReady.get(file)
}

/** Subject cutout (transparent PNG) for this exact File — requested from the server ONCE and
 * then reused for every template/aspect switch. */
export function getCutout(file: File): Promise<ImageBitmap> {
  let p = cutoutCache.get(file)
  if (!p) {
    p = postsApi.cutout(file).then(async (blob) => {
      const bmp = await createImageBitmap(blob)
      cutoutReady.set(file, bmp)
      return bmp
    })
    p.catch(() => cutoutCache.delete(file)) // let the user retry after a failure
    cutoutCache.set(file, p)
  }
  return p
}
