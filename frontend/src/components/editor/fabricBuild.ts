import * as fabric from 'fabric'
import { bakeImage, bakeKey } from './imageFx'
import type { GradientPaint, ImageObj, ObjModel, Paint, ShadowSpec, ShapeObj, TextObj } from './model'

/** Model -> fabric. Used by BOTH the interactive page canvases and the exporter, so what you see is
 * what you download. Nothing here reads editor state. */

export interface BuildCtx {
  interactive: boolean
  /** Longest side (px) an image bake may have. Infinity = full design resolution (exports). */
  maxBake: number
  accent: string
}

const ids = new WeakMap<fabric.FabricObject, string>()
const geom = new WeakMap<fabric.FabricObject, string>()
const bakes = new WeakMap<fabric.FabricObject, string>()
export function idOf(o: fabric.FabricObject | undefined | null): string | undefined {
  return o ? ids.get(o) : undefined
}

// ---------------------------------------------------------------------------------------------
// paint helpers

export function gradientCoords(g: GradientPaint) {
  const rad = (g.angle * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  return { x1: 0.5 - dx / 2, y1: 0.5 - dy / 2, x2: 0.5 + dx / 2, y2: 0.5 + dy / 2 }
}

export function cssGradient(g: GradientPaint): string {
  return `linear-gradient(${g.angle}deg, ${g.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')})`
}

function toObjectFill(p: Paint): string | fabric.Gradient<'linear'> | null {
  if (typeof p === 'string') return p === 'transparent' ? 'rgba(0,0,0,0)' : p
  return new fabric.Gradient({
    type: 'linear',
    gradientUnits: 'percentage',
    coords: gradientCoords(p),
    colorStops: p.stops.map((s) => ({ offset: s.offset, color: s.color })),
  })
}

export function pageBackgroundFill(p: Paint, w: number, h: number): string | fabric.Gradient<'linear'> {
  if (typeof p === 'string') return p
  const c = gradientCoords(p)
  return new fabric.Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: { x1: c.x1 * w, y1: c.y1 * h, x2: c.x2 * w, y2: c.y2 * h },
    colorStops: p.stops.map((s) => ({ offset: s.offset, color: s.color })),
  })
}

function toShadow(s: ShadowSpec | null | undefined): fabric.Shadow | null {
  if (!s) return null
  return new fabric.Shadow({ color: s.color, blur: s.blur, offsetX: s.x, offsetY: s.y })
}

// ---------------------------------------------------------------------------------------------
// text

export function displayText(m: TextObj, editing = false): string {
  let t = m.text
  if (editing) return t
  if (m.caseMode === 'upper') t = t.toUpperCase()
  else if (m.caseMode === 'lower') t = t.toLowerCase()
  else if (m.caseMode === 'title') t = t.toLowerCase().replace(/(^|\s)(\S)/g, (_, a: string, b: string) => a + b.toUpperCase())
  if (m.list === 'bullet') t = t.split('\n').map((l) => (l ? `• ${l}` : l)).join('\n')
  else if (m.list === 'number') {
    let n = 0
    t = t.split('\n').map((l) => (l ? `${++n}. ${l}` : l)).join('\n')
  }
  return t
}

function textProps(m: TextObj) {
  const strokeColor = m.stroke?.color ?? (m.hollow ? m.fill : null)
  const strokeWidth = m.stroke?.width ?? (m.hollow ? Math.max(2, m.fontSize * 0.04) : 0)
  return {
    width: m.width,
    fontFamily: m.fontFamily,
    fontSize: m.fontSize,
    fontWeight: m.bold ? 700 : 400,
    fontStyle: m.italic ? ('italic' as const) : ('normal' as const),
    underline: m.underline,
    linethrough: m.strike,
    fill: m.hollow ? 'rgba(0,0,0,0)' : m.fill,
    textAlign: m.align,
    charSpacing: m.letterSpacing,
    lineHeight: m.lineHeight,
    textBackgroundColor: m.highlight ?? '',
    stroke: strokeWidth > 0 ? strokeColor : null,
    strokeWidth: strokeWidth > 0 ? strokeWidth : 0,
    strokeLineJoin: 'round' as const,
    paintFirst: 'stroke' as const,
  }
}

