import { useRef, useSyncExternalStore } from 'react'
import { newDoc, type Doc, type ObjModel, type Page } from './model'

export type PanelId = 'design' | 'elements' | 'text' | 'uploads' | 'brand' | 'projects' | 'opinions' | 'editimage' | null
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export interface Selection {
  pageId: string | null
  ids: string[]
}

export interface Notice {
  id: number
  kind: 'info' | 'error'
  text: string
}

export interface EditorState {
  doc: Doc
  activePageId: string
  selection: Selection
  zoom: number
  fit: boolean
  view: 'scroll' | 'grid'
  saveStatus: SaveStatus
  cropId: string | null
  cropRatioId: string
  cropCmd: 'done' | 'cancel' | null
  panel: PanelId
  /** True while a slider / drag is held: image bakes drop to a quicker, lower resolution. */
  interacting: boolean
  notice: Notice | null
  busy: Record<string, string>
  histVersion: number
  designLoaded: boolean
}

const HISTORY_LIMIT = 200

export function findObj(doc: Doc, id: string): { page: Page; obj: ObjModel; index: number } | null {
  for (const page of doc.pages) {
    const index = page.objects.findIndex((o) => o.id === id)
    if (index >= 0) return { page, obj: page.objects[index], index }
  }
  return null
}

export function mapPage(doc: Doc, pageId: string, fn: (p: Page) => Page): Doc {
  return { ...doc, pages: doc.pages.map((p) => (p.id === pageId ? fn(p) : p)) }
}

/** Applies `fn` to every object whose id is in `ids`; untouched objects/pages keep their reference. */
export function mapObjects(doc: Doc, ids: readonly string[], fn: (o: ObjModel) => ObjModel): Doc {
  const set = new Set(ids)
  let changed = false
  const pages = doc.pages.map((p) => {
    if (!p.objects.some((o) => set.has(o.id))) return p
    changed = true
    return { ...p, objects: p.objects.map((o) => (set.has(o.id) ? fn(o) : o)) }
  })
  return changed ? { ...doc, pages } : doc
}

export function patchObjects(doc: Doc, ids: readonly string[], patch: Record<string, unknown>): Doc {
  return mapObjects(doc, ids, (o) => ({ ...o, ...patch }) as ObjModel)
}

type Listener = () => void

class EditorStore {
  private state: EditorState
  private listeners = new Set<Listener>()
  private past: Doc[] = []
  private future: Doc[] = []
  private lastKey: string | null = null
  private lastTime = 0
  private noticeSeq = 0
  /** Fired after every document change (not selection/view changes). */
  private docListeners = new Set<(doc: Doc) => void>()

  constructor() {
    const doc = newDoc(1080, 1080)
    this.state = {
      doc,
      activePageId: doc.pages[0].id,
      selection: { pageId: null, ids: [] },
      zoom: 0.5,
      fit: true,
      view: 'scroll',
      saveStatus: 'saved',
      cropId: null,
      cropRatioId: 'free',
      cropCmd: null,
      panel: 'design',
      interacting: false,
      notice: null,
      busy: {},
      histVersion: 0,
      designLoaded: false,
    }
  }

  getState = (): EditorState => this.state
  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  onDocChange(l: (doc: Doc) => void) {
    this.docListeners.add(l)
    return () => this.docListeners.delete(l)
  }

