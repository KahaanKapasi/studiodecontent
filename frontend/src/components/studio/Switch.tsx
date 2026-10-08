export default function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-10 w-full items-start gap-3 rounded-md py-1 text-left disabled:opacity-50"
    >
      <span
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${
          checked ? 'bg-accent' : 'bg-line-strong'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform motion-reduce:transition-none ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs leading-relaxed text-faint">{hint}</span>}
      </span>
    </button>
  )
}
