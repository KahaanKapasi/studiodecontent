import { addAssetFromFile, ensureAsset, getMeta, requestCutout } from './assets'
import { engine } from './engine'
import { ensureFont, requestGoogleFont, findFont } from './fonts'
import {
  clamp,
  coverCrop,
  newImage,
  newPage,
  newShape,
  newText,
  NO_ADJUSTMENTS,
  uid,
  type FrameKind,
  type ImageObj,
  type ObjModel,
  type Page,
  type Paint,
  type ShapeKind,
  type TextObj,
} from './model'
import { editorStore, findObj, getClipboard, mapObjects, mapPage, patchObjects, setClipboard } from './store'

/** All editing operations. Each one is a single editorStore.commit(), i.e. a single undo step. */

const st = () => editorStore.getState()

export function activePage(): Page {
  const s = st()
  return s.doc.pages.find((p) => p.id === s.activePageId) ?? s.doc.pages[0]
}
export function selectedIds(): string[] {
  return st().selection.ids
}
export function selectedModels(): ObjModel[] {
  const s = st()
  const out: ObjModel[] = []
  for (const id of s.selection.ids) {
    const f = findObj(s.doc, id)
    if (f) out.push(f.obj)
  }
  return out
}

function select(pageId: string, ids: string[]) {
  editorStore.setSelection(pageId, ids)
}

export function patch(ids: readonly string[], p: Record<string, unknown>, key?: string) {
  if (!ids.length) return
  editorStore.commit((d) => patchObjects(d, ids, p), { key: key ?? `patch:${Object.keys(p).join(',')}:${ids.join(',')}` })
}
export function patchSelected(p: Record<string, unknown>, key?: string) {
  patch(selectedIds(), p, key)
}
export function mapSelected(fn: (o: ObjModel) => ObjModel, key?: string) {
  const ids = selectedIds()
  if (ids.length) editorStore.commit((d) => mapObjects(d, ids, fn), { key })
}

// ---------------------------------------------------------------------------------------------
// text

const TEXT_KINDS = {
  heading: { size: 112, bold: true, label: 'Add a heading' },
  subheading: { size: 68, bold: true, label: 'Add a subheading' },
  body: { size: 40, bold: false, label: 'Add a little bit of body text' },
} as const
export type TextKind = keyof typeof TEXT_KINDS

function textOnPage(partial: Partial<TextObj>, pos?: { x: number; y: number }, pageId?: string): TextObj {
  const doc = st().doc
  const base = newText({
    x: pos?.x ?? doc.width / 2,
    y: pos?.y ?? doc.height / 2,
    text: 'Text',
    width: Math.min(doc.width - 120, 900),
    fill: pageTextColor(pageId),
    ...partial,
  })
  return base
}

/** White on dark pages, near-black on light ones. */
function pageTextColor(pageId?: string): string {
  const d = st().doc
  const page = d.pages.find((p) => p.id === (pageId ?? st().activePageId)) ?? d.pages[0]
  const bg = typeof page.background === 'string' ? page.background : page.background.stops[0].color
  const m = /^#([0-9a-f]{6})$/i.exec(bg)
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#111111' : '#ffffff'
}

export function addObjects(objs: ObjModel[], pageId = st().activePageId, opts: { atIndex?: number; key?: string } = {}) {
  if (!objs.length) return
  editorStore.commit((d) =>
    mapPage(d, pageId, (p) => {
      const list = [...p.objects]
      if (opts.atIndex !== undefined) list.splice(opts.atIndex, 0, ...objs)
      else list.push(...objs)
      return { ...p, objects: list }
    }),
  )
  select(pageId, objs.map((o) => o.id))
}

export function addText(kind: TextKind, pos?: { x: number; y: number }) {
  const k = TEXT_KINDS[kind]
  const t = textOnPage({ text: k.label, fontSize: k.size, bold: k.bold, fontFamily: 'Montserrat' }, pos)
  requestGoogleFont(findFont('Montserrat')!)
  void ensureFont('Montserrat', true)
  addObjects([t])
  engine.editText(t.id)
}

