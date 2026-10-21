import * as fabric from 'fabric'
import { onAssetsChanged } from './assets'
import { buildObject, idOf, invalidateBake, noteGeometry, pageBackgroundFill, updateObject, type BuildCtx } from './fabricBuild'
import { onFontsChanged } from './fonts'
import type { Doc, ObjModel, Page } from './model'
import { editorStore, findObj, mapObjects, type EditorState } from './store'

/** Bridges the immutable document in `editorStore` and one fabric canvas per visible page.
 * Rule: the store is the truth. Fabric events turn into store commits; store changes are
 * reconciled into fabric objects (skipping any object whose model reference is unchanged). */

interface PageView {
  pageId: string
  host: HTMLElement
  canvas: fabric.Canvas
  objs: Map<string, fabric.FabricObject>
  applied: Map<string, ObjModel>
  lastPage: Page | null
  guides: { x: number[]; y: number[] }
  lastMaxBake: number
  lastBg: unknown
}

const SNAP_PX = 6
const PREVIEW_BAKE = 640

function accentColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim()
  return v || '#0071e3'
}

export class Engine {
  private views = new Map<string, PageView>()
  private applying = false
  private raf = 0
  private soloId: string | null = null
  private last: { doc: Doc | null; selKey: string; zoom: number; cropId: string | null; interacting: boolean } = {
    doc: null,
    selKey: '',
    zoom: -1,
    cropId: null,
    interacting: false,
  }
  private unsubs: (() => void)[] = []
  private forceAll = false

