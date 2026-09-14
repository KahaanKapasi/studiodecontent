export const CANVAS_SIZE = 1080
export const CANVAS_PREVIEW_SIZE = 480

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
