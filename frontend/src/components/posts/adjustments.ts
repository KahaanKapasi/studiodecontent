import * as fabric from 'fabric'

export interface Adjustments {
  exposure: number // -1..1 → fabric Brightness
  contrast: number // -1..1 → fabric Contrast
  saturation: number // -1..1 → fabric Saturation
  vibrance: number // -1..1 → fabric Vibrance (boosts muted colors more than already-saturated ones)
  temperature: number // -1..1, cool→warm → approximated via per-channel Gamma
  sharpen: number // 0..1 → fabric Convolute with a sharpen kernel scaled by this
  grayscale: boolean
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  sharpen: 0,
  grayscale: false,
}

export function isDefaultAdjustments(a: Adjustments): boolean {
  return JSON.stringify(a) === JSON.stringify(DEFAULT_ADJUSTMENTS)
}

/** Builds the fabric filter pipeline for the current slider values. Order
 * matters for how the effects stack — tonal adjustments first, color last,
 * sharpen/grayscale as a finishing pass. */
export function buildFilterPipeline(adj: Adjustments) {
  const filters: InstanceType<(typeof fabric.filters)[keyof typeof fabric.filters]>[] = []

  if (adj.exposure !== 0) filters.push(new fabric.filters.Brightness({ brightness: adj.exposure }))
  if (adj.contrast !== 0) filters.push(new fabric.filters.Contrast({ contrast: adj.contrast }))
  if (adj.temperature !== 0) {
    const t = adj.temperature * 0.3
    filters.push(new fabric.filters.Gamma({ gamma: [1 + t, 1, 1 - t] }))
  }
  if (adj.saturation !== 0) filters.push(new fabric.filters.Saturation({ saturation: adj.saturation }))
  if (adj.vibrance !== 0) filters.push(new fabric.filters.Vibrance({ vibrance: adj.vibrance }))
  if (adj.sharpen > 0) {
    const s = adj.sharpen
    filters.push(new fabric.filters.Convolute({ matrix: [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0] }))
  }
  if (adj.grayscale) filters.push(new fabric.filters.Grayscale())

  return filters
}
