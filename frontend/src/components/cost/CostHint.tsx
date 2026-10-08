import { useEffect, useRef, useState } from 'react'
import type { CostEstimate } from '../../types'
import { formatQty, hintLabel, usd } from './format'
import { useCostEstimate } from './useCostEstimate'

/** Quiet cost label with a tap/hover popover (breakdown, confidence, price verified dates). */
export function CostHintView({ estimate, className = '' }: { estimate: CostEstimate; className?: string }) {
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const root = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  function show(next: boolean) {
    if (next && root.current) {
      setAlignRight(root.current.getBoundingClientRect().left > window.innerWidth / 2)
    }
    setOpen(next)
  }

  const tone = estimate.confidence === 'unknown' && !estimate.free ? 'text-danger' : 'text-faint'

  return (
    <span
      ref={root}
      className={`relative inline-flex ${className}`}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Cost: ${hintLabel(estimate)}. Show breakdown`}
        onClick={() => show(!open)}
        className={`min-h-8 rounded px-1 text-xs underline decoration-dotted underline-offset-2 hover:text-ink ${tone}`}
      >
        {hintLabel(estimate)}
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute top-full z-30 mt-1 block w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-3 text-left text-xs text-muted shadow-lg ${
            alignRight ? 'right-0' : 'left-0'
          }`}
        >
          <span className="mb-1 block font-semibold text-ink">
            {estimate.free ? 'Free' : `Estimated cost · ${estimate.confidence} prices`}
          </span>
          {estimate.breakdown.length > 0 && (
            <span className="block space-y-1">
              {estimate.breakdown.map((r, i) => (
                <span key={i} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    {r.item}
                    <span className="block text-faint">{formatQty(r.qty_high, r.unit)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-ink">
                    {r.low_usd === r.high_usd ? usd(r.high_usd) : `${usd(r.low_usd)}–${usd(r.high_usd).replace('$', '')}`}
                  </span>
                </span>
              ))}
            </span>
          )}
          {estimate.notes.map((n, i) => (
            <span key={i} className="mt-1.5 block">
              {n}
            </span>
          ))}
          {estimate.prices_verified_on && (
            <span className="mt-1.5 block text-faint">
              Prices verified {estimate.prices_verified_on}. An estimate, not a bill.
            </span>
          )}
        </span>
      )}
    </span>
  )
}

export default function CostHint({
  action,
  params,
  className,
}: {
  action: string
  params?: Record<string, unknown>
  className?: string
}) {
  const { estimate } = useCostEstimate(action, params)
  if (!estimate) return null
  return <CostHintView estimate={estimate} className={className} />
}