export interface TextCombo {
  id: string
  label: string
  make: (W: number, H: number, fill: string) => TextObj[]
}
export const TEXT_COMBOS: TextCombo[] = [
  {
    id: 'anton-sub',
    label: 'Condensed headline',
    make: (W, H, fill) => [
      newText({ x: W / 2, y: H / 2 - 50, text: 'MATCH DAY', width: W - 160, fontFamily: 'Anton', fontSize: 168, fill, caseMode: 'upper', letterSpacing: 40 }),
      newText({ x: W / 2, y: H / 2 + 90, text: 'Tonight at the Bernabeu', width: W - 200, fontFamily: 'Montserrat', fontSize: 44, fill, letterSpacing: 120 }),
    ],
  },
  {
    id: 'serif-quote',
    label: 'Editorial quote',
    make: (W, H, fill) => [
      newText({ x: W / 2, y: H / 2 - 20, text: 'Football is a game of moments.', width: W - 220, fontFamily: 'Playfair Display', fontSize: 96, italic: true, fill, lineHeight: 1.15 }),
      newText({ x: W / 2, y: H / 2 + 200, text: 'MADRIDONOMY', width: W - 220, fontFamily: 'Montserrat', fontSize: 30, bold: true, fill, letterSpacing: 300 }),
    ],
  },
  {
    id: 'stat',
    label: 'Big number',
    make: (W, H, fill) => [
      newText({ x: W / 2, y: H / 2 - 40, text: '15', width: W - 200, fontFamily: 'Anton', fontSize: 380, fill, lineHeight: 1 }),
      newText({ x: W / 2, y: H / 2 + 190, text: 'Champions League titles', width: W - 200, fontFamily: 'Montserrat', fontSize: 52, bold: true, fill }),
    ],
  },
  {
    id: 'outline',
    label: 'Outline title',
    make: (W, H, fill) => [
      newText({ x: W / 2, y: H / 2, text: 'HALA MADRID', width: W - 160, fontFamily: 'Bebas Neue', fontSize: 190, fill, hollow: true, stroke: { color: fill, width: 5 } }),
    ],
  },
  {
    id: 'script',
    label: 'Script and caps',
    make: (W, H, fill) => [
      newText({ x: W / 2, y: H / 2 - 70, text: 'The night', width: W - 200, fontFamily: 'Pacifico', fontSize: 130, fill }),
      newText({ x: W / 2, y: H / 2 + 80, text: 'WE REMEMBER', width: W - 200, fontFamily: 'Oswald', fontSize: 110, bold: true, fill, letterSpacing: 200 }),
    ],
  },
  {
    id: 'highlight',
    label: 'Highlighted line',
    make: (W, H, fill) => [
      newText({ x: W / 2, y: H / 2, text: 'Breaking', width: W - 400, fontFamily: 'Montserrat', fontSize: 100, bold: true, fill: '#111111', highlight: '#ffd43b' }),
      newText({ x: W / 2, y: H / 2 + 150, text: 'Starting XI confirmed', width: W - 200, fontFamily: 'Montserrat', fontSize: 48, fill }),
    ],
  },
]

export function addTextCombo(c: TextCombo) {
  const d = st().doc
  const objs = c.make(d.width, d.height, pageTextColor())
  for (const o of objs) {
    const f = findFont(o.fontFamily)
    if (f) requestGoogleFont(f)
    void ensureFont(o.fontFamily, o.bold, o.italic)
  }
  addObjects(objs)
}

// ---------------------------------------------------------------------------------------------
// shapes + frames

export function addShape(kind: ShapeKind, pos?: { x: number; y: number }) {
  const d = st().doc
  const size = Math.round(Math.min(d.width, d.height) * 0.3)
  const s = newShape(kind, pos?.x ?? d.width / 2, pos?.y ?? d.height / 2, size, {})
  addObjects([s])
}
export function addRoundedRect() {
  const d = st().doc
  const size = Math.round(Math.min(d.width, d.height) * 0.3)
  addObjects([newShape('rect', d.width / 2, d.height / 2, size, { radius: Math.round(size * 0.18) })])
}

export function addFrame(kind: Exclude<FrameKind, 'none'>) {
  const sel = selectedModels()
  if (sel.length === 1 && sel[0].type === 'image') {
    patch([sel[0].id], { frame: kind }, 'frame')
    return
  }
  const d = st().doc
  const w = Math.round(Math.min(d.width, d.height) * 0.5)
  const h = kind === 'arch' ? Math.round(w * 1.3) : w
  addObjects([newImage({ x: d.width / 2, y: d.height / 2, width: w, height: h, frame: kind, name: 'Frame' })])
}

