import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as fabric from 'fabric'
import { postsApi } from '../../api/client'
import { CANVAS_PREVIEW_SIZE, CANVAS_SIZE, TEMPLATES } from './templates'

interface CarouselCanvasProps {
  templateId: number
  imageFile: File | null
  text: string
  fontSize: number
  textX: number
  textY: number
  onRender: (dataUrl: string) => void
}

export interface CarouselCanvasHandle {
  exportFullResolution: () => string | null
}

const TEXT_BOX_WIDTH = CANVAS_PREVIEW_SIZE - 80

const CarouselCanvas = forwardRef<CarouselCanvasHandle, CarouselCanvasProps>(
  ({ templateId, imageFile, text, fontSize, textX, textY, onRender }, ref) => {
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

    useImperativeHandle(ref, () => ({
      exportFullResolution: () => {
        const canvas = fabricRef.current
        if (!canvas) return null
        return canvas.toDataURL({
          format: 'jpeg',
          quality: 0.92,
          multiplier: CANVAS_SIZE / CANVAS_PREVIEW_SIZE,
        })
      },
    }))

    useEffect(() => {
      if (!canvasElRef.current) return
      const canvas = new fabric.Canvas(canvasElRef.current, {
        width: CANVAS_PREVIEW_SIZE,
        height: CANVAS_PREVIEW_SIZE,
        backgroundColor: '#000000',
        selection: false,
      })
      fabricRef.current = canvas

      const textObj = new fabric.Textbox(text, {
        left: textX,
        top: textY,
        width: TEXT_BOX_WIDTH,
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
        left: CANVAS_PREVIEW_SIZE - 16,
        top: CANVAS_PREVIEW_SIZE - 28,
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
      // canvas is initialized once; prop-driven updates happen in the effects below
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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
        .renderBackground(template.rendererName, imageFile)
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
              scaleX: (retina * CANVAS_PREVIEW_SIZE) / (img.width ?? CANVAS_SIZE),
              scaleY: (retina * CANVAS_PREVIEW_SIZE) / (img.height ?? CANVAS_SIZE),
              selectable: false,
              evented: false,
            })
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
    }, [imageFile, templateId])

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
