import { apiFetch, errorMessageFrom } from '../../api/client'
import { idb } from './idb'
import type { Doc } from './model'
import { uid } from './model'

/** Font catalogue for the editor: system fonts, a curated Google Fonts list (loaded on demand),
 * the bundled Anton, and user-uploaded TTF / OTF / WOFF / WOFF2 files. Uploaded files are registered
 * with the FontFace API, kept in IndexedDB, and mirrored to the backend (when reachable) so they
 * follow the user to other devices. */

export type FontKind = 'system' | 'google' | 'bundled' | 'custom'
export interface FontEntry {
  family: string
  kind: FontKind
  category: 'Sans' | 'Serif' | 'Display' | 'Script' | 'Mono' | 'System' | 'Uploaded'
  /** Real bold / italic faces are requested from Google for these; others are synthesised by the browser. */
  bold?: boolean
  italic?: boolean
}

export const SYSTEM_FONTS: FontEntry[] = [
  { family: 'Arial', kind: 'system', category: 'System' },
  { family: 'Helvetica', kind: 'system', category: 'System' },
  { family: 'Verdana', kind: 'system', category: 'System' },
  { family: 'Trebuchet MS', kind: 'system', category: 'System' },
  { family: 'Georgia', kind: 'system', category: 'System' },
  { family: 'Times New Roman', kind: 'system', category: 'System' },
  { family: 'Courier New', kind: 'system', category: 'System' },
  { family: 'Impact', kind: 'system', category: 'System' },
]

export const GOOGLE_FONTS: FontEntry[] = [
  { family: 'Inter', kind: 'google', category: 'Sans', bold: true },
  { family: 'Roboto', kind: 'google', category: 'Sans', bold: true, italic: true },
  { family: 'Open Sans', kind: 'google', category: 'Sans', bold: true, italic: true },
  { family: 'Montserrat', kind: 'google', category: 'Sans', bold: true, italic: true },
  { family: 'Poppins', kind: 'google', category: 'Sans', bold: true, italic: true },
  { family: 'Lato', kind: 'google', category: 'Sans', bold: true, italic: true },
  { family: 'Work Sans', kind: 'google', category: 'Sans', bold: true },
  { family: 'DM Sans', kind: 'google', category: 'Sans', bold: true },
  { family: 'Nunito', kind: 'google', category: 'Sans', bold: true },
  { family: 'Raleway', kind: 'google', category: 'Sans', bold: true },
  { family: 'Oswald', kind: 'google', category: 'Display', bold: true },
  { family: 'Bebas Neue', kind: 'google', category: 'Display' },
  { family: 'Archivo Black', kind: 'google', category: 'Display' },
  { family: 'Bangers', kind: 'google', category: 'Display' },
  { family: 'Abril Fatface', kind: 'google', category: 'Display' },
  { family: 'Permanent Marker', kind: 'google', category: 'Display' },
  { family: 'Playfair Display', kind: 'google', category: 'Serif', bold: true, italic: true },
  { family: 'Merriweather', kind: 'google', category: 'Serif', bold: true, italic: true },
  { family: 'Lora', kind: 'google', category: 'Serif', bold: true, italic: true },
  { family: 'DM Serif Display', kind: 'google', category: 'Serif' },
  { family: 'Pacifico', kind: 'google', category: 'Script' },
  { family: 'Dancing Script', kind: 'google', category: 'Script', bold: true },
  { family: 'Caveat', kind: 'google', category: 'Script', bold: true },
  { family: 'Lobster', kind: 'google', category: 'Script' },
  { family: 'JetBrains Mono', kind: 'google', category: 'Mono', bold: true },
]

export const BUNDLED_FONTS: FontEntry[] = [{ family: 'Anton', kind: 'bundled', category: 'Display' }]

// ---------------------------------------------------------------------------------------------
// Google Fonts

const requested = new Set<string>()
function googleHref(f: FontEntry): string {
  const name = f.family.replace(/ /g, '+')
  let axis = ''
  if (f.bold && f.italic) axis = ':ital,wght@0,400;0,700;1,400;1,700'
  else if (f.bold) axis = ':wght@400;700'
  return `https://fonts.googleapis.com/css2?family=${name}${axis}&display=swap`
}

/** Adds the stylesheet link once. One <link> per family so a single bad request can't break the rest. */
export function requestGoogleFont(f: FontEntry) {
  if (f.kind !== 'google' || requested.has(f.family)) return
  requested.add(f.family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = googleHref(f)
  document.head.appendChild(link)
}
export function requestAllGoogleFonts() {
  for (const f of GOOGLE_FONTS) requestGoogleFont(f)
}

export function findFont(family: string): FontEntry | undefined {
  return [...customList.map(customEntry), ...BUNDLED_FONTS, ...GOOGLE_FONTS, ...SYSTEM_FONTS].find((f) => f.family === family)
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(fallback)
      },
    )
  })
}