export function setBackground(paint: Paint, pageId = st().activePageId) {
  editorStore.commit((d) => mapPage(d, pageId, (p) => ({ ...p, background: paint })), { key: 'bg:' + pageId })
}

// ---------------------------------------------------------------------------------------------
// images

function photoLayout(templateId: number | null | undefined, aw: number, ah: number, W: number, H: number, hasCutout: boolean): Partial<ImageObj> {
  const cover = (): Partial<ImageObj> => ({ x: W / 2, y: H / 2, width: W, height: H, crop: coverCrop(aw, ah, W, H), angle: 0, flipX: false, flipY: false })
  if (templateId === 3 && hasCutout) {
    // same placement as the server: fit inside (W-120) x 75% H, centred, nudged 40 px up
    const maxW = W - 120
    const maxH = Math.floor(H * 0.75)
    const k = Math.min(maxW / aw, maxH / ah)
    return { x: W / 2, y: H / 2 - 40, width: Math.round(aw * k), height: Math.round(ah * k), crop: { x: 0, y: 0, w: aw, h: ah }, angle: 0, flipX: false, flipY: false, treatment: null, opacity: 1, useCutout: true }
  }
  if (templateId === 2) return { ...cover(), treatment: 'transparency', opacity: 0.45, useCutout: false }
  if (templateId === 1 || templateId === 3) return { ...cover(), treatment: 'darkened', opacity: 1, useCutout: false }
  return {}
}

export async function addImageAsset(assetId: string, opts: { pageId?: string; pos?: { x: number; y: number }; asLayer?: boolean } = {}) {
  await ensureAsset(assetId)
  const meta = getMeta(assetId)
  if (!meta) return
  const s = st()
  const pageId = opts.pageId ?? s.activePageId
  const page = s.doc.pages.find((p) => p.id === pageId)
  if (!page) return
  const { width: W, height: H } = s.doc

  // an empty frame that is selected (or under the drop) gets the photo
  const sel = selectedModels()
  const ph = sel.length === 1 && sel[0].type === 'image' && !sel[0].assetId ? sel[0] : null
  if (ph) return fillPlaceholder(ph.id, assetId)

  const hasPhoto = page.objects.some((o) => o.role === 'photo')
  if (!opts.asLayer && !hasPhoto && page.templateId) {
    const img = newImage({
      x: W / 2,
      y: H / 2,
      width: W,
      height: H,
      assetId,
      role: 'photo',
      name: 'Photo',
      crop: coverCrop(meta.w, meta.h, W, H),
      ...photoLayout(page.templateId, meta.w, meta.h, W, H, false),
    })
    addObjects([img], pageId, { atIndex: 0 })
    if (page.templateId === 3) void runCutout(img.id, { applyTemplateLayout: true })
    return
  }
  const k = Math.min(1, (W * 0.6) / meta.w, (H * 0.7) / meta.h)
  const w = Math.max(40, Math.round(meta.w * k))
  const h = Math.max(40, Math.round(meta.h * k))
  const img = newImage({
    x: opts.pos?.x ?? W / 2,
    y: opts.pos?.y ?? H / 2,
    width: w,
    height: h,
    assetId,
    crop: { x: 0, y: 0, w: meta.w, h: meta.h },
    name: meta.name.replace(/\.[^.]+$/, ''),
  })
  addObjects([img], pageId)
}

export async function addImageFiles(files: File[], opts: { pageId?: string; pos?: { x: number; y: number }; asLayer?: boolean } = {}) {
  const imgs = files.filter((f) => f.type.startsWith('image/'))
  if (!imgs.length) {
    editorStore.notify('That is not an image file.', 'error')
    return
  }
  for (const f of imgs) {
    try {
      const meta = await addAssetFromFile(f)
      await addImageAsset(meta.id, opts)
    } catch (e) {
      editorStore.notify(e instanceof Error ? e.message : 'Could not read that image', 'error')
    }
  }
}