// ---------------------------------------------------------------------------------------------
// shapes

function starPoints(w: number, h: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.4
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
  }
  const minX = Math.min(...pts.map((p) => p.x))
  const maxX = Math.max(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y))
  const maxY = Math.max(...pts.map((p) => p.y))
  return pts.map((p) => ({
    x: ((p.x - minX) / (maxX - minX) - 0.5) * w,
    y: ((p.y - minY) / (maxY - minY) - 0.5) * h,
  }))
}

function arrowHead(sw: number) {
  return Math.max(14, sw * 2.6)
}
function linePath(m: ShapeObj): string {
  const half = m.width / 2
  if (m.kind === 'arrow') {
    const hh = arrowHead(m.strokeWidth)
    return `M ${-half} 0 L ${half} 0 M ${half - hh} ${-hh} L ${half} 0 L ${half - hh} ${hh}`
  }
  return `M ${-half} 0 L ${half} 0`
}

function geomKey(m: ShapeObj): string {
  if (m.kind === 'star') return `star|${Math.round(m.width)}|${Math.round(m.height)}`
  if (m.kind === 'line' || m.kind === 'arrow') return `${m.kind}|${Math.round(m.width)}|${m.strokeWidth}`
  return m.kind
}

function dashArray(m: ShapeObj): number[] | null {
  const sw = Math.max(1, m.strokeWidth)
  if (m.dash === 'dashed') return [sw * 2.6, sw * 1.8]
  if (m.dash === 'dotted') return [0.01, sw * 2]
  return null
}

function shapeStyle(m: ShapeObj) {
  const isLine = m.kind === 'line' || m.kind === 'arrow'
  return {
    fill: isLine ? null : toObjectFill(m.fill),
    stroke: m.strokeWidth > 0 ? m.stroke : null,
    strokeWidth: m.strokeWidth,
    strokeUniform: true,
    strokeDashArray: dashArray(m),
    strokeLineCap: m.dash === 'dotted' || isLine ? ('round' as const) : ('butt' as const),
    strokeLineJoin: 'round' as const,
  }
}

function makeShape(m: ShapeObj, base: object): fabric.FabricObject {
  const style = shapeStyle(m)
  switch (m.kind) {
    case 'rect':
      return new fabric.Rect({ ...base, ...style, width: m.width, height: m.height, rx: m.radius, ry: m.radius })
    case 'circle':
      return new fabric.Ellipse({ ...base, ...style, rx: m.width / 2, ry: m.height / 2 })
    case 'triangle':
      return new fabric.Triangle({ ...base, ...style, width: m.width, height: m.height })
    case 'star':
      return new fabric.Polygon(starPoints(m.width, m.height), { ...base, ...style })
    case 'line':
    case 'arrow':
      return new fabric.Path(linePath(m), { ...base, ...style, padding: 8 })
  }
}

// ---------------------------------------------------------------------------------------------
// common props + controls

function interactiveBase(ctx: BuildCtx) {
  return {
    originX: 'center' as const,
    originY: 'center' as const,
    borderColor: ctx.accent,
    cornerColor: '#ffffff',
    cornerStrokeColor: ctx.accent,
    cornerStyle: 'circle' as const,
    cornerSize: 11,
    transparentCorners: false,
    borderScaleFactor: 1.6,
    lockSkewingX: true,
    lockSkewingY: true,
    lockScalingFlip: true,
    snapAngle: 15,
    snapThreshold: 4,
    selectable: ctx.interactive,
    evented: ctx.interactive,
    hasControls: ctx.interactive,
    hasBorders: ctx.interactive,
  }
}

function applyCommon(obj: fabric.FabricObject, m: ObjModel, ctx: BuildCtx) {
  const locked = !!m.locked
  obj.set({
    left: m.x,
    top: m.y,
    angle: m.angle,
    opacity: m.opacity,
    flipX: !!m.flipX,
    flipY: !!m.flipY,
    visible: !m.hidden,
    shadow: toShadow(m.shadow),
  })
  if (ctx.interactive) {
    obj.set({
      lockMovementX: locked,
      lockMovementY: locked,
      lockRotation: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      hasControls: !locked,
      hoverCursor: locked ? 'default' : 'move',
      moveCursor: locked ? 'default' : 'move',
      evented: !m.hidden,
    })
    const isLine = m.type === 'shape' && (m.kind === 'line' || m.kind === 'arrow')
    if (m.type === 'text') obj.setControlsVisibility({ mt: false, mb: false })
    else if (m.type === 'image') obj.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false })
    else if (isLine) obj.setControlsVisibility({ mt: false, mb: false, tl: false, tr: false, bl: false, br: false })
    else obj.setControlsVisibility({})
  }
}

