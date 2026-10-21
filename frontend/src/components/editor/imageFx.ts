import { getBitmap } from './assets'
import { clamp, isNeutralAdjustments, NO_ADJUSTMENTS, type Adjustments, type ImageObj } from './model'

/** CPU photo pipeline. The result of bakeImage() is a plain canvas (crop + treatment + adjustments +
 * filter + frame mask + border), shown by fabric as an ordinary image. Because the on-screen canvases
 * and the exporter both call this exact function, photo edits look identical in both. */

export interface FilterPreset {
  id: string
  label: string
  adj: Partial<Adjustments>
  fade?: number
  mono?: boolean
  sepia?: number
  split?: { shadow: [number, number, number]; highlight: [number, number, number]; amount: number }
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'vivid', label: 'Vivid', adj: { saturation: 30, contrast: 14, vibrance: 22 } },
  { id: 'warm', label: 'Warm', adj: { temperature: 30, tint: 4, saturation: 8, brightness: 4 } },
  { id: 'cool', label: 'Cool', adj: { temperature: -32, saturation: 6 } },
  { id: 'golden', label: 'Golden', adj: { temperature: 42, tint: 10, highlights: -10, saturation: 14, brightness: 4 } },
  { id: 'sunset', label: 'Sunset', adj: { temperature: 34, tint: 22, saturation: 20, contrast: 8 } },
  { id: 'fade', label: 'Fade', adj: { contrast: -14, saturation: -14 }, fade: 0.22 },
  { id: 'matte', label: 'Matte', adj: { contrast: -8, shadows: 14, saturation: -6 }, fade: 0.18 },
  { id: 'drama', label: 'Drama', adj: { contrast: 34, saturation: -22, shadows: -18, vignette: 28 } },
  { id: 'noir', label: 'Noir', adj: { contrast: 32 }, mono: true },
  { id: 'silver', label: 'Silver', adj: { contrast: 10, brightness: 5 }, mono: true, fade: 0.1 },
  { id: 'sepia', label: 'Sepia', adj: { contrast: 6 }, sepia: 0.95 },
  { id: 'teal', label: 'Teal and orange', adj: { contrast: 14, saturation: 8 }, split: { shadow: [0, 34, 46], highlight: [52, 28, 0], amount: 0.8 } },
]

export const ADJUST_CONTROLS: { key: keyof Adjustments; label: string; min: number }[] = [
  { key: 'brightness', label: 'Brightness', min: -100 },
  { key: 'contrast', label: 'Contrast', min: -100 },
  { key: 'saturation', label: 'Saturation', min: -100 },
  { key: 'vibrance', label: 'Vibrance', min: -100 },
  { key: 'temperature', label: 'Temperature', min: -100 },
  { key: 'tint', label: 'Tint', min: -100 },
  { key: 'highlights', label: 'Highlights', min: -100 },
  { key: 'shadows', label: 'Shadows', min: -100 },
  { key: 'sharpness', label: 'Sharpness', min: 0 },
  { key: 'blur', label: 'Blur', min: 0 },
  { key: 'vignette', label: 'Vignette', min: 0 },
]

// ---------------------------------------------------------------------------------------------
// pixel passes

function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

interface Tone {
  brightness: number
  contrast: number
  saturation: number
  vibrance: number
  temperature: number
  tint: number
  highlights: number
  shadows: number
  pivot: number
  fade: number
  mono: boolean
  sepia: number
  split?: FilterPreset['split']
}

function toneFrom(adj: Partial<Adjustments>, extra: Partial<Pick<Tone, 'fade' | 'mono' | 'sepia' | 'split' | 'pivot'>> = {}): Tone {
  return {
    brightness: adj.brightness ?? 0,
    contrast: adj.contrast ?? 0,
    saturation: adj.saturation ?? 0,
    vibrance: adj.vibrance ?? 0,
    temperature: adj.temperature ?? 0,
    tint: adj.tint ?? 0,
    highlights: adj.highlights ?? 0,
    shadows: adj.shadows ?? 0,
    pivot: extra.pivot ?? 128,
    fade: extra.fade ?? 0,
    mono: extra.mono ?? false,
    sepia: extra.sepia ?? 0,
    split: extra.split,
  }
}

function toneIsNeutral(t: Tone) {
  return (
    !t.brightness && !t.contrast && !t.saturation && !t.vibrance && !t.temperature && !t.tint && !t.highlights && !t.shadows && !t.fade && !t.mono && !t.sepia && !t.split
  )
}

