/** Document model for the Posts editor. Everything the user sees is derived from this plain JSON:
 * the fabric canvases (on screen) and the exporter (full resolution) both build their objects from it,
 * which is what guarantees that exports match the screen. Objects are immutable: edits produce new
 * objects, unchanged ones keep their reference (history snapshots and reconcile rely on that). */

export interface GradientPaint {
  kind: 'linear'
  /** CSS convention: 0 = to top, 90 = to right. */
  angle: number
  stops: { offset: number; color: string }[]
}
export type Paint = string | GradientPaint

export interface ShadowSpec {
  color: string
  blur: number
  x: number
  y: number
}

export interface Adjustments {
  brightness: number
  contrast: number
  saturation: number
  vibrance: number
  temperature: number
  tint: number
  highlights: number
  shadows: number
  sharpness: number
  blur: number
  vignette: number
}
export const NO_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  sharpness: 0,
  blur: 0,
  vignette: 0,
}
export function isNeutralAdjustments(a: Adjustments): boolean {
  return (Object.keys(NO_ADJUSTMENTS) as (keyof Adjustments)[]).every((k) => a[k] === 0)
}

export type ObjRole = 'photo' | 'headline' | 'watermark'

interface BaseObj {
  id: string
  name?: string
  /** Centre of the object, in design pixels. */
  x: number
  y: number
  angle: number
  opacity: number
  locked?: boolean
  hidden?: boolean
  flipX?: boolean
  flipY?: boolean
  shadow?: ShadowSpec | null
  groupId?: string
  role?: ObjRole
}

export type CaseMode = 'none' | 'upper' | 'lower' | 'title'
export type ListMode = 'none' | 'bullet' | 'number'

export interface TextObj extends BaseObj {
  type: 'text'
  /** Raw text as typed. `caseMode` and `list` are display transforms applied on top. */
  text: string
  width: number
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  fill: string
  align: 'left' | 'center' | 'right' | 'justify'
  /** fabric charSpacing: thousandths of an em. */
  letterSpacing: number
  lineHeight: number
  caseMode: CaseMode
  list: ListMode
  stroke?: { color: string; width: number } | null
  hollow?: boolean
  highlight?: string | null
}

export type ShapeKind = 'rect' | 'circle' | 'triangle' | 'star' | 'line' | 'arrow'
export interface ShapeObj extends BaseObj {
  type: 'shape'
  kind: ShapeKind
  width: number
  height: number
  fill: Paint
  stroke: string
  strokeWidth: number
  dash: 'solid' | 'dashed' | 'dotted'
  radius: number
}

export type FrameKind = 'none' | 'circle' | 'rounded' | 'arch'
export type Treatment = 'darkened' | 'transparency' | null
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}
export interface ImageObj extends BaseObj {
  type: 'image'
  /** Original asset. null = an empty frame placeholder waiting for a photo. */
  assetId: string | null
  /** Background-removed twin of `assetId` (same aspect), and whether it is the one being shown. */
  cutoutId?: string | null
  useCutout?: boolean
  width: number
  height: number
  /** Visible region, in ORIGINAL asset pixels. */
  crop: CropRect | null
  adj: Adjustments
  filter: { id: string; intensity: number } | null
  treatment: Treatment
  radius: number
  frame: FrameKind
  border: { width: number; color: string } | null
}

export type ObjModel = TextObj | ShapeObj | ImageObj

export interface Page {
  id: string
  background: Paint
  objects: ObjModel[]
  hidden?: boolean
  /** Template last applied to this page (1..3), so the next photo dropped in is treated like it. */
  templateId?: number | null
}

export interface Doc {
  id: string
  title: string
  width: number
  height: number
  pages: Page[]
  caption: string
  /** Linked PostDraft row on the backend (created on first save-draft / publish). */
  draftId?: number | null
  version: 1
  createdAt: number
  updatedAt: number
}

export function uid(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '').slice(0, 12)
  return Math.random().toString(36).slice(2, 14).padEnd(12, '0')
}