/** Resolves once the face (at the weight/style asked for) is ready, so canvas text measures correctly. */
export async function ensureFont(family: string, bold = false, italic = false): Promise<void> {
  if (!family || typeof document === 'undefined' || !document.fonts) return
  const entry = findFont(family)
  if (entry?.kind === 'google') requestGoogleFont(entry)
  const spec = `${italic ? 'italic ' : ''}${bold ? 700 : 400} 32px "${family}"`
  await withTimeout(document.fonts.load(spec), 5000, [])
}

export async function ensureDocFonts(doc: Doc): Promise<void> {
  const need = new Map<string, [boolean, boolean]>()
  for (const p of doc.pages)
    for (const o of p.objects)
      if (o.type === 'text' && !o.hidden) need.set(`${o.fontFamily}|${o.bold}|${o.italic}`, [o.bold, o.italic])
  await Promise.all(
    [...need.keys()].map((k) => {
      const [family] = k.split('|')
      const [b, i] = need.get(k)!
      return ensureFont(family, b, i)
    }),
  )
}

// ---------------------------------------------------------------------------------------------
// Custom (uploaded) fonts

export interface CustomFontRecord {
  id: string
  family: string
  format: 'ttf' | 'otf' | 'woff' | 'woff2'
  size: number
  sha: string
  createdAt: number
  remoteId?: string | null
  blob: Blob
}

let customList: CustomFontRecord[] = []
const faces = new Map<string, FontFace>()
const fontListeners = new Set<() => void>()
export function onFontsChanged(cb: () => void) {
  fontListeners.add(cb)
  return () => fontListeners.delete(cb)
}
function notifyFonts() {
  for (const l of fontListeners) l()
}

export function customEntry(r: CustomFontRecord): FontEntry {
  return { family: r.family, kind: 'custom', category: 'Uploaded' }
}
export function getCustomFonts(): CustomFontRecord[] {
  return customList
}

const FORMATS: Record<string, CustomFontRecord['format']> = { ttf: 'ttf', otf: 'otf', woff: 'woff', woff2: 'woff2' }
export const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2'

async function sha256(buf: ArrayBuffer): Promise<string> {
  try {
    const d = await crypto.subtle.digest('SHA-256', buf)
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // insecure context: a cheap content fingerprint is enough for de-duplication
    const a = new Uint8Array(buf)
    let h = 2166136261
    for (let i = 0; i < a.length; i += Math.max(1, a.length >> 12)) h = Math.imul(h ^ a[i], 16777619)
    return `fp${a.length.toString(16)}${(h >>> 0).toString(16)}`
  }
}

function sniff(buf: ArrayBuffer): CustomFontRecord['format'] | null {
  const b = new Uint8Array(buf.slice(0, 4))
  const tag = String.fromCharCode(...b)
  if (tag === 'wOFF') return 'woff'
  if (tag === 'wOF2') return 'woff2'
  if (tag === 'OTTO') return 'otf'
  if (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) return 'ttf'
  if (tag === 'true') return 'ttf'
  return null
}

function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/[-]+/g, ' ')
  return base.replace(/\s+/g, ' ').trim() || 'Custom font'
}

function uniqueFamily(name: string): string {
  const taken = new Set([...customList.map((f) => f.family), ...GOOGLE_FONTS.map((f) => f.family), ...SYSTEM_FONTS.map((f) => f.family), ...BUNDLED_FONTS.map((f) => f.family)])
  if (!taken.has(name)) return name
  for (let i = 2; i < 100; i++) if (!taken.has(`${name} ${i}`)) return `${name} ${i}`
  return `${name} ${uid().slice(0, 4)}`
}

async function register(rec: CustomFontRecord): Promise<void> {
  const buf = await rec.blob.arrayBuffer()
  const face = new FontFace(rec.family, buf)
  await face.load() // throws on a corrupt / unsupported file
  document.fonts.add(face)
  faces.set(rec.id, face)
}

/** Validates (extension, magic bytes, and an actual FontFace parse), then stores + registers. */
export async function addCustomFont(file: File): Promise<CustomFontRecord> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!FORMATS[ext]) throw new Error(`"${file.name}" is not a font file. Use TTF, OTF, WOFF or WOFF2.`)
  if (file.size > 12 * 1024 * 1024) throw new Error('That font file is larger than 12 MB.')
  const buf = await file.arrayBuffer()
  const real = sniff(buf)
  if (!real) throw new Error(`"${file.name}" does not look like a valid ${ext.toUpperCase()} font.`)
  const sha = await sha256(buf)
  const dupe = customList.find((f) => f.sha === sha)
  if (dupe) throw new Error(`"${dupe.family}" is already uploaded.`)
  const rec: CustomFontRecord = {
    id: uid(),
    family: uniqueFamily(nameFromFile(file.name)),
    format: real,
    size: file.size,
    sha,
    createdAt: Date.now(),
    remoteId: null,
    blob: new Blob([buf], { type: `font/${real}` }),
  }
  try {
    await register(rec)
  } catch {
    throw new Error(`"${file.name}" could not be read as a font. The file may be damaged.`)
  }
  customList = [rec, ...customList]
  try {
    await idb.put('fonts', rec)
  } catch {
    // session-only if storage is blocked
  }
  notifyFonts()
  void syncFonts()
  return rec
}

