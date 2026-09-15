import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as fabric from 'fabric'
import { postsApi } from '../../api/client'
import { buildFilterPipeline, type Adjustments } from './adjustments'
import { computePreviewSize, getAspectRatio, TEMPLATES } from './templates'

interface CarouselCanvasProps {
  templateId: number
  aspectRatio: string
  imageFile: File | null
  text: string
  fontSize: number
  textX: number
  textY: number
  adjustments: Adjustments
  onRender: (dataUrl: string) => void
}

export interface CarouselCanvasHandle {
  exportFullResolution: () => string | null
}

const CarouselCanvas = forwardRef<CarouselCanvasHandle, CarouselCanvasProps>(
  ({ templateId, aspectRatio, imageFile, text, fontSize, textX, textY, adjustments, onRender }, ref) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null)
    const fabricRef = useRef<fabric.Canvas | null>(null)
    const bgImageRef = useRef<fabric.FabricImage | null>(null)
    const textObjRef = useRef<fabric.Textbox | null>(null)
    const watermarkRef = useRef<fabric.IText | null>(null)
    const onRenderRef = useRef(onRender)
    onRenderRef.current = onRender
    const objectUrlRef = useRef<string | null>(null)
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState('')

    const native = getAspectRatio(aspectRatio)
    const preview = computePreviewSize(native.width, native.height)

    useImperativeHandle(ref, () => ({
      exportFullResolution: () => {
        const canvas = fabricRef.current
        if (!canvas) return null
        return canvas.toDataURL({
          format: 'jpeg',
          quality: 0.92,
          multiplier: native.width / preview.width,
        })
      },
    }))

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
      canvas.add(watermark)

      canvas.requestRenderAll()
      onRenderRef.current(canvas.toDataURL({ format: 'png', multiplier: 1 }))

      return () => {
        canvas.dispose()
        fabricRef.current = null
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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
      onRenderRef.current(canvas.toDataURL({ format: 'png', multiplier: 1 }))
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
      onRenderRef.current(canvas.toDataURL({ format: 'png', multiplier: 1 }))
    }, [text, fontSize, textX, textY, templateId])

    // Real server-side treatment (Pillow darken/desaturate, or rembg subject
    // cutout for background_removed) — replaces any client-side filter
    // approximation, since fabric/CSS can't do true background removal.
    useEffect(() => {
      const canvas = fabricRef.current
      if (!canvas) return

      if (!imageFile) {
        if (bgImageRef.current) {
          canvas.remove(bgImageRef.current)
          bgImageRef.current = null
          canvas.requestRenderAll()
          onRenderRef.current(canvas.toDataURL({ format: 'png', multiplier: 1 }))
        }
        return
      }

      const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0]
      let cancelled = false
      setStatus('loading')
      setErrorMessage('')

      postsApi
        .renderBackground(template.rendererName, aspectRatio, imageFile)
        .then((objectUrl) => {
          if (cancelled) {
            URL.revokeObjectURL(objectUrl)
            return
          }
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = objectUrl

          return fabric.FabricImage.fromURL(objectUrl).then((img) => {
            if (cancelled) return
            if (bgImageRef.current) canvas.remove(bgImageRef.current)
            // Empirically, a FabricImage loaded from a freshly-created blob: URL
            // renders at half the intended size on a retina display unless the
            // canvas's retina multiplier is folded into the scale explicitly —
            // object-space math alone (scale relative to canvas.width/height)
            // is not enough here, even though fabric's docs say it should be.
            const retina = canvas.getRetinaScaling ? canvas.getRetinaScaling() : 1
            img.set({
              left: 0,
              top: 0,
              scaleX: (retina * preview.width) / (img.width ?? native.width),
              scaleY: (retina * preview.height) / (img.height ?? native.height),
              selectable: false,
              evented: false,
            })
            img.filters = buildFilterPipeline(adjustments)
            img.applyFilters()
            bgImageRef.current = img
            canvas.insertAt(0, img)
            canvas.requestRenderAll()
            setStatus('idle')
            onRenderRef.current(canvas.toDataURL({ format: 'png', multiplier: 1 }))
          })
        })
        .catch((err: Error) => {
          if (cancelled) return
          setStatus('error')
          setErrorMessage(err.message)
        })

      return () => {
        cancelled = true
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageFile, templateId, aspectRatio])

    // Lightroom-style adjustments — re-applies the fabric filter pipeline to
    // the already-loaded background image without re-fetching from the backend.
    useEffect(() => {
      const canvas = fabricRef.current
      const img = bgImageRef.current
      if (!canvas || !img) return
      img.filters = buildFilterPipeline(adjustments)
      img.applyFilters()
      canvas.requestRenderAll()
      onRenderRef.current(canvas.toDataURL({ format: 'png', multiplier: 1 }))
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adjustments])

    return (
      <div className="relative">
        <canvas ref={canvasElRef} />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-neutral-200">
            Rendering template…
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-xs text-red-300">
            {errorMessage}
          </div>
        )}
      </div>
    )
  },
)

export default CarouselCanvas