export async function fillPlaceholder(imageId: string, assetId: string) {
  await ensureAsset(assetId)
  const meta = getMeta(assetId)
  const f = findObj(st().doc, imageId)
  if (!meta || !f || f.obj.type !== 'image') return
  const o = f.obj
  editorStore.commit((d) =>
    mapObjects(d, [imageId], (x) => ({ ...(x as ImageObj), assetId, crop: coverCrop(meta.w, meta.h, o.width, o.height), cutoutId: null, useCutout: false, name: meta.name.replace(/\.[^.]+$/, '') }) as ObjModel),
  )
}

export async function replaceImage(imageId: string, assetId: string) {
  await fillPlaceholder(imageId, assetId)
}

export function resetImage(id: string) {
  patch([id], { adj: NO_ADJUSTMENTS, filter: null, treatment: null }, 'resetimg')
}

// background removal ---------------------------------------------------------------------------

export async function runCutout(imageId: string, opts: { applyTemplateLayout?: boolean } = {}) {
  const f = findObj(st().doc, imageId)
  if (!f || f.obj.type !== 'image' || !f.obj.assetId) return
  const startAsset = f.obj.assetId
  const key = `cutout:${imageId}`
  editorStore.setBusy(key, 'Removing background')
  try {
    let cutoutId = f.obj.cutoutId
    if (!cutoutId) {
      const meta = await requestCutout(startAsset)
      cutoutId = meta.id
    }
    await ensureAsset(cutoutId)
    const now = findObj(st().doc, imageId)
    if (!now || now.obj.type !== 'image' || now.obj.assetId !== startAsset) return
    const orig = getMeta(startAsset)
    const s = st()
    const layoutWanted = opts.applyTemplateLayout && now.page.templateId === 3
    editorStore.commit((d) =>
      mapObjects(d, [imageId], (o) => {
        const im = o as ImageObj
        const base = { ...im, cutoutId, useCutout: true }
        if (layoutWanted && orig) return { ...base, ...photoLayout(3, orig.w, orig.h, s.doc.width, s.doc.height, true) } as ObjModel
        return base as ObjModel
      }),
    )
    if (layoutWanted) positionHeadlineBelowSubject(now.page.id)
  } catch (e) {
    editorStore.notify(e instanceof Error ? `Background removal failed: ${e.message}` : 'Background removal failed', 'error')
  } finally {
    editorStore.setBusy(key, null)
  }
}

export function restoreOriginalImage(imageId: string) {
  patch([imageId], { useCutout: false }, 'cutout-off')
}

// ---------------------------------------------------------------------------------------------
// selection ops

function freshCopies(objs: ObjModel[], dx: number, dy: number): ObjModel[] {
  const groupMap = new Map<string, string>()
  return objs.map((o) => {
    let groupId = o.groupId
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, uid())
      groupId = groupMap.get(groupId)
    }
    return { ...o, id: uid(), x: o.x + dx, y: o.y + dy, groupId, role: o.role === 'photo' ? undefined : o.role } as ObjModel
  })
}

export function duplicateSelection() {
  const s = st()
  const objs = selectedModels()
  if (!objs.length || !s.selection.pageId) return
  engine.finishEditing()
  const copies = freshCopies(objs, 24, 24)
  const pageId = s.selection.pageId
  editorStore.commit((d) => mapPage(d, pageId, (p) => ({ ...p, objects: [...p.objects, ...copies] })))
  select(pageId, copies.map((c) => c.id))
}

export function deleteSelection() {
  const s = st()
  const ids = s.selection.ids
  if (!ids.length) return
  engine.finishEditing()
  const set = new Set(ids)
  editorStore.commit((d) => ({ ...d, pages: d.pages.map((p) => (p.objects.some((o) => set.has(o.id)) ? { ...p, objects: p.objects.filter((o) => !set.has(o.id)) } : p)) }))
  editorStore.setSelection(null, [])
}

export function copySelection() {
  const objs = selectedModels()
  if (objs.length) setClipboard(objs)
}
export function cutSelection() {
  copySelection()
  deleteSelection()
}
export function pasteClipboard() {
  const { objs, offset } = getClipboard()
  if (!objs.length) return
  const copies = freshCopies(objs, offset, offset)
  addObjects(copies)
}

export function groupSelection() {
  const ids = selectedIds()
  if (ids.length < 2) return
  const gid = uid()
  patch(ids, { groupId: gid }, 'group')
}
export function ungroupSelection() {
  const ids = selectedIds()
  if (!ids.length) return
  editorStore.commit((d) => patchObjects(d, ids, { groupId: undefined }))
}

