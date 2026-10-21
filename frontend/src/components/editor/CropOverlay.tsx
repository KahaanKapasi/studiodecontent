import { useEffect, useMemo, useRef, useState } from 'react'
import { applyCrop } from './actions'
import { getBitmap, getMeta } from './assets'
import { bakeImage } from './imageFx'
import { clamp, type CropRect, type ImageObj } from './model'
import { editorStore, findObj, useEditor } from './store'

/** Interactive crop. Everything is computed in the image's own rotated/flipped frame (origin at the
 * object centre), so rotation and flips just work. The window is kept in ORIGINAL asset pixels. */

type Handle = 'tl' | 'tr' | 'bl' | 'br' | 'l' | 'r' | 't' | 'b' | 'move'
const MIN = 24

export const CROP_RATIOS: { id: string; label: string; r: number | null }[] = [
  { id: 'free', label: 'Free', r: null },
  { id: '1:1', label: '1:1', r: 1 },
  { id: '4:5', label: '4:5', r: 4 / 5 },
  { id: '3:4', label: '3:4', r: 3 / 4 },
  { id: '16:9', label: '16:9', r: 16 / 9 },
  { id: '9:16', label: '9:16', r: 9 / 16 },
]

function fitRatio(win: CropRect, r: number, A: { w: number; h: number }): CropRect {
  let w = win.w
  let h = win.w / r
  if (h > win.h) {
    h = win.h
    w = h * r
  }
  w = Math.min(w, A.w)
  h = Math.min(h, A.h)
  const cx = win.x + win.w / 2
  const cy = win.y + win.h / 2
  return { x: clamp(cx - w / 2, 0, A.w - w), y: clamp(cy - h / 2, 0, A.h - h), w, h }
}

function resize(handle: Handle, s: CropRect, ddx: number, ddy: number, ratio: number | null, A: { w: number; h: number }): CropRect {
  const L = handle.includes('l')
  const R = handle.includes('r')
  const T = handle.includes('t')
  const B = handle.includes('b')
  const isCorner = (L || R) && (T || B)
  if (!ratio) {
    let { x, y, w, h } = s
    if (L) {
      const nx = clamp(s.x + ddx, 0, s.x + s.w - MIN)
      w = s.x + s.w - nx
      x = nx
    }
    if (R) w = clamp(s.w + ddx, MIN, A.w - s.x)
    if (T) {
      const ny = clamp(s.y + ddy, 0, s.y + s.h - MIN)
      h = s.y + s.h - ny
      y = ny
    }
    if (B) h = clamp(s.h + ddy, MIN, A.h - s.y)
    return { x, y, w, h }
  }
  const r = ratio
  if (isCorner) {
    const sx = L ? -1 : 1
    const sy = T ? -1 : 1
    const ax = L ? s.x + s.w : s.x
    const ay = T ? s.y + s.h : s.y
    const dW = s.w + sx * ddx
    const dH = s.h + sy * ddy
    let w = Math.max(dW, dH * r)
    const maxW = Math.min(sx < 0 ? ax : A.w - ax, (sy < 0 ? ay : A.h - ay) * r)
    w = clamp(w, Math.min(MIN, maxW), maxW)
    const h = w / r
    return { x: sx < 0 ? ax - w : ax, y: sy < 0 ? ay - h : ay, w, h }
  }
  if (L || R) {
    const ax = L ? s.x + s.w : s.x
    const cy = s.y + s.h / 2
    const dW = s.w + (L ? -ddx : ddx)
    const maxW = Math.min(L ? ax : A.w - ax, Math.min(cy, A.h - cy) * 2 * r)
    const w = clamp(dW, Math.min(MIN, maxW), maxW)
    const h = w / r
    return { x: L ? ax - w : ax, y: cy - h / 2, w, h }
  }
  const ay = T ? s.y + s.h : s.y
  const cx = s.x + s.w / 2
  const dH = s.h + (T ? -ddy : ddy)
  const maxH = Math.min(T ? ay : A.h - ay, Math.min(cx, A.w - cx) * 2 / r)
  const h = clamp(dH, Math.min(MIN, maxH), maxH)
  const w = h * r
  return { x: cx - w / 2, y: T ? ay - h : ay, w, h }
}