function tonePass(d: Uint8ClampedArray, t: Tone) {
  const gain = 1 + (t.brightness / 100) * 0.7
  const cf = 1 + (t.contrast / 100) * 0.8
  const tempK = (t.temperature / 100) * 0.25
  const tintG = (t.tint / 100) * 0.15
  const tintRB = (t.tint / 100) * 0.05
  const hl = (t.highlights / 100) * 0.4
  const sh = (t.shadows / 100) * 0.4
  const satK = 1 + t.saturation / 100
  const vibK = t.vibrance / 100
  const fadeLift = t.fade * 80
  const fadeScale = 1 - fadeLift / 255
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    let r = d[i] * gain
    let g = d[i + 1] * gain
    let b = d[i + 2] * gain
    if (cf !== 1) {
      r = (r - t.pivot) * cf + t.pivot
      g = (g - t.pivot) * cf + t.pivot
      b = (b - t.pivot) * cf + t.pivot
    }
    if (hl !== 0 || sh !== 0) {
      const lum = clamp((0.299 * r + 0.587 * g + 0.114 * b) / 255, 0, 1)
      const delta = (hl * smoothstep(0.45, 1, lum) + sh * (1 - smoothstep(0, 0.55, lum))) * 128
      r += delta
      g += delta
      b += delta
    }
    if (tempK !== 0 || tintG !== 0) {
      r *= 1 + tempK + tintRB
      b *= 1 - tempK + tintRB
      g *= 1 - tintG
    }
    if (satK !== 1 || vibK !== 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b
      let sf = satK
      if (vibK !== 0) {
        const mx = Math.max(r, g, b)
        const mn = Math.min(r, g, b)
        const sp = mx > 0 ? clamp((mx - mn) / mx, 0, 1) : 0
        sf += vibK * (1 - sp)
      }
      r = gray + (r - gray) * sf
      g = gray + (g - gray) * sf
      b = gray + (b - gray) * sf
    }
    if (t.mono) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b
      r = g = b = gray
    }
    if (t.sepia) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b
      const sg = 0.349 * r + 0.686 * g + 0.168 * b
      const sb = 0.272 * r + 0.534 * g + 0.131 * b
      r += (sr - r) * t.sepia
      g += (sg - g) * t.sepia
      b += (sb - b) * t.sepia
    }
    if (t.split) {
      const lum = clamp((0.299 * r + 0.587 * g + 0.114 * b) / 255, 0, 1)
      const a = t.split.amount
      r += (t.split.shadow[0] * (1 - lum) + t.split.highlight[0] * lum) * a
      g += (t.split.shadow[1] * (1 - lum) + t.split.highlight[1] * lum) * a
      b += (t.split.shadow[2] * (1 - lum) + t.split.highlight[2] * lum) * a
    }
    if (fadeLift) {
      r = fadeLift + r * fadeScale
      g = fadeLift + g * fadeScale
      b = fadeLift + b * fadeScale
    }
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
  }
}

/** The Posts templates' own look: saturation, contrast pivoting on the mean luma, then a brightness scale. */
function treatmentPass(d: Uint8ClampedArray, kind: 'darkened' | 'transparency') {
  let sum = 0
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    n++
  }
  const mean = n ? sum / n : 128
  const sat = kind === 'darkened' ? 0.5 : 0.35
  const con = kind === 'darkened' ? 1.15 : 1
  const scale = kind === 'darkened' ? 0.55 : 1
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    const r0 = d[i]
    const g0 = d[i + 1]
    const b0 = d[i + 2]
    const gray = 0.299 * r0 + 0.587 * g0 + 0.114 * b0
    let r = gray + (r0 - gray) * sat
    let g = gray + (g0 - gray) * sat
    let b = gray + (b0 - gray) * sat
    r = clamp(mean + (r - mean) * con, 0, 255) * scale
    g = clamp(mean + (g - mean) * con, 0, 255) * scale
    b = clamp(mean + (b - mean) * con, 0, 255) * scale
    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
  }
}

function boxBlur(d: Uint8ClampedArray, w: number, h: number, radius: number) {
  const tmp = new Uint8ClampedArray(d.length)
  const pass = (src: Uint8ClampedArray, dst: Uint8ClampedArray, horizontal: boolean) => {
    const lines = horizontal ? h : w
    const len = horizontal ? w : h
    const step = horizontal ? 4 : w * 4
    const lineStep = horizontal ? w * 4 : 4
    const span = radius * 2 + 1
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep
      for (let c = 0; c < 4; c++) {
        let acc = 0
        for (let k = -radius; k <= radius; k++) acc += src[base + clamp(k, 0, len - 1) * step + c]
        for (let p = 0; p < len; p++) {
          dst[base + p * step + c] = acc / span
          const out = clamp(p - radius, 0, len - 1)
          const inn = clamp(p + radius + 1, 0, len - 1)
          acc += src[base + inn * step + c] - src[base + out * step + c]
        }
      }
    }
  }
  for (let i = 0; i < 3; i++) {
    pass(d, tmp, true)
    pass(tmp, d, false)
  }
}