export function arrange(op: 'forward' | 'backward' | 'front' | 'back') {
  const s = st()
  const pageId = s.selection.pageId
  if (!pageId || !s.selection.ids.length) return
  const sel = new Set(s.selection.ids)
  editorStore.commit((d) =>
    mapPage(d, pageId, (p) => {
      const o = [...p.objects]
      if (op === 'front') return { ...p, objects: [...o.filter((x) => !sel.has(x.id)), ...o.filter((x) => sel.has(x.id))] }
      if (op === 'back') return { ...p, objects: [...o.filter((x) => sel.has(x.id)), ...o.filter((x) => !sel.has(x.id))] }
      if (op === 'forward') {
        for (let i = o.length - 2; i >= 0; i--) if (sel.has(o[i].id) && !sel.has(o[i + 1].id)) [o[i], o[i + 1]] = [o[i + 1], o[i]]
      } else {
        for (let i = 1; i < o.length; i++) if (sel.has(o[i].id) && !sel.has(o[i - 1].id)) [o[i], o[i - 1]] = [o[i - 1], o[i]]
      }
      return { ...p, objects: o }
    }),
  )
}

/** Layers panel drag-reorder: move `id` so that it sits at array index `toIndex`. */
export function moveLayer(pageId: string, id: string, toIndex: number) {
  editorStore.commit((d) =>
    mapPage(d, pageId, (p) => {
      const from = p.objects.findIndex((o) => o.id === id)
      if (from < 0 || from === toIndex) return p
      const list = [...p.objects]
      const [it] = list.splice(from, 1)
      list.splice(clamp(toIndex, 0, list.length), 0, it)
      return { ...p, objects: list }
    }),
  )
}

export function setLocked(ids: string[], locked: boolean) {
  patch(ids, { locked }, 'lock')
}
export function setHidden(ids: string[], hidden: boolean) {
  patch(ids, { hidden }, 'hide')
  if (hidden) editorStore.setSelection(null, [])
}

export function nudge(dx: number, dy: number) {
  const ids = selectedIds()
  if (!ids.length) return
  editorStore.commit((d) => mapObjects(d, ids, (o) => (o.locked ? o : ({ ...o, x: o.x + dx, y: o.y + dy } as ObjModel))), { key: 'nudge' })
}

export function selectAll() {
  const s = st()
  const page = activePage()
  const ids = page.objects.filter((o) => !o.hidden).map((o) => o.id)
  if (ids.length) editorStore.setSelection(page.id, ids)
  void s
}

export function flip(axis: 'x' | 'y') {
  mapSelected((o) => ({ ...o, [axis === 'x' ? 'flipX' : 'flipY']: !(axis === 'x' ? o.flipX : o.flipY) }) as ObjModel, 'flip')
}
export function rotate90() {
  mapSelected((o) => ({ ...o, angle: ((((o.angle + 90 + 180) % 360) + 360) % 360) - 180 }) as ObjModel, 'rot90')
}

// ---------------------------------------------------------------------------------------------
// crop

export function applyCrop(id: string, win: { x: number; y: number; w: number; h: number }, k: number, center: { x: number; y: number }) {
  const w = Math.max(8, win.w * k)
  const h = Math.max(8, win.h * k)
  patch([id], { crop: win, width: w, height: h, x: center.x, y: center.y }, 'crop')
}

// ---------------------------------------------------------------------------------------------
// pages

function templatePageObjects(templateId: number | null | undefined, W: number, H: number): ObjModel[] {
  if (!templateId) return []
  return buildTemplateText(templateId, W, H, 'Your opinion goes here')
}

export function addPage(afterId?: string, blank = false) {
  const s = st()
  const ref = s.doc.pages.find((p) => p.id === (afterId ?? s.activePageId)) ?? s.doc.pages[s.doc.pages.length - 1]
  const np: Page = {
    ...newPage(ref.background, ref.templateId ?? null),
    objects: blank ? [] : templatePageObjects(ref.templateId, s.doc.width, s.doc.height),
  }
  editorStore.commit((d) => {
    const i = d.pages.findIndex((p) => p.id === ref.id)
    const pages = [...d.pages]
    pages.splice(i + 1, 0, np)
    return { ...d, pages }
  })
  editorStore.set({ activePageId: np.id })
  editorStore.setSelection(null, [])
}