export default function CropOverlay({ imageId }: { imageId: string }) {
  const zoom = useEditor((s) => s.zoom)
  const doc = useEditor((s) => s.doc)
  const m = useMemo(() => {
    const f = findObj(doc, imageId)
    return f && f.obj.type === 'image' ? f.obj : null
  }, [doc, imageId])
  const [base] = useState<ImageObj | null>(m)
  useEffect(() => editorStore.set({ cropRatioId: 'free', cropCmd: null }), [])

  const orig = base?.assetId ? getMeta(base.assetId) : undefined
  const bmp = base?.assetId ? getBitmap(base.assetId) : undefined
  const A = useMemo(() => (bmp ? { w: bmp.width, h: bmp.height } : orig ? { w: orig.w, h: orig.h } : null), [bmp, orig])

  const crop0: CropRect | null = useMemo(() => (base && A ? (base.crop ?? { x: 0, y: 0, w: A.w, h: A.h }) : null), [base, A])
  const [winState, setWin] = useState<CropRect | null>(null)
  const ratioId = useEditor((s) => s.cropRatioId)
  const ratio = CROP_RATIOS.find((r) => r.id === ratioId)?.r ?? null
  const cmd = useEditor((s) => s.cropCmd)
  const effectiveWin = winState ?? crop0

  const kx = base && crop0 ? base.width / crop0.w : 1
  const ky = base && crop0 ? base.height / crop0.h : 1
  const ox = base && crop0 ? -base.width / 2 - crop0.x * kx : 0
  const oy = base && crop0 ? -base.height / 2 - crop0.y * ky : 0

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const brightRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!base || !A || !canvasRef.current) return
    const full: ImageObj = { ...base, crop: { x: 0, y: 0, w: A.w, h: A.h }, width: A.w * kx, height: A.h * ky, radius: 0, frame: 'none', border: null, shadow: null }
    const baked = bakeImage(full, 900)
    const c = canvasRef.current
    if (!baked) return
    c.width = baked.canvas.width
    c.height = baked.canvas.height
    c.getContext('2d')!.drawImage(baked.canvas, 0, 0)
    const b = brightRef.current
    if (b) {
      b.width = baked.canvas.width
      b.height = baked.canvas.height
      b.getContext('2d')!.drawImage(baked.canvas, 0, 0)
    }
  }, [base, A, kx, ky])

  const drag = useRef<{ handle: Handle; sx: number; sy: number; start: CropRect } | null>(null)

  const done = () => {
    if (base && effectiveWin && A) {
      const fx = base.flipX ? -1 : 1
      const fy = base.flipY ? -1 : 1
      const lx = (ox + (effectiveWin.x + effectiveWin.w / 2) * kx) * fx
      const ly = (oy + (effectiveWin.y + effectiveWin.h / 2) * ky) * fy
      const th = (base.angle * Math.PI) / 180
      const cx = base.x + lx * Math.cos(th) - ly * Math.sin(th)
      const cy = base.y + lx * Math.sin(th) + ly * Math.cos(th)
      const changed = JSON.stringify(effectiveWin) !== JSON.stringify(crop0)
      if (changed) applyCrop(imageId, effectiveWin, kx, { x: Math.round(cx * 100) / 100, y: Math.round(cy * 100) / 100 })
    }
    editorStore.set({ cropId: null, cropCmd: null })
  }
  const cancel = () => editorStore.set({ cropId: null, cropCmd: null })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        done()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancel()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
    // done() reads fresh state through refs/closures on each render of this effect
  })

  useEffect(() => {
    if (!A || !ratio) return
    setWin((w) => fitRatio(w ?? crop0 ?? { x: 0, y: 0, w: A.w, h: A.h }, ratio, A))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratioId, A])
  useEffect(() => {
    if (cmd === 'done') done()
    else if (cmd === 'cancel') cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd])

  if (!base || !A || !effectiveWin || !crop0) return null
  const win = effectiveWin

  const z = zoom
  const th = (base.angle * Math.PI) / 180
  const fx = base.flipX ? -1 : 1
  const fy = base.flipY ? -1 : 1

  const onDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { handle, sx: e.clientX, sy: e.clientY, start: win }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dxs = (e.clientX - d.sx) / z
    const dys = (e.clientY - d.sy) / z
    let dx = dxs * Math.cos(th) + dys * Math.sin(th)
    let dy = -dxs * Math.sin(th) + dys * Math.cos(th)
    dx *= fx
    dy *= fy
    const ddx = dx / kx
    const ddy = dy / ky
    if (d.handle === 'move') {
      setWin({ ...d.start, x: clamp(d.start.x - ddx, 0, A.w - d.start.w), y: clamp(d.start.y - ddy, 0, A.h - d.start.h) })
    } else {
      setWin(resize(d.handle, d.start, ddx, ddy, ratio, A))
    }
  }
  const onUp = () => {
    drag.current = null
  }

  const winLeft = (ox + win.x * kx) * z
  const winTop = (oy + win.y * ky) * z
  const winW = win.w * kx * z
  const winH = win.h * ky * z
  const fullW = A.w * kx * z
  const fullH = A.h * ky * z
  const clip = `inset(${win.y * ky * z}px ${(A.w - win.x - win.w) * kx * z}px ${(A.h - win.y - win.h) * ky * z}px ${win.x * kx * z}px)`

  const handleStyle = (h: Handle): React.CSSProperties => {
    const size = 14
    const pos: Record<string, React.CSSProperties> = {
      tl: { left: -size / 2, top: -size / 2, cursor: 'nwse-resize' },
      tr: { right: -size / 2, top: -size / 2, cursor: 'nesw-resize' },
      bl: { left: -size / 2, bottom: -size / 2, cursor: 'nesw-resize' },
      br: { right: -size / 2, bottom: -size / 2, cursor: 'nwse-resize' },
      l: { left: -5, top: '50%', marginTop: -14, width: 10, height: 28, cursor: 'ew-resize' },
      r: { right: -5, top: '50%', marginTop: -14, width: 10, height: 28, cursor: 'ew-resize' },
      t: { top: -5, left: '50%', marginLeft: -14, width: 28, height: 10, cursor: 'ns-resize' },
      b: { bottom: -5, left: '50%', marginLeft: -14, width: 28, height: 10, cursor: 'ns-resize' },
    }
    return { position: 'absolute', width: size, height: size, ...pos[h] }
  }

  return (
    <>
      {/* click outside the window = apply */}
      <div className="fixed inset-0 z-30" onPointerDown={done} />
      <div className="pointer-events-none absolute left-0 top-0 z-40" style={{ transform: `translate(${base.x * z}px, ${base.y * z}px) rotate(${base.angle}deg) scale(${fx}, ${fy})`, transformOrigin: '0 0' }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', left: ox * z, top: oy * z, width: fullW, height: fullH, opacity: 0.4 }} />
        <canvas
          ref={brightRef}
          style={{ position: 'absolute', left: ox * z, top: oy * z, width: fullW, height: fullH, clipPath: clip }}
        />
        <div
          className="pointer-events-auto absolute touch-none border-2 border-white"
          style={{ left: winLeft, top: winTop, width: winW, height: winH, cursor: 'move', boxShadow: '0 0 0 1px rgba(0,0,0,.5)' }}
          onPointerDown={onDown('move')}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(to right, transparent 33.2%, rgba(255,255,255,.45) 33.3%, transparent 33.5%, transparent 66.5%, rgba(255,255,255,.45) 66.6%, transparent 66.8%), linear-gradient(to bottom, transparent 33.2%, rgba(255,255,255,.45) 33.3%, transparent 33.5%, transparent 66.5%, rgba(255,255,255,.45) 66.6%, transparent 66.8%)' }} />
          {(['tl', 'tr', 'bl', 'br', 'l', 'r', 't', 'b'] as Handle[]).map((h) => (
            <span
              key={h}
              aria-label={`Crop handle ${h}`}
              onPointerDown={onDown(h)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              className="touch-none rounded-[3px] border border-black/40 bg-white"
              style={handleStyle(h)}
            />
          ))}
        </div>
      </div>
    </>
  )
}