  constructor() {
    this.unsubs.push(editorStore.subscribe(() => this.schedule()))
    this.unsubs.push(onAssetsChanged(() => this.refreshImages()))
    this.unsubs.push(onFontsChanged(() => this.refreshFonts()))
    if (typeof document !== 'undefined' && document.fonts) {
      const h = () => this.refreshFonts()
      document.fonts.addEventListener('loadingdone', h)
      this.unsubs.push(() => document.fonts.removeEventListener('loadingdone', h))
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    for (const u of this.unsubs) u()
    for (const id of [...this.views.keys()]) this.detach(id)
  }

  // -------------------------------------------------------------------------------------------
  // lifecycle

  attach(pageId: string, host: HTMLElement) {
    this.detach(pageId)
    const st = editorStore.getState()
    const accent = accentColor()
    const el = document.createElement('canvas')
    host.replaceChildren(el)
    const canvas = new fabric.Canvas(el, {
      width: Math.round(st.doc.width * st.zoom),
      height: Math.round(st.doc.height * st.zoom),
      preserveObjectStacking: true,
      selection: true,
      selectionColor: 'rgba(0,113,227,0.10)',
      selectionBorderColor: accent,
      selectionLineWidth: 1.5,
      stopContextMenu: false, // the page wrapper shows our own menu (React) and prevents the browser one
      fireRightClick: true,
      uniformScaling: true,
      renderOnAddRemove: false,
    })
    canvas.setZoom(st.zoom)
    const view: PageView = {
      pageId,
      host,
      canvas,
      objs: new Map(),
      applied: new Map(),
      lastPage: null,
      guides: { x: [], y: [] },
      lastMaxBake: Infinity,
      lastBg: null,
    }
    this.views.set(pageId, view)
    this.bind(view)
    this.reconcilePage(view, true)
    this.syncSelection(view)
  }

  detach(pageId: string) {
    const v = this.views.get(pageId)
    if (!v) return
    this.views.delete(pageId)
    try {
      v.canvas.dispose()
    } catch {
      // already torn down
    }
    v.host.replaceChildren()
  }

  private schedule() {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      this.flush()
    })
  }

  private ctx(): BuildCtx {
    const st = editorStore.getState()
    return { interactive: true, maxBake: st.interacting ? PREVIEW_BAKE : Infinity, accent: accentColor() }
  }

  private flush() {
    const st = editorStore.getState()
    const selKey = `${st.selection.pageId}:${st.selection.ids.join(',')}`
    const docChanged = st.doc !== this.last.doc
    const zoomChanged = st.zoom !== this.last.zoom
    const bakeChanged = st.interacting !== this.last.interacting
    const cropChanged = st.cropId !== this.last.cropId
    const selChanged = selKey !== this.last.selKey
    this.last = { doc: st.doc, selKey, zoom: st.zoom, cropId: st.cropId, interacting: st.interacting }

    for (const view of this.views.values()) {
      if (zoomChanged || docChanged) this.applyZoom(view, st)
      if (docChanged || bakeChanged || this.forceAll) this.reconcilePage(view, bakeChanged || this.forceAll)
      else if (cropChanged) this.applyCropVisibility(view, st)
      if (selChanged || docChanged) this.syncSelection(view)
    }
    this.forceAll = false
  }

  private applyZoom(view: PageView, st: EditorState) {
    const { canvas } = view
    const w = Math.round(st.doc.width * st.zoom)
    const h = Math.round(st.doc.height * st.zoom)
    if (canvas.getZoom() !== st.zoom) canvas.setZoom(st.zoom)
    if (canvas.getWidth() !== w || canvas.getHeight() !== h) canvas.setDimensions({ width: w, height: h })
    canvas.requestRenderAll()
  }

  private applyCropVisibility(view: PageView, st: EditorState) {
    for (const [id, obj] of view.objs) {
      const m = view.applied.get(id)
      const vis = !m?.hidden && id !== st.cropId
      if (obj.visible !== vis) obj.set('visible', vis)
    }
    view.canvas.requestRenderAll()
  }

  // -------------------------------------------------------------------------------------------
  // model -> fabric

  private reconcilePage(view: PageView, force = false) {
    const st = editorStore.getState()
    const page = st.doc.pages.find((p) => p.id === view.pageId)
    if (!page) return
    if (!force && view.lastPage === page) return
    view.lastPage = page
    const canvas = view.canvas
    const ctx = this.ctx()
    this.applying = true
    try {
      const active = canvas.getActiveObject()
      if (active && active instanceof fabric.ActiveSelection) canvas.discardActiveObject()

      this.applyZoom(view, st)
      const bg = page.background
      if (view.lastBg !== bg || force) {
        canvas.backgroundColor = pageBackgroundFill(bg, st.doc.width, st.doc.height)
        view.lastBg = bg
      }

      const live = new Set<string>()
      page.objects.forEach((m, i) => {
        live.add(m.id)
        let obj = view.objs.get(m.id)
        const prev = view.applied.get(m.id)
        if (!obj) {
          obj = buildObject(m, ctx)
          view.objs.set(m.id, obj)
          canvas.insertAt(i, obj)
        } else if (force || prev !== m) {
          const replace = updateObject(obj, m, ctx)
          if (replace) {
            const old = obj
            obj = buildObject(m, ctx)
            canvas.insertAt(canvas.getObjects().indexOf(old), obj)
            canvas.remove(old)
            view.objs.set(m.id, obj)
          }
        }
        noteGeometry(obj, m)
        view.applied.set(m.id, m)
        if (m.id === st.cropId) obj.set('visible', false)
      })
      for (const [id, obj] of [...view.objs]) {
        if (!live.has(id)) {
          if (canvas.getActiveObject() === obj) canvas.discardActiveObject()
          canvas.remove(obj)
          view.objs.delete(id)
          view.applied.delete(id)
        }
      }
      // order
      page.objects.forEach((m, i) => {
        const obj = view.objs.get(m.id)!
        if (canvas.getObjects()[i] !== obj) canvas.moveObjectTo(obj, i)
      })
    } finally {
      this.applying = false
    }
    canvas.requestRenderAll()
  }

  /** Re-bake every image (an asset finished loading) and re-measure text (a font arrived). */
  private refreshImages() {
    for (const view of this.views.values()) for (const obj of view.objs.values()) invalidateBake(obj)
    this.forceAll = true
    this.schedule()
  }
  private refreshFonts() {
    const clear = (fabric.util as unknown as { clearFabricFontCache?: () => void }).clearFabricFontCache
    clear?.()
    for (const view of this.views.values()) {
      for (const obj of view.objs.values()) {
        if (obj instanceof fabric.Textbox) {
          obj.dirty = true
          obj.initDimensions()
          obj.setCoords()
        }
      }
      view.canvas.requestRenderAll()
    }
  }

  // -------------------------------------------------------------------------------------------
  // selection

  private activeIds(canvas: fabric.Canvas): string[] {
    const a = canvas.getActiveObject()
    if (!a) return []
    const objs = a instanceof fabric.ActiveSelection ? a.getObjects() : [a]
    return objs.map((o) => idOf(o)).filter((v): v is string => !!v)
  }

  private syncSelection(view: PageView) {
    const st = editorStore.getState()
    const canvas = view.canvas
    const want = st.selection.pageId === view.pageId ? st.selection.ids.filter((id) => view.objs.has(id)) : []
    const cur = this.activeIds(canvas)
    if (want.length === cur.length && want.every((id) => cur.includes(id))) return
    const a = canvas.getActiveObject()
    if (a && a instanceof fabric.Textbox && a.isEditing && want.length === 1 && cur.length === 1 && cur[0] === want[0]) return
    this.applying = true
    try {
      canvas.discardActiveObject()
      if (want.length === 1) {
        canvas.setActiveObject(view.objs.get(want[0])!)
      } else if (want.length > 1) {
        const accent = accentColor()
        const sel = new fabric.ActiveSelection(
          want.map((id) => view.objs.get(id)!),
          {
            canvas,
            borderColor: accent,
            cornerColor: '#ffffff',
            cornerStrokeColor: accent,
            cornerStyle: 'circle',
            cornerSize: 11,
            transparentCorners: false,
            borderScaleFactor: 1.6,
            lockSkewingX: true,
            lockSkewingY: true,
            lockScalingFlip: true,
          },
        )
        sel.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false })
        canvas.setActiveObject(sel)
      }
    } finally {
      this.applying = false
    }
    canvas.requestRenderAll()
  }

  private onSelectionEvent(view: PageView) {
    if (this.applying) return
    const canvas = view.canvas
    let ids = this.activeIds(canvas)
    const st = editorStore.getState()
    if (!ids.length) {
      if (st.selection.pageId === view.pageId) {
        this.soloId = null
        editorStore.setSelection(null, [])
      }
      return
    }
    if (ids.length === 1 && this.soloId !== ids[0]) {
      const found = findObj(st.doc, ids[0])
      const gid = found?.obj.groupId
      if (gid && found) {
        const members = found.page.objects.filter((o) => o.groupId === gid && !o.hidden).map((o) => o.id)
        if (members.length > 1) ids = members
      }
    } else if (ids.length > 1) {
      this.soloId = null
    }
    editorStore.setSelection(view.pageId, ids)
  }

  /** Canvas coordinates -> the topmost object id under a client point (for the right-click menu / drops). */
  targetAt(pageId: string, e: MouseEvent | DragEvent): string | null {
    const view = this.views.get(pageId)
    if (!view) return null
    const target = view.canvas.findTarget(e as unknown as fabric.TPointerEvent).target
    return idOf(target) ?? null
  }

  /** Client point -> design coordinates on a page. */
  toDesign(pageId: string, clientX: number, clientY: number): { x: number; y: number } | null {
    const view = this.views.get(pageId)
    if (!view) return null
    const r = view.canvas.getElement().getBoundingClientRect()
    const z = editorStore.getState().zoom
    return { x: (clientX - r.left) / z, y: (clientY - r.top) / z }
  }

  // -------------------------------------------------------------------------------------------
  // fabric events

  private bind(view: PageView) {
    const { canvas, pageId } = view
    const sel = () => this.onSelectionEvent(view)
    canvas.on('selection:created', sel)
    canvas.on('selection:updated', sel)
    canvas.on('selection:cleared', sel)
    canvas.on('mouse:down', () => editorStore.setActivePage(pageId))
    canvas.on('object:modified', (e) => this.onModified(e.target))
    canvas.on('object:moving', (e) => this.onMoving(view, e.target, e.e))
    canvas.on('mouse:up', () => {
      if (view.guides.x.length || view.guides.y.length) {
        view.guides = { x: [], y: [] }
        canvas.requestRenderAll()
      }
    })
    canvas.on('after:render', (e) => this.drawGuides(view, e.ctx))
    canvas.on('mouse:dblclick', (e) => this.onDouble(view, e.target))
    canvas.on('text:editing:entered', (e) => {
      const t = e.target as fabric.Textbox
      const id = idOf(t)
      const found = id ? findObj(editorStore.getState().doc, id) : null
      if (found && found.obj.type === 'text' && (found.obj.caseMode !== 'none' || found.obj.list !== 'none')) {
        t.set('text', found.obj.text)
        t.initDimensions()
        canvas.requestRenderAll()
      }
    })
    canvas.on('text:editing:exited', (e) => this.onTextExit(view, e.target as fabric.Textbox))
  }

  private onTextExit(view: PageView, t: fabric.Textbox) {
    const id = idOf(t)
    if (!id) return
    const doc = editorStore.getState().doc
    const found = findObj(doc, id)
    if (!found || found.obj.type !== 'text') return
    const raw = t.text
    if (raw.trim() === '') {
      editorStore.commit((d) => ({ ...d, pages: d.pages.map((p) => ({ ...p, objects: p.objects.filter((o) => o.id !== id) })) }))
      return
    }
    if (raw !== found.obj.text) {
      editorStore.commit((d) => mapObjects(d, [id], (o) => ({ ...o, text: raw }) as ObjModel))
    } else {
      // text unchanged: just restore the case / list display
      const m = found.obj
      view.applied.delete(id)
      updateObject(t, m, this.ctx())
      view.applied.set(id, m)
      view.canvas.requestRenderAll()
    }
  }

  private onDouble(view: PageView, target: fabric.FabricObject | undefined) {
    const id = idOf(target)
    if (!id) return
    const st = editorStore.getState()
    const found = findObj(st.doc, id)
    if (!found) return
    if (found.obj.groupId && this.soloId !== id) {
      this.soloId = id
      editorStore.setSelection(view.pageId, [id])
      if (found.obj.type === 'text') this.editText(id)
      return
    }
    if (found.obj.type === 'image' && !found.obj.locked) {
      if (!found.obj.assetId) editorStore.set({ panel: 'uploads' })
      else editorStore.set({ cropId: id })
    }
  }

  private onModified(target: fabric.FabricObject | undefined) {
    if (!target) return
    const isSel = target instanceof fabric.ActiveSelection
    const objs = isSel ? (target as fabric.ActiveSelection).getObjects() : [target]
    const doc = editorStore.getState().doc
    const patches = new Map<string, Record<string, unknown>>()
    for (const o of objs) {
      const id = idOf(o)
      if (!id) continue
      const found = findObj(doc, id)
      if (!found) continue
      const m = found.obj
      let cx: number
      let cy: number
      let sx: number
      let sy: number
      let angle: number
      if (isSel) {
        const s = target as fabric.ActiveSelection
        const p = fabric.util.transformPoint(o.getRelativeCenterPoint(), s.calcTransformMatrix())
        cx = p.x
        cy = p.y
        sx = Math.abs(o.scaleX * s.scaleX)
        sy = Math.abs(o.scaleY * s.scaleY)
        angle = o.angle + s.angle
      } else {
        cx = o.left
        cy = o.top
        sx = Math.abs(o.scaleX)
        sy = Math.abs(o.scaleY)
        angle = o.angle
      }
      angle = ((((angle + 180) % 360) + 360) % 360) - 180
      const r2 = (n: number) => Math.round(n * 100) / 100
      const patch: Record<string, unknown> = { x: r2(cx), y: r2(cy), angle: r2(angle) }
      if (m.type === 'text') {
        const t = o as fabric.Textbox
        const f = (sx + sy) / 2
        if (Math.abs(f - 1) > 0.0005) patch.fontSize = Math.max(6, r2(m.fontSize * f))
        patch.width = Math.max(24, r2(t.width * sx))
      } else if (m.type === 'shape') {
        patch.width = Math.max(2, r2(m.width * sx))
        if (m.kind !== 'line' && m.kind !== 'arrow') patch.height = Math.max(2, r2(m.height * sy))
      } else {
        patch.width = Math.max(8, r2(m.width * sx))
        patch.height = Math.max(8, r2(m.height * sy))
      }
      patches.set(id, patch)
    }
    if (!patches.size) return
    editorStore.commit((d) => mapObjects(d, [...patches.keys()], (o) => ({ ...o, ...patches.get(o.id) }) as ObjModel))
    // Re-apply right away so scale is normalised even when only the same values come back.
    this.schedule()
  }

  // -------------------------------------------------------------------------------------------
  // smart guides + snapping

  private onMoving(view: PageView, target: fabric.FabricObject | undefined, ev: fabric.TPointerEvent | undefined) {
    if (!target) return
    if (ev && 'altKey' in ev && ev.altKey) {
      view.guides = { x: [], y: [] }
      return
    }
    const st = editorStore.getState()
    const W = st.doc.width
    const H = st.doc.height
    const tol = SNAP_PX / st.zoom
    const moving = new Set<fabric.FabricObject>(target instanceof fabric.ActiveSelection ? target.getObjects() : [target])
    const b = target.getBoundingRect()
    const xs = [b.left, b.left + b.width / 2, b.left + b.width]
    const ys = [b.top, b.top + b.height / 2, b.top + b.height]
    const cx: number[] = [0, W / 2, W]
    const cy: number[] = [0, H / 2, H]
    for (const [, o] of view.objs) {
      if (moving.has(o) || !o.visible) continue
      const r = o.getBoundingRect()
      cx.push(r.left, r.left + r.width / 2, r.left + r.width)
      cy.push(r.top, r.top + r.height / 2, r.top + r.height)
    }
    const best = (pts: number[], cands: number[]) => {
      let d = Infinity
      for (const p of pts) for (const c of cands) if (Math.abs(c - p) < Math.abs(d)) d = c - p
      return Math.abs(d) <= tol ? d : 0
    }
    const dx = best(xs, cx)
    const dy = best(ys, cy)
    if (dx || dy) {
      target.set({ left: target.left + dx, top: target.top + dy })
      target.setCoords()
    }
    const b2 = target.getBoundingRect()
    const nx = [b2.left, b2.left + b2.width / 2, b2.left + b2.width]
    const ny = [b2.top, b2.top + b2.height / 2, b2.top + b2.height]
    const gx = new Set<number>()
    const gy = new Set<number>()
    for (const p of nx) for (const c of cx) if (Math.abs(c - p) < 0.5) gx.add(c)
    for (const p of ny) for (const c of cy) if (Math.abs(c - p) < 0.5) gy.add(c)
    view.guides = { x: [...gx], y: [...gy] }
  }

  private drawGuides(view: PageView, ctx: CanvasRenderingContext2D) {
    const { x, y } = view.guides
    if (!x.length && !y.length) return
    const st = editorStore.getState()
    const z = st.zoom
    ctx.save()
    ctx.strokeStyle = '#ff2d87'
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.beginPath()
    for (const gx of x) {
      const px = Math.round(gx * z) + 0.5
      ctx.moveTo(px, 0)
      ctx.lineTo(px, st.doc.height * z)
    }
    for (const gy of y) {
      const py = Math.round(gy * z) + 0.5
      ctx.moveTo(0, py)
      ctx.lineTo(st.doc.width * z, py)
    }
    ctx.stroke()
    ctx.restore()
  }

  // -------------------------------------------------------------------------------------------
  // public helpers used by UI + shortcuts

  isEditingText(): boolean {
    for (const v of this.views.values()) {
      const a = v.canvas.getActiveObject()
      if (a instanceof fabric.Textbox && a.isEditing) return true
    }
    return false
  }

  /** Leave text editing everywhere so the model holds the latest typed text (before export/save). */
  finishEditing() {
    for (const v of this.views.values()) {
      const a = v.canvas.getActiveObject()
      if (a instanceof fabric.Textbox && a.isEditing) a.exitEditing()
    }
  }

  editText(id: string) {
    const go = () => {
      for (const v of this.views.values()) {
        const obj = v.objs.get(id)
        if (obj instanceof fabric.Textbox) {
          v.canvas.setActiveObject(obj)
          obj.enterEditing()
          obj.selectAll()
          v.canvas.requestRenderAll()
          return true
        }
      }
      return false
    }
    requestAnimationFrame(() => requestAnimationFrame(() => go()))
  }

  /** Bounding box (design px) of an object as currently drawn - includes rotation and auto text height. */
  boundsOf(ids: string[]): { left: number; top: number; width: number; height: number } | null {
    let box: { l: number; t: number; r: number; b: number } | null = null
    for (const v of this.views.values()) {
      for (const id of ids) {
        const o = v.objs.get(id)
        if (!o) continue
        const r = o.getBoundingRect()
        box = box
          ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.left + r.width), b: Math.max(box.b, r.top + r.height) }
          : { l: r.left, t: r.top, r: r.left + r.width, b: r.top + r.height }
      }
    }
    return box ? { left: box.l, top: box.t, width: box.r - box.l, height: box.b - box.t } : null
  }

  /** Real drawn height of a text box (it auto-sizes to its content). */
  textHeight(id: string): number | null {
    for (const v of this.views.values()) {
      const o = v.objs.get(id)
      if (o) return o.height * Math.abs(o.scaleY)
    }
    return null
  }

  alignToPage(ids: string[], where: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
    const b = this.boundsOf(ids)
    if (!b) return
    const doc = editorStore.getState().doc
    let dx = 0
    let dy = 0
    if (where === 'left') dx = -b.left
    if (where === 'center') dx = doc.width / 2 - (b.left + b.width / 2)
    if (where === 'right') dx = doc.width - (b.left + b.width)
    if (where === 'top') dy = -b.top
    if (where === 'middle') dy = doc.height / 2 - (b.top + b.height / 2)
    if (where === 'bottom') dy = doc.height - (b.top + b.height)
    if (!dx && !dy) return
    editorStore.commit((d) =>
      mapObjects(d, ids, (o) => ({ ...o, x: Math.round((o.x + dx) * 100) / 100, y: Math.round((o.y + dy) * 100) / 100 }) as ObjModel),
    )
  }
}

export const engine = new Engine()
