/** Browser-side image preparation for the Posts editor: big uploads are shrunk once so storage, the
 * cutout request and every bake work on <= 2048 px, not a 12 MP photo. */

export const MAX_SOURCE_SIDE = 2048
const REENCODE_ABOVE_BYTES = 3 * 1024 * 1024
const ALPHA_TYPES = new Set(['image/png', 'image/webp', 'image/gif', 'image/avif'])

/** Downscales to MAX_SOURCE_SIDE (JPEG 0.9, or PNG when the source can carry transparency).
 * Returns the original File untouched when it is already small. */
export async function prepareImage(file: File): Promise<File> {
  const bmp = await createImageBitmap(file)
  const long = Math.max(bmp.width, bmp.height)
  if (long <= MAX_SOURCE_SIDE && file.size <= REENCODE_ABOVE_BYTES) {
    bmp.close()
    return file
  }
  const k = Math.min(1, MAX_SOURCE_SIDE / long)
  const w = Math.max(1, Math.round(bmp.width * k))
  const h = Math.max(1, Math.round(bmp.height * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const type = ALPHA_TYPES.has(file.type) ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.9))
  if (!blob) throw new Error('Could not process image')
  const ext = type === 'image/png' ? 'png' : 'jpg'
  const out = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type })
  return out
}

