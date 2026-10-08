import type { CostEstimate } from '../../types'

/** $0.002, $0.067, $1.20 — fine precision for tiny amounts, cents for the rest. */
export function usd(value: number): string {
  if (value <= 0) return '$0'
  if (value < 0.0005) return '<$0.001'
  if (value < 0.1) return `$${value.toFixed(3)}`
  return `$${value.toFixed(2)}`
}

/** "$0.002–0.004" (range) or "$0.80" when both ends round to the same figure. */
export function usdRange(low: number, high: number): string {
  const a = usd(low)
  const b = usd(high)
  if (a === b) return a
  return `${a}–${b.replace('$', '')}`
}

/** The short label shown next to a button. */
export function hintLabel(e: CostEstimate): string {
  if (e.free) return 'Free'
  if (e.confidence === 'unknown') return `Unknown — up to ~${usd(e.high_usd)}`
  return `≈ ${usdRange(e.low_usd, e.high_usd)}`
}

/** Uniform confirm rule: expensive, or unknown-priced and not trivial. */
export function needsConfirm(e: CostEstimate | undefined): boolean {
  if (!e || e.free) return false
  return e.high_usd >= 1 || (e.confidence === 'unknown' && e.high_usd >= 0.25)
}

export function confirmLabel(e: CostEstimate): string {
  return `This may cost ${usdRange(e.low_usd, e.high_usd)} — confirm`
}

/** Raw token quantities are stored in millions; show them as plain counts. */
export function formatQty(qty: number, unit: string): string {
  if (unit === '1M tokens') {
    const tokens = Math.round(qty * 1e6)
    return tokens >= 1000 ? `${(tokens / 1000).toFixed(tokens >= 10_000 ? 0 : 1)}k tokens` : `${tokens} tokens`
  }
  return `${Number.isInteger(qty) ? qty : qty.toFixed(1)} ${unit}`
}
