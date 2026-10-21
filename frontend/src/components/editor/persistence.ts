import { preloadDocAssets } from './assets'
import { engine } from './engine'
import { buildTemplateText } from './actions'
import { getPageThumb } from './export'
import { ensureDocFonts, initCustomFonts } from './fonts'
import { idb } from './idb'
import { newDoc, uid, type Doc } from './model'
import { editorStore } from './store'

/** Designs live in IndexedDB (pages + JSON state + a small thumbnail). The backend has no model that can
 * hold a design with its images, so cross-device sync of designs is not attempted (see docs). */

export interface DesignRecord {
  id: string
  title: string
  updatedAt: number
  pageCount: number
  width: number
  height: number
  thumb?: string
  doc: Doc
}

const LAST_KEY = 'contentstudio.editor.last'
const mem = new Map<string, DesignRecord>() // fallback when IndexedDB is unavailable

function setLast(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id)
  } catch {
    // storage blocked
  }
}
function getLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

export async function listDesigns(): Promise<DesignRecord[]> {
  let recs: DesignRecord[] = []
  try {
    recs = await idb.getAll<DesignRecord>('designs')
  } catch {
    recs = [...mem.values()]
  }
  return recs.sort((a, b) => b.updatedAt - a.updatedAt)
}

async function putRecord(rec: DesignRecord) {
  mem.set(rec.id, rec)
  await idb.put('designs', rec)
}

export async function loadDesignRecord(id: string): Promise<DesignRecord | undefined> {
  try {
    return await idb.get<DesignRecord>('designs', id)
  } catch {
    return mem.get(id)
  }
}

export async function deleteDesign(id: string) {
  mem.delete(id)
  try {
    await idb.delete('designs', id)
  } catch {
    // ignore
  }
}

export async function duplicateDesign(id: string): Promise<DesignRecord | undefined> {
  const src = await loadDesignRecord(id)
  if (!src) return
  const doc: Doc = { ...src.doc, id: uid(), title: `${src.doc.title} copy`, createdAt: Date.now(), updatedAt: Date.now() }
  const rec: DesignRecord = { ...src, id: doc.id, title: doc.title, updatedAt: doc.updatedAt, doc }
  await putRecord(rec).catch(() => undefined)
  return rec
}

let lastThumb: { id: string; thumb: string } | null = null
let saveTimer = 0
let thumbTimer = 0
let saving: Promise<void> = Promise.resolve()

async function writeCurrent(withThumb: boolean) {
  const doc = editorStore.getState().doc
  let thumb = lastThumb && lastThumb.id === doc.id ? lastThumb.thumb : undefined
  if (withThumb && doc.pages[0]) {
    try {
      thumb = await getPageThumb(doc, doc.pages[0], 260)
      lastThumb = { id: doc.id, thumb }
    } catch {
      // thumbnail is cosmetic
    }
  }
  const rec: DesignRecord = { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, pageCount: doc.pages.length, width: doc.width, height: doc.height, thumb, doc }
  await putRecord(rec)
  setLast(doc.id)
}

export function flushSave(): Promise<void> {
  window.clearTimeout(saveTimer)
  const docAtStart = editorStore.getState().doc
  editorStore.set({ saveStatus: 'saving' })
  saving = saving
    .then(() => writeCurrent(false))
    .then(() => {
      if (editorStore.getState().doc === docAtStart) editorStore.set({ saveStatus: 'saved' })
      else editorStore.set({ saveStatus: 'unsaved' })
    })
    .catch(() => editorStore.set({ saveStatus: 'error' }))
  return saving
}

function scheduleSave() {
  window.clearTimeout(saveTimer)
  window.clearTimeout(thumbTimer)
  saveTimer = window.setTimeout(() => void flushSave(), 1200)
  thumbTimer = window.setTimeout(() => {
    void writeCurrent(true).catch(() => undefined)
  }, 5000)
}

export function startAutosave(): () => void {
  const off = editorStore.onDocChange(() => scheduleSave())
  const onUnload = () => {
    engine.finishEditing()
    void writeCurrent(false)
  }
  window.addEventListener('beforeunload', onUnload)
  return () => {
    off()
    window.removeEventListener('beforeunload', onUnload)
    window.clearTimeout(saveTimer)
    window.clearTimeout(thumbTimer)
  }
}

export async function openDesign(id: string): Promise<boolean> {
  engine.finishEditing()
  if (editorStore.getState().designLoaded) await flushSave()
  const rec = await loadDesignRecord(id)
  if (!rec) return false
  await preloadDocAssets(rec.doc)
  await ensureDocFonts(rec.doc)
  lastThumb = rec.thumb ? { id: rec.id, thumb: rec.thumb } : null
  editorStore.loadDoc(rec.doc)
  setLast(rec.id)
  return true
}

export function createDoc(width: number, height: number): Doc {
  const doc = newDoc(width, height)
  doc.pages[0].objects = buildTemplateText(1, width, height, 'Your opinion goes here')
  return doc
}

export async function newDesign(width: number, height: number) {
  engine.finishEditing()
  if (editorStore.getState().designLoaded) await flushSave()
  const doc = createDoc(width, height)
  await ensureDocFonts(doc)
  lastThumb = null
  editorStore.loadDoc(doc)
  await writeCurrent(false).catch(() => editorStore.set({ saveStatus: 'error' }))
}

/** Opens the last design (or a fresh 1:1 one). Fonts are registered first so text measures correctly. */
let booting: Promise<void> | null = null
export function bootEditor(): Promise<void> {
  // React StrictMode runs effects twice in dev; a second boot must not create a second blank design.
  if (!booting) {
    booting = (async () => {
      await initCustomFonts()
      const last = getLast()
      if (last && (await openDesign(last))) return
      await newDesign(1080, 1080)
    })()
    booting.catch(() => {
      booting = null
    })
  }
  return booting
}