export async function removeCustomFont(id: string): Promise<void> {
  const rec = customList.find((f) => f.id === id)
  if (!rec) return
  customList = customList.filter((f) => f.id !== id)
  const face = faces.get(id)
  if (face) document.fonts.delete(face)
  faces.delete(id)
  try {
    await idb.delete('fonts', id)
  } catch {
    // ignore
  }
  if (rec.remoteId) void remote.remove(rec.remoteId).catch(() => undefined)
  notifyFonts()
}

let initPromise: Promise<void> | null = null
/** Registers every stored font. Call once when the editor opens; safe to call repeatedly. */
export function initCustomFonts(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      let recs: CustomFontRecord[] = []
      try {
        recs = await idb.getAll<CustomFontRecord>('fonts')
      } catch {
        recs = []
      }
      recs.sort((a, b) => b.createdAt - a.createdAt)
      const ok: CustomFontRecord[] = []
      await Promise.all(
        recs.map(async (r) => {
          try {
            await register(r)
            ok.push(r)
          } catch {
            // skip a damaged record
          }
        }),
      )
      customList = ok.sort((a, b) => b.createdAt - a.createdAt)
      notifyFonts()
      void syncFonts()
    })()
  }
  return initPromise
}

// ---------------------------------------------------------------------------------------------
// Backend mirror (cross-device). Entirely optional: every failure is swallowed.

interface RemoteFont {
  id: number
  family: string
  format: CustomFontRecord['format']
  size: number
  sha256: string
}
const remote = {
  list: async (): Promise<RemoteFont[]> => {
    const res = await apiFetch('/api/posts/fonts')
    if (!res.ok) throw new Error(await errorMessageFrom(res))
    return res.json()
  },
  upload: async (rec: CustomFontRecord): Promise<RemoteFont> => {
    const form = new FormData()
    form.append('font', new File([rec.blob], `${rec.family}.${rec.format}`, { type: rec.blob.type }))
    form.append('family', rec.family)
    form.append('sha256', rec.sha)
    const res = await apiFetch('/api/posts/fonts', { method: 'POST', body: form })
    if (!res.ok) throw new Error(await errorMessageFrom(res))
    return res.json()
  },
  file: async (id: number): Promise<Blob> => {
    const res = await apiFetch(`/api/posts/fonts/${id}/file`)
    if (!res.ok) throw new Error(await errorMessageFrom(res))
    return res.blob()
  },
  remove: async (id: number | string): Promise<void> => {
    const res = await apiFetch(`/api/posts/fonts/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await errorMessageFrom(res))
  },
}

export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline'
let syncState: SyncState = 'idle'
export function getSyncState() {
  return syncState
}
let syncing: Promise<void> | null = null
let resync = false
export function syncFonts(): Promise<void> {
  if (syncing) {
    resync = true // a font was added mid-sync: run once more when this pass ends
    return syncing
  }
  syncing = (async () => {
    syncState = 'syncing'
    notifyFonts()
    try {
      const list = await remote.list()
      const bySha = new Map(list.map((r) => [r.sha256, r]))
      // down: fonts uploaded on another device
      for (const r of list) {
        if (customList.some((f) => f.sha === r.sha256)) continue
        try {
          const blob = await remote.file(r.id)
          const rec: CustomFontRecord = {
            id: uid(),
            family: uniqueFamily(r.family),
            format: r.format,
            size: r.size,
            sha: r.sha256,
            createdAt: Date.now(),
            remoteId: String(r.id),
            blob,
          }
          await register(rec)
          customList = [rec, ...customList]
          await idb.put('fonts', rec).catch(() => undefined)
        } catch {
          // skip this one
        }
      }
      // up: local fonts the server doesn't have yet
      for (const rec of [...customList]) {
        const have = bySha.get(rec.sha)
        if (have) {
          if (!rec.remoteId) {
            rec.remoteId = String(have.id)
            await idb.put('fonts', rec).catch(() => undefined)
          }
          continue
        }
        try {
          const up = await remote.upload(rec)
          rec.remoteId = String(up.id)
          await idb.put('fonts', rec).catch(() => undefined)
        } catch {
          // keep local-only
        }
      }
      syncState = 'synced'
    } catch {
      syncState = 'offline'
    } finally {
      syncing = null
      notifyFonts()
      if (resync) {
        resync = false
        void syncFonts()
      }
    }
  })()
  return syncing
}
