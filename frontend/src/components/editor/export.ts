import * as fabric from 'fabric'
import { preloadDocAssets } from './assets'
import { buildObject, pageBackgroundFill } from './fabricBuild'
import { ensureFont } from './fonts'
import type { Doc, Page } from './model'

/** Full-resolution renderer. It builds a fresh fabric StaticCanvas from the document model with the
 * very same builders the on-screen pages use, so exports match what the editor shows. */

async function ensurePageFonts(page: Page) {
  const need = new Map<string, [string, boolean, boolean]>()
  for (const o of page.objects) if (o.type === 'text' && !o.hidden) need.set(`${o.fontFamily}|${o.bold}|${o.italic}`, [o.fontFamily, o.bold, o.italic])
  await Promise.all([...need.values()].map(([f, b, i]) => ensureFont(f, b, i)))
}

export async function renderPage(doc: Doc, page: Page, scale = 1): Promise<HTMLCanvasElement> {
  await preloadDocAssets({ ...doc, pages: [page] })
  await ensurePageFonts(page)
  const clear = (fabric.util as unknown as { clearFabricFontCache?: () => void }).clearFabricFontCache
  clear?.()
  const el = document.createElement('canvas')
  const sc = new fabric.StaticCanvas(el, {
    width: doc.width,
    height: doc.height,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  })
  sc.backgroundColor = pageBackgroundFill(page.background, doc.width, doc.height)
  const ctx = { interactive: false, maxBake: Infinity, accent: '#000000' }
  for (const m of page.objects) {
    if (m.hidden) continue
    sc.add(buildObject(m, ctx))
  }
  sc.renderAll()
  const out = sc.toCanvasElement(scale)
  sc.dispose()
  return out
}

export type ExportFormat = 'png' | 'jpg' | 'pdf'

function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), type, quality))
}

export async function renderBlob(doc: Doc, page: Page, format: 'png' | 'jpg', quality = 0.92, scale = 1): Promise<Blob> {
  const c = await renderPage(doc, page, scale)
  return canvasToBlob(c, format === 'png' ? 'image/png' : 'image/jpeg', format === 'png' ? undefined : quality)
}

export function slug(s: string): string {
  return (s || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'design'
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export interface ExportOptions {
  format: ExportFormat
  /** 0.1 - 1, JPG only */
  quality: number
  /** pixel multiplier: 1 = the design's own size (e.g. 1080 x 1350) */
  scale: number
  pageIds: string[]
}

export interface ExportResult {
  filename: string
  blob: Blob
  width: number
  height: number
  files: number
}

/** Builds the download (a single image, a ZIP of images, or a multi-page PDF) without triggering it. */
export async function buildExport(doc: Doc, opts: ExportOptions, onProgress?: (done: number, total: number) => void): Promise<ExportResult> {
  const pages = doc.pages.filter((p) => opts.pageIds.includes(p.id))
  if (!pages.length) throw new Error('Select at least one page to download.')
  const base = slug(doc.title)
  const W = Math.round(doc.width * opts.scale)
  const H = Math.round(doc.height * opts.scale)

  if (opts.format === 'pdf') {
    const { jsPDF } = await import('jspdf')
    const orient = W >= H ? 'landscape' : 'portrait'
    // 1 design px = 1 CSS px = 0.75 pt, the same convention browsers print with
    const pdf = new jsPDF({ orientation: orient, unit: 'px', format: [W, H], hotfixes: ['px_scaling'], compress: true })
    for (let i = 0; i < pages.length; i++) {
      const c = await renderPage(doc, pages[i], opts.scale)
      if (i > 0) pdf.addPage([W, H], orient)
      pdf.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, W, H, undefined, 'FAST')
      onProgress?.(i + 1, pages.length)
    }
    return { filename: `${base}.pdf`, blob: pdf.output('blob'), width: W, height: H, files: 1 }
  }

  const ext = opts.format
  const blobs: { name: string; blob: Blob }[] = []
  for (let i = 0; i < pages.length; i++) {
    const blob = await renderBlob(doc, pages[i], opts.format, opts.quality, opts.scale)
    const n = doc.pages.indexOf(pages[i]) + 1
    blobs.push({ name: `${base}-${n}.${ext}`, blob })
    onProgress?.(i + 1, pages.length)
  }
  if (blobs.length === 1) return { filename: blobs[0].name, blob: blobs[0].blob, width: W, height: H, files: 1 }
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const b of blobs) zip.file(b.name, b.blob)
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return { filename: `${base}.zip`, blob, width: W, height: H, files: blobs.length }
}

export async function downloadExport(doc: Doc, opts: ExportOptions, onProgress?: (done: number, total: number) => void): Promise<ExportResult> {
  const r = await buildExport(doc, opts, onProgress)
  save(r.blob, r.filename)
  return r
}

// thumbnails ------------------------------------------------------------------------------------

const thumbs = new WeakMap<Page, Map<number, Promise<string>>>()
export function getPageThumb(doc: Doc, page: Page, maxW: number): Promise<string> {
  let byW = thumbs.get(page)
  if (!byW) {
    byW = new Map()
    thumbs.set(page, byW)
  }
  const key = Math.round(maxW) * 100000 + doc.width
  let p = byW.get(key)
  if (!p) {
    p = renderPage(doc, page, Math.min(1, maxW / doc.width)).then((c) => c.toDataURL('image/jpeg', 0.72))
    byW.set(key, p)
    p.catch(() => byW!.delete(key))
  }
  return p
}
