// Must match backend/app/services/image_processing.py's ASPECT_RATIOS exactly —
// kept as a small static mirror here (rather than fetched from
// GET /api/posts/aspect-ratios) since these 5 shapes essentially never change
// and hardcoding avoids a loading state before the editor can render at all.
export interface AspectRatioOption {
  id: string
  label: string
  width: number
  height: number
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { id: '1:1', label: '1:1', width: 1080, height: 1080 },
  { id: '4:5', label: '4:5', width: 1080, height: 1350 },
  { id: '3:4', label: '3:4', width: 1080, height: 1440 },
  { id: '9:16', label: '9:16', width: 1080, height: 1920 },
  { id: '16:9', label: '16:9', width: 1920, height: 1080 },
]

export const DEFAULT_ASPECT_RATIO = '1:1'

export function getAspectRatio(id: string): AspectRatioOption {
  return ASPECT_RATIOS.find((a) => a.id === id) ?? ASPECT_RATIOS[0]
}

const PREVIEW_MAX_WIDTH = 420
const PREVIEW_MAX_HEIGHT = 560

/** Fits the native canvas size into a bounding box (like object-fit: contain)
 * so the editor's on-screen canvas stays a sensible size across very
 * different shapes (a 9:16 story and a 16:9 landscape both need to fit the
 * same editor column). */
export function computePreviewSize(nativeWidth: number, nativeHeight: number) {
  const scale = Math.min(PREVIEW_MAX_WIDTH / nativeWidth, PREVIEW_MAX_HEIGHT / nativeHeight)
  return { width: Math.round(nativeWidth * scale), height: Math.round(nativeHeight * scale) }
}

export interface PostTemplate {
  id: number
  name: string
  description: string
  rendererName: string
  textColor: string
  showWatermark: boolean
}

// rendererName must match the keys in backend/app/services/image_processing.py's
// _TREATMENTS dict, and the seeded Template rows' layout_config.renderer field.
export const TEMPLATES: PostTemplate[] = [
  {
    id: 1,
    name: 'Darkened background',
    description: 'Foreground preserved, background darkened, signature font overlay, corner watermark',
    rendererName: 'darkened_background',
    textColor: '#ffffff',
    showWatermark: true,
  },
  {
    id: 2,
    name: 'Transparency overlay',
    description: 'Image at ~45% opacity, reduced saturation, centered text overlay',
    rendererName: 'transparency_overlay',
    textColor: '#ffffff',
    showWatermark: false,
  },
  {
    id: 3,
    name: 'Background-removed',
    description: 'Subject cut out onto solid black background, text + watermark added',
    rendererName: 'background_removed',
    textColor: '#ffffff',
    showWatermark: true,
  },
]