// ---------------------------------------------------------------------------------------------
// build / update

export function buildObject(m: ObjModel, ctx: BuildCtx): fabric.FabricObject {
  const base = interactiveBase(ctx)
  let obj: fabric.FabricObject
  if (m.type === 'text') {
    obj = new fabric.Textbox(displayText(m), {
      ...base,
      ...textProps(m),
      splitByGrapheme: false,
      editable: ctx.interactive && !m.locked,
      cursorColor: ctx.accent,
      editingBorderColor: ctx.accent,
      objectCaching: false,
    })
  } else if (m.type === 'shape') {
    obj = makeShape(m, base)
    geom.set(obj, geomKey(m))
  } else {
    obj = new fabric.FabricImage(tinyCanvas(), { ...base, objectCaching: false })
    updateImage(obj as fabric.FabricImage, m, ctx)
  }
  ids.set(obj, m.id)
  applyCommon(obj, m, ctx)
  obj.setCoords()
  return obj
}

function tinyCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1
  c.height = 1
  return c
}

function updateImage(img: fabric.FabricImage, m: ImageObj, ctx: BuildCtx) {
  const key = bakeKey(m, ctx.maxBake)
  let el = img.getElement() as HTMLCanvasElement
  if (bakes.get(img) !== key) {
    const baked = bakeImage(m, ctx.maxBake)
    if (baked) {
      img.setElement(baked.canvas)
      el = baked.canvas
      bakes.set(img, key)
    }
  }
  img.set({
    width: el.width,
    height: el.height,
    scaleX: m.width / el.width,
    scaleY: m.height / el.height,
    cropX: 0,
    cropY: 0,
  })
  img.dirty = true
}

/** Forget cached bakes so the next update re-bakes (an asset finished loading). */
export function invalidateBake(obj: fabric.FabricObject) {
  bakes.delete(obj)
}
export function isBaked(obj: fabric.FabricObject): boolean {
  return bakes.has(obj)
}

/** Applies `m` to an existing fabric object. Returns true when the object must be REPLACED
 * (shape geometry that fabric cannot mutate in place). */
export function updateObject(obj: fabric.FabricObject, m: ObjModel, ctx: BuildCtx): boolean {
  if (m.type === 'text') {
    const t = obj as fabric.Textbox
    const props = textProps(m)
    t.set({ ...props, scaleX: 1, scaleY: 1, editable: ctx.interactive && !m.locked })
    if (!t.isEditing) {
      const next = displayText(m)
      if (t.text !== next) t.set({ text: next })
    }
    t.initDimensions()
  } else if (m.type === 'shape') {
    if (geom.get(obj) !== geomKey(m)) return true
    const style = shapeStyle(m)
    if (m.kind === 'rect') {
      const r = obj as fabric.Rect
      r.set({ ...style, width: m.width, height: m.height, rx: m.radius, ry: m.radius })
    } else if (m.kind === 'circle') {
      ;(obj as fabric.Ellipse).set({ ...style, rx: m.width / 2, ry: m.height / 2 })
    } else if (m.kind === 'triangle') {
      obj.set({ ...style, width: m.width, height: m.height })
    } else {
      obj.set({ ...style })
    }
    obj.set({ scaleX: 1, scaleY: 1 })
  } else {
    updateImage(obj as fabric.FabricImage, m, ctx)
  }
  applyCommon(obj, m, ctx)
  obj.setCoords()
  obj.dirty = true
  return false
}

export function noteGeometry(obj: fabric.FabricObject, m: ObjModel) {
  if (m.type === 'shape') geom.set(obj, geomKey(m))
}
export function tagId(obj: fabric.FabricObject, id: string) {
  ids.set(obj, id)
}