export function duplicatePage(id: string) {
  const s = st()
  const src = s.doc.pages.find((p) => p.id === id)
  if (!src) return
  const gm = new Map<string, string>()
  const np: Page = {
    ...src,
    id: uid(),
    objects: src.objects.map((o) => {
      let groupId = o.groupId
      if (groupId) {
        if (!gm.has(groupId)) gm.set(groupId, uid())
        groupId = gm.get(groupId)
      }
      return { ...o, id: uid(), groupId } as ObjModel
    }),
  }
  editorStore.commit((d) => {
    const i = d.pages.findIndex((p) => p.id === id)
    const pages = [...d.pages]
    pages.splice(i + 1, 0, np)
    return { ...d, pages }
  })
  editorStore.set({ activePageId: np.id })
}

export function deletePage(id: string) {
  const s = st()
  if (s.doc.pages.length <= 1) {
    editorStore.notify('A design needs at least one page.', 'error')
    return
  }
  editorStore.commit((d) => ({ ...d, pages: d.pages.filter((p) => p.id !== id) }))
}

export function movePage(id: string, dir: -1 | 1) {
  editorStore.commit((d) => {
    const i = d.pages.findIndex((p) => p.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= d.pages.length) return d
    const pages = [...d.pages]
    ;[pages[i], pages[j]] = [pages[j], pages[i]]
    return { ...d, pages }
  })
}
export function reorderPages(from: number, to: number) {
  editorStore.commit((d) => {
    if (from === to || from < 0 || to < 0 || from >= d.pages.length || to >= d.pages.length) return d
    const pages = [...d.pages]
    const [p] = pages.splice(from, 1)
    pages.splice(to, 0, p)
    return { ...d, pages }
  })
}
export function togglePageHidden(id: string) {
  editorStore.commit((d) => mapPage(d, id, (p) => ({ ...p, hidden: !p.hidden })))
}

// ---------------------------------------------------------------------------------------------
// doc

export function setTitle(title: string) {
  editorStore.commit((d) => (d.title === title ? d : { ...d, title }), { key: 'title' })
}
export function setCaption(caption: string) {
  editorStore.commit((d) => (d.caption === caption ? d : { ...d, caption }), { key: 'caption' })
}

/** Resizes every page. Photos re-cover the new shape; everything else scales uniformly. */
export function resizeDoc(W: number, H: number) {
  const s = st()
  const { width: ow, height: oh } = s.doc
  if (W === ow && H === oh) return
  const sx = W / ow
  const sy = H / oh
  const f = Math.min(sx, sy)
  editorStore.commit((d) => ({
    ...d,
    width: W,
    height: H,
    pages: d.pages.map((p) => ({
      ...p,
      objects: p.objects.map((o) => {
        const base = { ...o, x: Math.round(o.x * sx * 100) / 100, y: Math.round(o.y * sy * 100) / 100 }
        if (o.type === 'text') return { ...base, fontSize: Math.max(6, Math.round(o.fontSize * f * 10) / 10), width: Math.max(24, o.width * sx), letterSpacing: o.letterSpacing } as ObjModel
        if (o.type === 'shape') return { ...base, width: o.width * f, height: o.height * f, strokeWidth: o.strokeWidth * f, radius: o.radius * f } as ObjModel
        const im = o as ImageObj
        const fullBleed = Math.abs(im.width - ow) < 2 && Math.abs(im.height - oh) < 2 && !im.angle
        const cutoutLayout = p.templateId === 3 && !!im.useCutout
        if (im.role === 'photo' && im.assetId && (fullBleed || cutoutLayout)) {
          const meta = getMeta(im.assetId)
          if (meta) {
            const lay = photoLayout(p.templateId, meta.w, meta.h, W, H, !!(im.useCutout && im.cutoutId))
            if (Object.keys(lay).length) return { ...im, ...lay } as ObjModel
          }
        }
        return { ...base, width: im.width * f, height: im.height * f, radius: im.radius * f, border: im.border ? { ...im.border, width: im.border.width * f } : null } as ObjModel
      }),
    })),
  }))
}

// ---------------------------------------------------------------------------------------------
// templates (the three existing Posts looks)

