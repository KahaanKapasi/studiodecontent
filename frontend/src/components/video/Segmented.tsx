interface Option<T extends string | number> {
  value: T
  label: string
  disabled?: boolean
}

interface SegmentedProps<T extends string | number> {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  /** 'tabs' = top-level view switcher, 'radio' = a single-choice setting (default). */
  kind?: 'radio' | 'tabs'
  /** 'joined' = one pill container (Posts-style); 'chips' = separate wrapping chips. */
  layout?: 'joined' | 'chips'
  fullWidth?: boolean
}

export default function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  kind = 'radio',
  layout = 'joined',
  fullWidth = false,
}: SegmentedProps<T>) {
  const tabs = kind === 'tabs'
  const joined = layout === 'joined'
  const wrap = joined
    ? `gap-1 rounded-lg border border-line bg-surface p-1 ${fullWidth ? 'flex' : 'inline-flex'}`
    : 'flex flex-wrap gap-2'

  return (
    <div role={tabs ? 'tablist' : 'radiogroup'} aria-label={ariaLabel} className={wrap}>
      {options.map((opt) => {
        const active = opt.value === value
        const shape = joined ? 'rounded-md' : 'rounded-full border'
        const state = active
          ? joined
            ? 'bg-accent text-accent-fg'
            : 'border-accent bg-accent text-accent-fg'
          : joined
            ? 'text-muted hover:bg-surface-2 hover:text-ink'
            : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
        return (
          <button
            key={String(opt.value)}
            type="button"
            role={tabs ? 'tab' : 'radio'}
            aria-selected={tabs ? active : undefined}
            aria-checked={tabs ? undefined : active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`min-h-10 px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${shape} ${state} ${
              fullWidth ? 'flex-1' : ''
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