export interface SizePreset {
  id: string
  label: string
  width: number
  height: number
  group: 'Instagram' | 'Social' | 'Other'
}
export const SIZE_PRESETS: SizePreset[] = [
  { id: '1:1', label: 'Instagram square 1:1', width: 1080, height: 1080, group: 'Instagram' },
  { id: '4:5', label: 'Instagram portrait 4:5', width: 1080, height: 1350, group: 'Instagram' },
  { id: '3:4', label: 'Portrait 3:4', width: 1080, height: 1440, group: 'Instagram' },
  { id: '9:16', label: 'Story or Reel 9:16', width: 1080, height: 1920, group: 'Instagram' },
  { id: '16:9', label: 'Landscape 16:9', width: 1920, height: 1080, group: 'Instagram' },
  { id: 'x-post', label: 'X post', width: 1600, height: 900, group: 'Social' },
  { id: 'li-post', label: 'LinkedIn post', width: 1200, height: 627, group: 'Social' },
  { id: 'pin', label: 'Pinterest pin', width: 1000, height: 1500, group: 'Social' },
  { id: 'yt-thumb', label: 'YouTube thumbnail', width: 1280, height: 720, group: 'Social' },
  { id: 'fb-cover', label: 'Facebook cover', width: 820, height: 312, group: 'Social' },
]
export const MIN_SIZE = 100
export const MAX_SIZE = 4096

export function sizeLabel(w: number, h: number): string {
  const p = SIZE_PRESETS.find((s) => s.width === w && s.height === h)
  return p ? p.label : `Custom ${w} x ${h}`
}

export function isText(o: ObjModel | undefined): o is TextObj {
  return !!o && o.type === 'text'
}
export function isShape(o: ObjModel | undefined): o is ShapeObj {
  return !!o && o.type === 'shape'
}
export function isImage(o: ObjModel | undefined): o is ImageObj {
  return !!o && o.type === 'image'
}

export const DEFAULT_TEXT: Omit<TextObj, 'id' | 'x' | 'y' | 'text' | 'width'> = {
  type: 'text',
  angle: 0,
  opacity: 1,
  fontFamily: 'Arial',
  fontSize: 64,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  fill: '#ffffff',
  align: 'center',
  letterSpacing: 0,
  lineHeight: 1.2,
  caseMode: 'none',
  list: 'none',
  stroke: null,
  hollow: false,
  highlight: null,
  shadow: null,
}

export function newText(partial: Partial<TextObj> & { x: number; y: number; text: string; width: number }): TextObj {
  return { ...DEFAULT_TEXT, id: uid(), ...partial }
}

export function newShape(kind: ShapeKind, cx: number, cy: number, size: number, partial: Partial<ShapeObj> = {}): ShapeObj {
  const isLine = kind === 'line' || kind === 'arrow'
  return {
    type: 'shape',
    id: uid(),
    kind,
    x: cx,
    y: cy,
    angle: 0,
    opacity: 1,
    width: isLine ? size * 1.2 : size,
    height: isLine ? 0 : size,
    fill: isLine ? 'transparent' : '#4f8cff',
    stroke: isLine ? '#ffffff' : '#000000',
    strokeWidth: isLine ? 8 : 0,
    dash: 'solid',
    radius: 0,
    shadow: null,
    ...partial,
  }
}

export function newImage(partial: Partial<ImageObj> & { x: number; y: number; width: number; height: number }): ImageObj {
  return {
    type: 'image',
    id: uid(),
    angle: 0,
    opacity: 1,
    assetId: null,
    crop: null,
    adj: NO_ADJUSTMENTS,
    filter: null,
    treatment: null,
    radius: 0,
    frame: 'none',
    border: null,
    shadow: null,
    ...partial,
  }
}

export function newPage(background: Paint = '#ffffff', templateId: number | null = null): Page {
  return { id: uid(), background, objects: [], templateId }
}

export function newDoc(width: number, height: number, title = 'Untitled design'): Doc {
  const now = Date.now()
  return {
    id: uid(),
    title,
    width,
    height,
    pages: [newPage('#000000', 1)],
    caption: '',
    version: 1,
    createdAt: now,
    updatedAt: now,
  }
}

export function coverCrop(assetW: number, assetH: number, boxW: number, boxH: number): CropRect {
  const scale = Math.max(boxW / assetW, boxH / assetH)
  const w = boxW / scale
  const h = boxH / scale
  return { x: (assetW - w) / 2, y: (assetH - h) / 2, w, h }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Collect the unique hex/rgb colours used in a doc (for the "document colours" row). */
export function docColors(doc: Doc): string[] {
  const out = new Set<string>()
  const add = (c: unknown) => {
    if (typeof c === 'string' && c && c !== 'transparent' && /^#|^rgb/i.test(c)) out.add(c.toLowerCase())
  }
  for (const p of doc.pages) {
    if (typeof p.background === 'string') add(p.background)
    for (const o of p.objects) {
      if (o.type === 'text') add(o.fill)
      else if (o.type === 'shape') {
        if (typeof o.fill === 'string') add(o.fill)
        if (o.strokeWidth > 0) add(o.stroke)
      }
    }
  }
  return [...out].slice(0, 14)
}
