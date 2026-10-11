import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as fabric from 'fabric'
import { buildFilterPipeline, type Adjustments } from './adjustments'
import { applyFrame, type Frame } from './frame'
import { composeCutout, coverCanvas, getCutout, getReadyCutout, loadBitmap, meanLuma, prepareImage } from './imageSource'
import { computePreviewSize, getAspectRatio, TEMPLATES } from './templates'
import { treatmentFilters } from './treatments'

interface CarouselCanvasProps {
  templateId: number
  aspectRatio: string
  imageFile: File | null
  text: string
  fontSize: number
  textX: number
  textY: number
  adjustments: Adjustments
  frame: Frame
  onRender: (dataUrl: string) => void
  /** A file arrived via drop / "Add image" — the page decides: background (none yet) or layer. */
  onImageFile: (file: File) => void
}

export interface CarouselCanvasHandle {
  exportFullResolution: () => string | null
  addImageLayer: (file: File) => Promise<void>
}

interface LayerInfo {
  id: number
  label: string
  kind: 'text' | 'image'
  primary: boolean
  selected: boolean
}

type HistoryEntry =
  | { kind: 'add'; obj: fabric.FabricObject }
  | { kind: 'remove'; obj: fabric.FabricObject; index: number }
  | { kind: 'modify'; obj: fabric.FabricObject; before: Record<string, unknown>; after: Record<string, unknown> }

const TRANSFORM_KEYS = ['left', 'top', 'scaleX', 'scaleY', 'angle', 'flipX', 'flipY', 'skewX', 'skewY'] as const
const PASTE_OFFSET = 24

function snapshot(obj: fabric.FabricObject): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of TRANSFORM_KEYS) out[k] = (obj as unknown as Record<string, unknown>)[k]
  return out
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

