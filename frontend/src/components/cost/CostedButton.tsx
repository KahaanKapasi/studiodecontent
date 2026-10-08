import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { CostHintView } from './CostHint'
import { confirmLabel, needsConfirm } from './format'
import { useCostEstimate } from './useCostEstimate'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  action: string
  params?: Record<string, unknown>
  onClick: () => void
  children: ReactNode
  /** Classes for the wrapper around button + hint. */
  wrapperClassName?: string
}

/**
 * A primary action button with its cost hint beside it. When the estimate is expensive
 * (high >= $1, or unknown-priced and high >= $0.25) the first click arms an inline
 * "This may cost $A–B — confirm" state and only the second click runs `onClick`.
 */
export default function CostedButton({
  action,
  params,
  onClick,
  children,
  wrapperClassName = 'inline-flex flex-wrap items-center gap-2',
  className = '',
  disabled,
  ...rest
}: Props) {
  const { estimate } = useCostEstimate(action, params)
  // Armed for one specific estimate: editing the form changes the range and so disarms it.
  const signature = estimate ? `${estimate.low_usd}-${estimate.high_usd}` : ''
  const [armedFor, setArmedFor] = useState<string | null>(null)
  const confirmNeeded = needsConfirm(estimate)
  const isArmed = confirmNeeded && armedFor === signature

  // Walk-away safety: an armed button disarms itself after a few seconds.
  useEffect(() => {
    if (armedFor === null) return
    const t = setTimeout(() => setArmedFor(null), 8000)
    return () => clearTimeout(t)
  }, [armedFor])

  function handleClick() {
    if (confirmNeeded && !isArmed) {
      setArmedFor(signature)
      return
    }
    setArmedFor(null)
    onClick()
  }

  return (
    <span className={wrapperClassName}>
      <button
        type="button"
        {...rest}
        disabled={disabled}
        onClick={handleClick}
        className={className}
      >
        {isArmed && estimate ? confirmLabel(estimate) : children}
      </button>
      {isArmed && (
        <button
          type="button"
          onClick={() => setArmedFor(null)}
          className="min-h-10 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-ink hover:bg-surface-2"
        >
          Cancel
        </button>
      )}
      {estimate && !isArmed && <CostHintView estimate={estimate} />}
    </span>
  )
}