function sharpenPass(d: Uint8ClampedArray, w: number, h: number, amount: number) {
  const s = amount
  const src = new Uint8ClampedArray(d)
  const row = w * 4
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * row + x * 4
      if (src[i + 3] === 0) continue
      for (let c = 0; c < 3; c++) {
        const v = src[i + c] * (1 + 4 * s) - s * (src[i + c - 4] + src[i + c + 4] + src[i + c - row] + src[i + c + row])
        d[i + c] = v
      }
    }
  }
}

function vignettePass(d: Uint8ClampedArray, w: number, h: number, amount: number) {
  const k = amount / 100
  const cx = w / 2
  const cy = h / 2
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / cx
      const dist = Math.sqrt(nx * nx + ny * ny) / 1.4142
      const f = 1 - k * 0.85 * Math.pow(smoothstep(0.3, 1, dist), 1.4)
      const i = (y * w + x) * 4
      d[i] *= f
      d[i + 1] *= f
      d[i + 2] *= f
    }
  }
}

export interface FxSpec {
  treatment: 'darkened' | 'transparency' | null
  adj: Adjustments
  filter: { id: string; intensity: number } | null
}

export function fxIsNeutral(fx: FxSpec): boolean {
  return !fx.treatment && !fx.filter && isNeutralAdjustments(fx.adj)
}

export function applyFx(ctx: CanvasRenderingContext2D, w: number, h: number, fx: FxSpec) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const adj = fx.adj
  if (adj.blur > 0) {
    const r = Math.round((adj.blur / 100) * 0.025 * Math.max(w, h))
    if (r >= 1) boxBlur(d, w, h, r)
  }
  if (fx.treatment) treatmentPass(d, fx.treatment)
  const tone = toneFrom(adj)
  if (!toneIsNeutral(tone)) tonePass(d, tone)
  const preset = fx.filter ? FILTER_PRESETS.find((p) => p.id === fx.filter!.id) : undefined
  if (preset && fx.filter!.intensity > 0) {
    const k = clamp(fx.filter!.intensity / 100, 0, 1)
    const before = k < 1 ? new Uint8ClampedArray(d) : null
    const presetAdj = { ...preset.adj }
    tonePass(d, toneFrom(presetAdj, { fade: preset.fade, mono: preset.mono, sepia: preset.sepia, split: preset.split }))
    if (presetAdj.vignette) vignettePass(d, w, h, presetAdj.vignette)
    if (before) {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = before[i] + (d[i] - before[i]) * k
        d[i + 1] = before[i + 1] + (d[i + 1] - before[i + 1]) * k
        d[i + 2] = before[i + 2] + (d[i + 2] - before[i + 2]) * k
      }
    }
  }
  if (adj.sharpness > 0) sharpenPass(d, w, h, (adj.sharpness / 100) * 1.2)
  if (adj.vignette > 0) vignettePass(d, w, h, adj.vignette)
  ctx.putImageData(img, 0, 0)
}

// ---------------------------------------------------------------------------------------------
// frame mask + border

function roundedRect(p: Path2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  p.moveTo(x + rr, y)
  p.lineTo(x + w - rr, y)
  p.arcTo(x + w, y, x + w, y + rr, rr)
  p.lineTo(x + w, y + h - rr)
  p.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  p.lineTo(x + rr, y + h)
  p.arcTo(x, y + h, x, y + h - rr, rr)
  p.lineTo(x, y + rr)
  p.arcTo(x, y, x + rr, y, rr)
  p.closePath()
}

function maskPath(frame: ImageObj['frame'], radius: number, w: number, h: number, inset = 0): Path2D | null {
  const p = new Path2D()
  const x = inset
  const y = inset
  const iw = w - inset * 2
  const ih = h - inset * 2
  if (iw <= 0 || ih <= 0) return null
  if (frame === 'circle') {
    p.ellipse(w / 2, h / 2, iw / 2, ih / 2, 0, 0, Math.PI * 2)
    return p
  }
  if (frame === 'rounded') {
    roundedRect(p, x, y, iw, ih, radius > 0 ? radius : Math.min(iw, ih) * 0.12)
    return p
  }
  if (frame === 'arch') {
    const rad = Math.min(iw / 2, ih)
    p.moveTo(x, y + ih)
    p.lineTo(x, y + rad)
    p.ellipse(x + iw / 2, y + rad, iw / 2, rad, 0, Math.PI, Math.PI * 2)
    p.lineTo(x + iw, y + ih)
    p.closePath()
    return p
  }
  if (radius > 0) {
    roundedRect(p, x, y, iw, ih, radius)
    return p
  }
  return null
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#d9d9df'
  ctx.fillRect(0, 0, w, h)
  const s = Math.min(w, h) * 0.28
  const cx = w / 2
  const cy = h / 2
  ctx.fillStyle = '#b4b4bd'
  ctx.beginPath()
  ctx.moveTo(cx - s, cy + s * 0.7)
  ctx.lineTo(cx - s * 0.25, cy - s * 0.2)
  ctx.lineTo(cx + s * 0.2, cy + s * 0.35)
  ctx.lineTo(cx + s * 0.45, cy)
  ctx.lineTo(cx + s, cy + s * 0.7)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + s * 0.45, cy - s * 0.5, s * 0.2, 0, Math.PI * 2)
  ctx.fill()
}