const CarouselCanvas = forwardRef<CarouselCanvasHandle, CarouselCanvasProps>(
  (
    { templateId, aspectRatio, imageFile, text, fontSize, textX, textY, adjustments, frame, onRender, onImageFile },
    ref,
  ) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const fabricRef = useRef<fabric.Canvas | null>(null)
    const bgImageRef = useRef<fabric.FabricImage | null>(null)
    const treatmentRef = useRef<ReturnType<typeof treatmentFilters>>([])
    const textObjRef = useRef<fabric.Textbox | null>(null)
    const watermarkRef = useRef<fabric.IText | null>(null)
    const onRenderRef = useRef(onRender)
    onRenderRef.current = onRender
    const frameRef = useRef(frame)
    frameRef.current = frame
    const adjustmentsRef = useRef(adjustments)
    adjustmentsRef.current = adjustments
    const renderTimer = useRef<number | undefined>(undefined)

    // Editing bookkeeping (objects that are NOT user layers are in `internal`).
    const internal = useRef(new WeakSet<fabric.FabricObject>())
    const clipboard = useRef<fabric.FabricObject | null>(null)
    const undoStack = useRef<HistoryEntry[]>([])
    const redoStack = useRef<HistoryEntry[]>([])
    const replaying = useRef(false)
    const beforeTransform = useRef(new WeakMap<fabric.FabricObject, Record<string, unknown>>())
    const layerIds = useRef(new WeakMap<fabric.FabricObject, number>())
    const nextLayerId = useRef(1)
    const removedIndex = useRef(new WeakMap<fabric.FabricObject, number>())
    const imageCounter = useRef(0)
    const imageNames = useRef(new WeakMap<fabric.FabricObject, string>())

    const [status, setStatus] = useState<'idle' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState('')
    const [cutoutStartedAt, setCutoutStartedAt] = useState<number | null>(null)
    const [elapsed, setElapsed] = useState(0)
    const [layers, setLayers] = useState<LayerInfo[]>([])
    const [dragActive, setDragActive] = useState(false)

    const native = getAspectRatio(aspectRatio)
    const preview = computePreviewSize(native.width, native.height)

    const emitRender = useCallback(() => {
      window.clearTimeout(renderTimer.current)
      renderTimer.current = window.setTimeout(() => {
        const canvas = fabricRef.current
        if (canvas) onRenderRef.current(canvas.toDataURL({ format: 'png', multiplier: 1 }))
      }, 30)
    }, [])

    const refreshLayers = useCallback(() => {
      const canvas = fabricRef.current
      if (!canvas) return
      const active = canvas.getActiveObject()
      const list: LayerInfo[] = []
      for (const obj of canvas.getObjects()) {
        if (internal.current.has(obj) && obj !== textObjRef.current) continue
        let id = layerIds.current.get(obj)
        if (!id) {
          id = nextLayerId.current++
          layerIds.current.set(obj, id)
        }
        const isText = obj instanceof fabric.Textbox
        if (!isText && !imageNames.current.has(obj)) imageNames.current.set(obj, `Image ${++imageCounter.current}`)
        list.push({
          id,
          kind: isText ? 'text' : 'image',
          label: isText ? `Text: ${(obj as fabric.Textbox).text.slice(0, 22) || '(empty)'}` : imageNames.current.get(obj)!,
          primary: obj === textObjRef.current,
          selected: obj === active,
        })
      }
      setLayers(list.reverse()) // top-most first
    }, [])

    const findObject = useCallback((id: number) => {
      return fabricRef.current?.getObjects().find((o) => layerIds.current.get(o) === id)
    }, [])

    useImperativeHandle(ref, () => ({
      exportFullResolution: () => {
        const canvas = fabricRef.current
        if (!canvas) return null
        canvas.discardActiveObject()
        canvas.renderAll()
        return canvas.toDataURL({
          format: 'jpeg',
          quality: 0.92,
          multiplier: native.width / preview.width,
        })
      },
      addImageLayer,
    }))

    async function addImageLayer(file: File) {
      const canvas = fabricRef.current
      if (!canvas) return
      const prepared = await prepareImage(file)
      const bmp = await loadBitmap(prepared)
      // Draw into a canvas element: fabric can clone/serialise it and no object URL needs to stay alive.
      const el = document.createElement('canvas')
      el.width = bmp.width
      el.height = bmp.height
      el.getContext('2d')!.drawImage(bmp, 0, 0)
      const img = new fabric.FabricImage(el, { originX: 'left', originY: 'top' })
      const scale = Math.min(1, (preview.width * 0.6) / el.width, (preview.height * 0.8) / el.height)
      img.set({
        scaleX: scale,
        scaleY: scale,
        left: (preview.width - el.width * scale) / 2,
        top: (preview.height - el.height * scale) / 2,
      })
      img.setCoords()
      canvas.add(img)
      canvas.setActiveObject(img)
      canvas.requestRenderAll()
      refreshLayers()
    }

    async function duplicate(obj: fabric.FabricObject): Promise<fabric.FabricObject> {
      if (obj instanceof fabric.FabricImage) {
        // Share the decoded element instead of round-tripping a 2048 px image through a data URL.
        const copy = new fabric.FabricImage(obj.getElement() as HTMLCanvasElement)
        copy.set({ ...snapshot(obj), originX: obj.originX, originY: obj.originY, opacity: obj.opacity })
        return copy
      }
      return obj.clone()
    }

    async function pasteInternal() {
      const canvas = fabricRef.current
      const src = clipboard.current
      if (!canvas || !src) return
      const copy = await duplicate(src)
      copy.set({ left: (src.left ?? 0) + PASTE_OFFSET, top: (src.top ?? 0) + PASTE_OFFSET })
      copy.setCoords()
      clipboard.current = copy // consecutive pastes keep stepping diagonally
      if (src instanceof fabric.FabricImage) {
        const name = imageNames.current.get(src)
        if (name) imageNames.current.set(copy, `${name} copy`)
      }
      canvas.add(copy)
      canvas.setActiveObject(copy)
      canvas.requestRenderAll()
      refreshLayers()
    }

    function removeObject(obj: fabric.FabricObject) {
      const canvas = fabricRef.current
      if (!canvas || obj === textObjRef.current || internal.current.has(obj)) return
      removedIndex.current.set(obj, canvas.getObjects().indexOf(obj))
      canvas.discardActiveObject()
      canvas.remove(obj)
      canvas.requestRenderAll()
      refreshLayers()
    }

    function applyHistory(entry: HistoryEntry, direction: 'undo' | 'redo') {
      const canvas = fabricRef.current
      if (!canvas) return
      replaying.current = true
      try {
        const add = (entry.kind === 'add') === (direction === 'redo') // does this step (re)insert the object?
        if (entry.kind === 'modify') {
          entry.obj.set(direction === 'undo' ? entry.before : entry.after)
          entry.obj.setCoords()
        } else if (add) {
          if (entry.kind === 'remove') canvas.insertAt(entry.index, entry.obj)
          else canvas.add(entry.obj)
        } else {
          canvas.discardActiveObject()
          canvas.remove(entry.obj)
        }
      } finally {
        replaying.current = false
      }
      canvas.requestRenderAll()
      refreshLayers()
      emitRender()
    }

    function undo(redo = false) {
      const from = redo ? redoStack.current : undoStack.current
      const to = redo ? undoStack.current : redoStack.current
      const entry = from.pop()
      if (!entry) return
      to.push(entry)
      applyHistory(entry, redo ? 'redo' : 'undo')
    }

    // Canvas is initialized once; dimensions/objects update via setDimensions +
    // the effects below rather than tearing down and rebuilding fabric.Canvas.
    useEffect(() => {
      if (!canvasElRef.current) return
      const canvas = new fabric.Canvas(canvasElRef.current, {
        width: preview.width,
        height: preview.height,
        backgroundColor: '#000000',
        selection: false,
      })
      fabricRef.current = canvas

      const textObj = new fabric.Textbox(text, {
        left: textX,
        top: textY,
        width: preview.width - 80,
        fontSize,
        fill: '#ffffff',
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        textAlign: 'center',
        originX: 'center',
      })
      textObjRef.current = textObj
      canvas.add(textObj)

      const watermark = new fabric.IText('@madridonomy', {
        left: preview.width - 16,
        top: preview.height - 28,
        fontSize: 14,
        fill: 'rgba(255,255,255,0.6)',
        originX: 'right',
        selectable: false,
        evented: false,
      })
      watermarkRef.current = watermark
      internal.current.add(watermark)
      canvas.add(watermark)

      // Preview refresh + history are driven by canvas events from here on.
      canvas.on('object:added', ({ target }) => {
        if (internal.current.has(target) || target === textObj) return
        if (!replaying.current) {
          undoStack.current.push({ kind: 'add', obj: target })
          redoStack.current = []
        }
        refreshLayers()
        emitRender()
      })
      canvas.on('object:removed', ({ target }) => {
        if (internal.current.has(target) || target === textObj) return
        if (!replaying.current) {
          undoStack.current.push({
            kind: 'remove',
            obj: target,
            index: removedIndex.current.get(target) ?? canvas.getObjects().length,
          })
          redoStack.current = []
        }
        refreshLayers()
        emitRender()
      })
      canvas.on('mouse:down', ({ target }) => {
        if (target) beforeTransform.current.set(target, snapshot(target))
      })
      canvas.on('object:modified', ({ target }) => {
        const before = beforeTransform.current.get(target)
        if (before && !replaying.current && !internal.current.has(target)) {
          undoStack.current.push({ kind: 'modify', obj: target, before, after: snapshot(target) })
          redoStack.current = []
        }
        emitRender()
      })
      canvas.on('text:changed', emitRender)
      const onSel = () => refreshLayers()
      canvas.on('selection:created', onSel)
      canvas.on('selection:updated', onSel)
      canvas.on('selection:cleared', onSel)

      canvas.requestRenderAll()
      refreshLayers()
      onRenderRef.current(canvas.toDataURL({ format: 'png', multiplier: 1 }))

      return () => {
        window.clearTimeout(renderTimer.current)
        canvas.dispose()
        fabricRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Keyboard: copy / paste-duplicate / delete / undo / redo for canvas objects.
    useEffect(() => {
      function onKeyDown(e: KeyboardEvent) {
        const canvas = fabricRef.current
        if (!canvas || isTypingTarget(e.target)) return
        const active = canvas.getActiveObject()
        if (active && (active as fabric.IText).isEditing) return
        const mod = e.metaKey || e.ctrlKey
        const key = e.key.toLowerCase()
        if ((key === 'delete' || key === 'backspace') && active) {
          if (active === textObjRef.current) return
          e.preventDefault()
          removeObject(active)
        } else if (mod && key === 'c' && active && !internal.current.has(active)) {
          clipboard.current = active
        } else if (mod && key === 'z') {
          e.preventDefault()
          undo(e.shiftKey)
        } else if (mod && key === 'y') {
          e.preventDefault()
          undo(true)
        }
      }
      function onPaste(e: ClipboardEvent) {
        if (isTypingTarget(e.target)) return
        const cd = e.clipboardData
        // System-clipboard images are handled by the page (background vs layer).
        if (cd && [...cd.items].some((it) => it.kind === 'file' && it.type.startsWith('image/'))) return
        if (clipboard.current) {
          e.preventDefault()
          void pasteInternal()
        }
      }
      document.addEventListener('keydown', onKeyDown)
      document.addEventListener('paste', onPaste)
      return () => {
        document.removeEventListener('keydown', onKeyDown)
        document.removeEventListener('paste', onPaste)
      }
      // handlers only touch refs and stable callbacks
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Elapsed-seconds ticker for the first (cold) cutout request.
    useEffect(() => {
      if (cutoutStartedAt === null) return
      setElapsed(0)
      const t = window.setInterval(() => setElapsed(Math.round((Date.now() - cutoutStartedAt) / 1000)), 500)
      return () => window.clearInterval(t)
    }, [cutoutStartedAt])

    // Aspect ratio changed: resize the live canvas and reposition the fixed
    // objects (watermark corner, text box width) for the new shape. Absolute
    // text X/Y are owned by the parent and reset there when shape changes.
    useEffect(() => {
      const canvas = fabricRef.current
      const textObj = textObjRef.current
      const watermark = watermarkRef.current
      if (!canvas || !textObj || !watermark) return
      canvas.setDimensions({ width: preview.width, height: preview.height })
      textObj.set({ width: preview.width - 80 })
      watermark.set({ left: preview.width - 16, top: preview.height - 28 })
      canvas.requestRenderAll()
      emitRender()
      // preview is derived from aspectRatio; re-running on aspectRatio alone is sufficient
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aspectRatio])

    useEffect(() => {
      const canvas = fabricRef.current
      const textObj = textObjRef.current
      if (!canvas || !textObj) return
      const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0]
      textObj.set({ fill: template.textColor, text, fontSize, left: textX, top: textY })
      watermarkRef.current?.set({ visible: template.showWatermark })
      canvas.requestRenderAll()
      refreshLayers()
      emitRender()
    }, [text, fontSize, textX, textY, templateId, emitRender, refreshLayers])

    // Background = cover-cropped source, treated in the browser: darkened / transparency are fabric
    // ColorMatrix filters (no network), background_removed lays a server cutout (fetched ONCE per
    // File) over black. Switching template or aspect never leaves the browser after the first cutout.
    useEffect(() => {
      const canvas = fabricRef.current
      if (!canvas) return

      if (!imageFile) {
        if (bgImageRef.current) {
          canvas.remove(bgImageRef.current)
          bgImageRef.current = null
          canvas.requestRenderAll()
          emitRender()
        }
        return
      }

      const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0]
      let cancelled = false
      setStatus('idle')
      setErrorMessage('')

      function install(base: HTMLCanvasElement, treatment: ReturnType<typeof treatmentFilters>) {
        if (cancelled || !canvas) return
        const img = new fabric.FabricImage(base)
        internal.current.add(img)
        img.set({ selectable: false, evented: false })
        applyFrame(img, frameRef.current, preview.width, preview.height)
        treatmentRef.current = treatment
        img.filters = [...treatment, ...buildFilterPipeline(adjustmentsRef.current)]
        img.applyFilters()
        if (bgImageRef.current) canvas.remove(bgImageRef.current)
        bgImageRef.current = img
        canvas.insertAt(0, img)
        canvas.requestRenderAll()
        emitRender()
      }

      ;(async () => {
        const src = await loadBitmap(imageFile)
        if (cancelled) return
        const cover = coverCanvas(src, native.width, native.height)
        const mean = meanLuma(cover)

        if (template.rendererName !== 'background_removed') {
          install(cover, treatmentFilters(template.rendererName, mean))
          return
        }
        const ready = getReadyCutout(imageFile)
        if (ready) {
          install(composeCutout(ready, native.width, native.height), [])
          return
        }
        // Cold: show the darkened photo as a stand-in while the subject is cut out.
        install(cover, treatmentFilters('darkened_background', mean))
        setCutoutStartedAt(Date.now())
        const cutout = await getCutout(imageFile)
        if (cancelled) return
        install(composeCutout(cutout, native.width, native.height), [])
        setCutoutStartedAt(null)
      })().catch((err: Error) => {
        if (cancelled) return
        setCutoutStartedAt(null)
        setStatus('error')
        setErrorMessage(err.message)
      })

      return () => {
        cancelled = true
        setCutoutStartedAt(null)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageFile, templateId, aspectRatio])

    // Crop & frame (zoom/pan) — re-crops the loaded background without refetching.
    useEffect(() => {
      const canvas = fabricRef.current
      const img = bgImageRef.current
      if (!canvas || !img) return
      applyFrame(img, frame, preview.width, preview.height)
      img.setCoords()
      canvas.requestRenderAll()
      emitRender()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frame])

    // Lightroom-style adjustments — background only (layers are separate objects), stacked after
    // the template treatment, without rebuilding the base.
    useEffect(() => {
      const canvas = fabricRef.current
      const img = bgImageRef.current
      if (!canvas || !img) return
      img.filters = [...treatmentRef.current, ...buildFilterPipeline(adjustments)]
      img.applyFilters()
      canvas.requestRenderAll()
      emitRender()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adjustments])

    function reorder(id: number, direction: 'forward' | 'back') {
      const canvas = fabricRef.current
      const obj = findObject(id)
      if (!canvas || !obj) return
      const objects = canvas.getObjects()
      const idx = objects.indexOf(obj)
      const floor = bgImageRef.current ? 1 : 0
      if (direction === 'back' && idx <= floor) return
      if (direction === 'forward' && idx >= objects.length - 1) return
      if (direction === 'back') canvas.sendObjectBackwards(obj)
      else canvas.bringObjectForward(obj)
      canvas.requestRenderAll()
      refreshLayers()
      emitRender()
    }

    function onDrop(e: React.DragEvent) {
      e.preventDefault()
      setDragActive(false)
      const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
      if (file) onImageFile(file)
    }

    return (
      <div className="w-full max-w-[460px]">
        <div
          className={`relative mx-auto w-fit rounded-sm ${dragActive ? 'outline outline-2 outline-accent' : ''}`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault()
              setDragActive(true)
            }
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
        >
          <canvas ref={canvasElRef} />
          {cutoutStartedAt !== null && (
            <div
              role="status"
              className="absolute left-2 top-2 rounded-full bg-black/70 px-3 py-1 text-xs text-neutral-100"
            >
              Cutting out subject… {elapsed}s
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-xs text-red-300">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-faint">
          <span>Paste an image (⌘V) or drop it on the canvas</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-md border border-line-strong px-2.5 py-1 text-ink hover:bg-surface-2"
          >
            Add image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onImageFile(file)
              e.target.value = ''
            }}
          />
        </div>

        {layers.length > 0 && (
          <ul className="mt-3 space-y-1" aria-label="Layers">
            <li className="text-xs font-semibold uppercase tracking-wide text-faint">Layers</li>
            {layers.map((layer) => (
              <li
                key={layer.id}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                  layer.selected ? 'border-accent bg-surface-2 text-ink' : 'border-line text-muted'
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => {
                    const obj = findObject(layer.id)
                    if (obj && fabricRef.current) {
                      fabricRef.current.setActiveObject(obj)
                      fabricRef.current.requestRenderAll()
                      refreshLayers()
                    }
                  }}
                >
                  {layer.label}
                </button>
                <button type="button" title="Bring forward" aria-label="Bring forward" className="px-1 hover:text-ink" onClick={() => reorder(layer.id, 'forward')}>
                  ↑
                </button>
                <button type="button" title="Send back" aria-label="Send back" className="px-1 hover:text-ink" onClick={() => reorder(layer.id, 'back')}>
                  ↓
                </button>
                {!layer.primary && (
                  <button
                    type="button"
                    title="Delete layer"
                    aria-label="Delete layer"
                    className="px-1 hover:text-danger"
                    onClick={() => {
                      const obj = findObject(layer.id)
                      if (obj) removeObject(obj)
                    }}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  },
)

export default CarouselCanvas
