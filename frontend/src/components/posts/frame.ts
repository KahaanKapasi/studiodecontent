import type * as fabric from 'fabric'

export interface Frame {
  zoom: number // 1..3 — how far into the (already cover-cropped) background we punch in
  panX: number // -1..1
  panY: number // -1..1
}

export const DEFAULT_FRAME: Frame = { zoom: 1, panX: 0, panY: 0 }

export function isDefaultFrame(f: Frame): boolean {
  return f.zoom === DEFAULT_FRAME.zoom && f.panX === DEFAULT_FRAME.panX && f.panY === DEFAULT_FRAME.panY
}

/** Crops the source image to the framed region and stretches it back over the
 * whole canvas using fabric's own cropX/cropY. fabric v6 objects default to
 * originX/originY = 'center', so the origin must be set to top-left explicitly
 * or left/top = 0 would put the image's *centre* in the canvas corner. */
export function applyFrame(
  img: fabric.FabricImage,
  frame: Frame,
  previewWidth: number,
  previewHeight: number,
) {
  // After applyFilters() the element is a full-size canvas (no naturalWidth), so
  // never fall back to img.width — that is the already-cropped width.
  const { width: srcW, height: srcH } = img.getOriginalSize()
  const zoom = Math.max(1, frame.zoom)
  const cropW = srcW / zoom
  const cropH = srcH / zoom
  img.set({
    cropX: ((srcW - cropW) * (frame.panX + 1)) / 2,
    cropY: ((srcH - cropH) * (frame.panY + 1)) / 2,
    width: cropW,
    height: cropH,
    originX: 'left',
    originY: 'top',
    left: 0,
    top: 0,
    scaleX: previewWidth / cropW,
    scaleY: previewHeight / cropH,
  })
}
