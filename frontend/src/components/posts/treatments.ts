import * as fabric from 'fabric'

type Filter = InstanceType<(typeof fabric.filters)[keyof typeof fabric.filters]>

/** 5x4 fabric ColorMatrix (offsets in 0..1) for: saturation blend toward luminance, then contrast
 * pivoting on `mean` (0..255), then a final RGB scale. Mirrors backend image_processing's
 * ImageEnhance.Color/Contrast math (BT.601 luma weights). */
function matrix(saturation: number, contrast: number, mean: number, scale: number) {
  const lw = [0.299, 0.587, 0.114]
  const rows: number[] = []
  for (let i = 0; i < 3; i++) {
    const row = lw.map((w) => (1 - saturation) * w * contrast * scale)
    row[i] += saturation * contrast * scale
    rows.push(...row, 0, (mean * (1 - contrast) * scale) / 255)
  }
  rows.push(0, 0, 0, 1, 0)
  return rows
}

const cm = (m: number[]) => new fabric.filters.ColorMatrix({ matrix: m as never, colorsOnly: true })

/** Instant, client-side equivalents of the server's darkened_background / transparency_overlay.
 * Darkened keeps two passes (the contrast clip happens before the brightness drop, like Pillow). */
export function treatmentFilters(renderer: string, mean: number): Filter[] {
  if (renderer === 'darkened_background') {
    return [cm(matrix(0.5, 1.15, mean, 1)), cm(matrix(1, 1, 0, 0.55))]
  }
  if (renderer === 'transparency_overlay') {
    return [cm(matrix(0.35, 1, 0, 0.45))] // 45% opacity over solid black == RGB * 0.45
  }
  return []
}