  private emit() {
    for (const l of this.listeners) l()
  }
  set(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  /** Replace the whole document (open / new design). Clears history. */
  loadDoc(doc: Doc) {
    this.past = []
    this.future = []
    this.lastKey = null
    this.state = {
      ...this.state,
      doc,
      activePageId: doc.pages[0]?.id ?? '',
      selection: { pageId: null, ids: [] },
      cropId: null,
      saveStatus: 'saved',
      histVersion: this.state.histVersion + 1,
      designLoaded: true,
    }
    this.emit()
  }

  /** Every user-visible edit goes through here, so undo/redo covers all of it. `key` coalesces rapid
   * repeats (slider drags, arrow nudges) into a single undo step. */
  commit(fn: (doc: Doc) => Doc, opts: { key?: string } = {}) {
    const prev = this.state.doc
    const next = fn(prev)
    if (next === prev) return
    const now = Date.now()
    const coalesce = !!opts.key && opts.key === this.lastKey && now - this.lastTime < 1000
    if (!coalesce) {
      this.past.push(prev)
      if (this.past.length > HISTORY_LIMIT) this.past.shift()
    }
    this.future = []
    this.lastKey = opts.key ?? null
    this.lastTime = now
    this.applyDoc({ ...next, updatedAt: now }, true)
  }

  /** A change that should not be undoable (e.g. a freshly cached thumbnail). */
  replaceSilently(fn: (doc: Doc) => Doc) {
    const next = fn(this.state.doc)
    if (next !== this.state.doc) this.applyDoc(next, false)
  }

  breakCoalesce() {
    this.lastKey = null
  }

  private applyDoc(doc: Doc, dirty: boolean) {
    const sel = this.state.selection
    const live = new Set(doc.pages.flatMap((p) => p.objects.filter((o) => !o.hidden).map((o) => o.id)))
    const ids = sel.ids.filter((id) => live.has(id))
    const pageOk = sel.pageId && doc.pages.some((p) => p.id === sel.pageId)
    const activeOk = doc.pages.some((p) => p.id === this.state.activePageId)
    this.state = {
      ...this.state,
      doc,
      selection: pageOk && ids.length ? { pageId: sel.pageId, ids } : { pageId: null, ids: [] },
      activePageId: activeOk ? this.state.activePageId : (doc.pages[0]?.id ?? ''),
      cropId: this.state.cropId && live.has(this.state.cropId) ? this.state.cropId : null,
      saveStatus: dirty ? 'unsaved' : this.state.saveStatus,
      histVersion: this.state.histVersion + 1,
    }
    this.emit()
    for (const l of this.docListeners) l(doc)
  }

  undo() {
    const prev = this.past.pop()
    if (!prev) return
    this.future.push(this.state.doc)
    this.lastKey = null
    this.state = { ...this.state, cropId: null }
    this.applyDoc(prev, true)
  }
  redo() {
    const next = this.future.pop()
    if (!next) return
    this.past.push(this.state.doc)
    this.lastKey = null
    this.state = { ...this.state, cropId: null }
    this.applyDoc(next, true)
  }
  canUndo() {
    return this.past.length > 0
  }
  canRedo() {
    return this.future.length > 0
  }

  setSelection(pageId: string | null, ids: string[]) {
    const cur = this.state.selection
    if (cur.pageId === pageId && cur.ids.length === ids.length && cur.ids.every((v, i) => v === ids[i])) return
    this.set({
      selection: ids.length ? { pageId, ids } : { pageId: null, ids: [] },
      activePageId: pageId && ids.length ? pageId : this.state.activePageId,
      cropId: ids.length === 1 && ids[0] === this.state.cropId ? this.state.cropId : null,
    })
  }
  setActivePage(id: string) {
    if (this.state.activePageId !== id) this.set({ activePageId: id })
  }
  setBusy(key: string, text: string | null) {
    const busy = { ...this.state.busy }
    if (text) busy[key] = text
    else delete busy[key]
    this.set({ busy })
  }
  notify(text: string, kind: Notice['kind'] = 'info') {
    this.set({ notice: { id: ++this.noticeSeq, kind, text } })
  }
}

export const editorStore = new EditorStore()

/** Subscribe to a slice of editor state. The selector must return a stable (===) value between
 * unrelated changes; derive arrays/objects with useMemo in the component instead. */
export function useEditor<T>(selector: (s: EditorState) => T): T {
  const last = useRef<{ s: EditorState; v: T } | null>(null)
  return useSyncExternalStore(editorStore.subscribe, () => {
    const s = editorStore.getState()
    if (last.current && last.current.s === s) return last.current.v
    const v = selector(s)
    if (last.current && Object.is(last.current.v, v)) {
      last.current.s = s
      return last.current.v
    }
    last.current = { s, v }
    return v
  })
}

// ---------------------------------------------------------------------------------------------
// Internal clipboard: copies hold deep model clones, so paste works across pages and designs.

let clipboard: ObjModel[] = []
let pasteCount = 0
export function setClipboard(objs: ObjModel[]) {
  clipboard = objs.map((o) => ({ ...o }))
  pasteCount = 0
}
export function getClipboard(): { objs: ObjModel[]; offset: number } {
  pasteCount += 1
  return { objs: clipboard, offset: 24 * pasteCount }
}
export function hasClipboard() {
  return clipboard.length > 0
}
