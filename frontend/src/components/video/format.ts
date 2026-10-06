import type { GenerationStatus, VideoGeneration, VideoModelInfo } from '../../types'

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return `$${value.toFixed(3)}`
  return `$${value.toFixed(2)}`
}

/** price_per_second_usd[resolution] × duration, or null when the catalog has no price. */
export function estimateCost(
  model: VideoModelInfo | undefined,
  resolution: string,
  durationSeconds: number,
): number | null {
  const pps = model?.price_per_second_usd?.[resolution]
  if (typeof pps !== 'number') return null
  return Math.round(pps * durationSeconds * 100) / 100
}

/** "9:16" -> 9/16. Falls back to 16/9 for anything unparseable. */
export function ratioValue(ratio: string): number {
  const [w, h] = ratio.split(':').map(Number)
  return w > 0 && h > 0 ? w / h : 16 / 9
}

/** The backend may send naive UTC timestamps (SQLite); treat those as UTC. */
export function parseServerDate(iso: string): number {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso)
  const t = Date.parse(hasZone ? iso : `${iso}Z`)
  return Number.isNaN(t) ? Date.now() : t
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

export function formatWhen(iso: string): string {
  return new Date(parseServerDate(iso)).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export const PROMPT_FROM_SCRIPT_MAX = 1500

export function isPendingStatus(s: GenerationStatus) {
  return s === 'queued' || s === 'running'
}

export function isPending(g: Pick<VideoGeneration, 'status'>) {
  return isPendingStatus(g.status)
}