// ---------------------------------------------------------------------------------------------
// bake

export interface Baked {
  canvas: HTMLCanvasElement
  /** baked pixels per design pixel (<= 1) */
  scale: number
}

/** The visual identity of a bake: when this string is unchanged the cached canvas is still valid. */
export function bakeKey(m: ImageObj, maxSide: number): string {
  return JSON.stringify([m.assetId, m.useCutout ? m.cutoutId : null, m.crop, Math.round(m.width), Math.round(m.height), m.adj, m.filter, m.treatment, m.radius, m.frame, m.border, maxSide])
}

export function bakeImage(m: ImageObj, maxSide: number): Baked | null {
  const dw = Math.max(1, m.width)
  const dh = Math.max(1, m.height)
  const cap = Math.min(maxSide, 4096)

  if (!m.assetId) {
    const scale = Math.min(1, cap / Math.max(dw, dh))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(dw * scale))
    c.height = Math.max(1, Math.round(dh * scale))
    const ctx = c.getContext('2d')!
    drawPlaceholder(ctx, c.width, c.height)
    finishShape(ctx, c, m, scale)
    return { canvas: c, scale }
  }

  const orig = getBitmap(m.assetId)
  if (!orig) return null
  const useCut = !!(m.useCutout && m.cutoutId)
  const src = useCut ? getBitmap(m.cutoutId) : orig
  if (!src) return null
  const crop = m.crop ?? { x: 0, y: 0, w: orig.width, h: orig.height }
  const kx = src.width / orig.width
  const ky = src.height / orig.height
  const sx = clamp(crop.x * kx, 0, src.width - 1)
  const sy = clamp(crop.y * ky, 0, src.height - 1)
  const sw = clamp(crop.w * kx, 1, src.width - sx)
  const sh = clamp(crop.h * ky, 1, src.height - sy)

  const scale = Math.min(1, sw / dw, cap / Math.max(dw, dh))
  const bw = Math.max(1, Math.round(dw * scale))
  const bh = Math.max(1, Math.round(dh * scale))
  const c = document.createElement('canvas')
  c.width = bw
  c.height = bh
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, bw, bh)

  const fx: FxSpec = { treatment: m.treatment, adj: m.adj ?? NO_ADJUSTMENTS, filter: m.filter }
  if (!fxIsNeutral(fx)) applyFx(ctx, bw, bh, fx)
  finishShape(ctx, c, m, scale)
  return { canvas: c, scale }
}

/** Clips the baked pixels to the frame / corner radius and draws the border along the same outline. */
function finishShape(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, m: ImageObj, scale: number) {
  const w = c.width
  const h = c.height
  const radius = m.radius * scale
  const mask = maskPath(m.frame, radius, w, h)
  if (mask) {
    ctx.save()
    ctx.globalCompositeOperation = 'destination-in'
    ctx.fill(mask)
    ctx.restore()
  }
  if (m.border && m.border.width > 0) {
    const bwid = Math.max(1, m.border.width * scale)
    const path = maskPath(m.frame, radius, w, h, bwid / 2) ?? (() => {
      const p = new Path2D()
      p.rect(bwid / 2, bwid / 2, w - bwid, h - bwid)
      return p
    })()
    ctx.save()
    ctx.lineWidth = bwid
    ctx.strokeStyle = m.border.color
    ctx.stroke(path)
    ctx.restore()
  }
}

// ---------------------------------------------------------------------------------------------
// filter thumbnails

const thumbCache = new Map<string, string>()
export function filterThumb(assetId: string, presetId: string | null, size = 88): string | null {
  const key = `${assetId}|${presetId}|${size}`
  const hit = thumbCache.get(key)
  if (hit) return hit
  const bmp = getBitmap(assetId)
  if (!bmp) return null
  const k = size / Math.min(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const sw = size / k
  ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sw) / 2, sw, sw, 0, 0, size, size)
  if (presetId) applyFx(ctx, size, size, { treatment: null, adj: NO_ADJUSTMENTS, filter: { id: presetId, intensity: 100 } })
  const url = c.toDataURL('image/jpeg', 0.8)
  thumbCache.set(key, url)
  return url
}