export const HEADLINE_SIZE: Record<number, number> = { 1: 64, 2: 60, 3: 56 }

export function buildTemplateText(templateId: number, W: number, H: number, text: string): ObjModel[] {
  const s = Math.min(W, H) / 1080
  const headline = newText({
    x: W / 2,
    y: templateId === 3 ? H * 0.82 : H / 2,
    text,
    width: Math.min(W - 160 * s, 1000),
    fontFamily: 'Arial',
    fontSize: Math.round(HEADLINE_SIZE[templateId] * s * 1.15),
    bold: true,
    fill: '#ffffff',
    lineHeight: 1.18,
    role: 'headline',
    name: 'Headline',
  })
  const wm = newText({
    x: W - 30 * s - 150 * s,
    y: H - 30 * s - 14 * s,
    text: '@madridonomy',
    width: 300 * s,
    fontFamily: 'Arial',
    fontSize: Math.round(28 * s),
    fill: '#ffffff',
    align: 'right',
    opacity: 0.8,
    role: 'watermark',
    name: 'Watermark',
    hidden: templateId === 2,
  })
  return [headline, wm]
}

export function positionHeadlineBelowSubject(pageId: string) {
  const s = st()
  const page = s.doc.pages.find((p) => p.id === pageId)
  const photo = page?.objects.find((o) => o.role === 'photo')
  const head = page?.objects.find((o) => o.role === 'headline')
  if (!page || !photo || !head || photo.type !== 'image' || head.type !== 'text') return
  const h = engine.textHeight(head.id) ?? head.fontSize * head.lineHeight * 2
  const top = photo.y + photo.height / 2 + 30
  const y = Math.min(s.doc.height - 60 - h / 2, top + h / 2)
  patch([head.id], { y }, 'head-y')
}

/** Applies one of the 3 templates to a page: black base, photo re-treated (or cut out), headline + watermark restyled. */
export function applyTemplate(templateId: number, pageId = st().activePageId) {
  const s = st()
  const page = s.doc.pages.find((p) => p.id === pageId)
  if (!page) return
  const { width: W, height: H } = s.doc
  const photo = page.objects.find((o): o is ImageObj => o.role === 'photo' && o.type === 'image')
  const meta = photo?.assetId ? getMeta(photo.assetId) : undefined
  const wantCutoutNow = templateId === 3 && !!photo?.cutoutId
  const seed = buildTemplateText(templateId, W, H, 'Your opinion goes here')

  editorStore.commit((d) =>
    mapPage(d, pageId, (p) => {
      let objects = p.objects.map((o) => {
        if (o.id === photo?.id && meta) return { ...o, ...photoLayout(templateId, meta.w, meta.h, W, H, wantCutoutNow) } as ObjModel
        if (o.role === 'headline' && o.type === 'text') {
          const t = seed[0] as TextObj
          return { ...o, fontSize: t.fontSize, width: t.width, x: t.x, y: t.y, fill: '#ffffff' } as ObjModel
        }
        if (o.role === 'watermark') return { ...o, hidden: templateId === 2 } as ObjModel
        return o
      })
      if (!objects.some((o) => o.role === 'headline')) objects = [...objects, seed[0]]
      if (!objects.some((o) => o.role === 'watermark')) objects = [...objects, seed[1]]
      return { ...p, background: '#000000', templateId, objects }
    }),
  )
  if (templateId === 3 && photo) {
    if (photo.cutoutId) positionHeadlineBelowSubject(pageId)
    else void runCutout(photo.id, { applyTemplateLayout: true })
  }
}

/** Opinion text -> the active page's headline (created from the page's template when missing). */
export function applyOpinion(text: string) {
  const page = activePage()
  const head = page.objects.find((o) => o.role === 'headline')
  if (head) {
    patch([head.id], { text }, 'opinion')
    return
  }
  const d = st().doc
  const t = buildTemplateText(page.templateId ?? 1, d.width, d.height, text)[0]
  addObjects([t], page.id)
}

// ---------------------------------------------------------------------------------------------
// layout presets

export interface LayoutPreset {
  id: string
  label: string
  make: (W: number, H: number) => ObjModel[]
}
export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'headline',
    label: 'Centred headline',
    make: (W, H) => [newText({ x: W / 2, y: H / 2, text: 'Your headline here', width: W - 200, fontFamily: 'Montserrat', fontSize: 110, bold: true, fill: '#ffffff' })],
  },
  {
    id: 'title-sub',
    label: 'Title and subtitle',
    make: (W, H) => [
      newText({ x: W / 2, y: H * 0.42, text: 'Big title', width: W - 200, fontFamily: 'Montserrat', fontSize: 130, bold: true, fill: '#ffffff' }),
      newText({ x: W / 2, y: H * 0.42 + 150, text: 'A short supporting line', width: W - 260, fontFamily: 'Montserrat', fontSize: 46, fill: '#ffffff', opacity: 0.85 }),
    ],
  },
  {
    id: 'lower-third',
    label: 'Lower third',
    make: (W, H) => [
      newShape('rect', W / 2, H - 190, W - 120, { width: W - 120, height: 200, fill: '#ffd43b', radius: 0 }),
      newText({ x: W / 2, y: H - 190, text: 'Player name', width: W - 200, fontFamily: 'Anton', fontSize: 110, fill: '#111111', align: 'left', caseMode: 'upper' }),
    ],
  },
  {
    id: 'quote',
    label: 'Quote',
    make: (W, H) => [
      newText({ x: W / 2, y: H * 0.18, text: '“', width: 300, fontFamily: 'Playfair Display', fontSize: 340, bold: true, fill: '#ffd43b' }),
      newText({ x: W / 2, y: H / 2, text: 'A quote worth sharing goes here.', width: W - 240, fontFamily: 'Playfair Display', fontSize: 84, italic: true, fill: '#ffffff', lineHeight: 1.2 }),
      newText({ x: W / 2, y: H - 200, text: 'NAME SURNAME', width: W - 240, fontFamily: 'Montserrat', fontSize: 30, bold: true, fill: '#ffffff', letterSpacing: 300 }),
    ],
  },
  {
    id: 'stat',
    label: 'Stat card',
    make: (W, H) => [
      newText({ x: W / 2, y: H / 2 - 60, text: '92%', width: W - 200, fontFamily: 'Anton', fontSize: 420, fill: '#ffffff', lineHeight: 1 }),
      newText({ x: W / 2, y: H / 2 + 220, text: 'What the stat is about', width: W - 240, fontFamily: 'Montserrat', fontSize: 52, bold: true, fill: '#ffffff' }),
    ],
  },
  {
    id: 'arch-photo',
    label: 'Arch photo and caption',
    make: (W, H) => [
      newImage({ x: W / 2, y: H * 0.42, width: Math.round(W * 0.56), height: Math.round(W * 0.74), frame: 'arch', name: 'Frame' }),
      newText({ x: W / 2, y: H * 0.42 + W * 0.37 + 90, text: 'Caption goes here', width: W - 200, fontFamily: 'Montserrat', fontSize: 52, bold: true, fill: '#ffffff' }),
    ],
  },
  {
    id: 'split',
    label: 'Split panel',
    make: (W, H) => [
      newShape('rect', W * 0.25, H / 2, W / 2, { width: W / 2, height: H, fill: '#0071e3', radius: 0 }),
      newText({ x: W * 0.75, y: H / 2, text: 'Headline on the right', width: W * 0.42, fontFamily: 'Montserrat', fontSize: 80, bold: true, fill: '#ffffff', align: 'left' }),
    ],
  },
]

export function applyLayoutPreset(p: LayoutPreset) {
  const d = st().doc
  const objs = p.make(d.width, d.height)
  for (const o of objs) {
    if (o.type !== 'text') continue
    const f = findFont(o.fontFamily)
    if (f) requestGoogleFont(f)
    void ensureFont(o.fontFamily, o.bold, o.italic)
  }
  addObjects(objs)
}

/** Select one object, expanding to its whole group. */
export function selectObject(pageId: string, id: string) {
  const f = findObj(st().doc, id)
  if (!f) return
  const gid = f.obj.groupId
  const ids = gid ? f.page.objects.filter((o) => o.groupId === gid && !o.hidden).map((o) => o.id) : [id]
  editorStore.setSelection(pageId, ids)
}

export function zoomTo(z: number) {
  editorStore.set({ zoom: clamp(Math.round(z * 1000) / 1000, 0.1, 4), fit: false })
}
