import {
  useCallback,
  useId,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { editorStore } from './store'

/** Small shared primitives for the editor chrome. Buttons swallow mousedown so that clicking the
 * toolbar never steals focus from a text box that is being edited on the canvas. */

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  label: string
  active?: boolean
  children: ReactNode
  shortcut?: string
}
export function IconButton({ label, active, children, shortcut, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      {...rest}
      className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-1.5 text-[13px] text-ink transition-colors ${focusRing} ${
        active ? 'bg-accent/15 text-accent' : 'hover:bg-surface-2'
      } disabled:pointer-events-none disabled:opacity-35 ${className}`}
    >
      {children}
    </button>
  )
}

export function TextButton({ children, className = '', primary, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      {...rest}
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors ${focusRing} ${
        primary ? 'bg-accent text-accent-fg hover:bg-accent-hover' : 'border border-line-strong text-ink hover:bg-surface-2'
      } disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

export function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />
}

// ---------------------------------------------------------------------------------------------
// popover (portal, so scrolling toolbars never clip it)

interface PopoverProps {
  trigger: (p: { open: boolean; toggle: () => void; ref: Ref<HTMLSpanElement> }) => ReactNode
  children: (close: () => void) => ReactNode
  width?: number
  align?: 'start' | 'end'
  className?: string
  /** Called when the panel opens / closes (e.g. to flag slider-drag quality). */
  onOpenChange?: (open: boolean) => void
}
export function Popover({ trigger, children, width = 280, align = 'start', className = '', onOpenChange }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((o) => !o), [])
  useEffect(() => onOpenChange?.(open), [open, onOpenChange])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      if (!a) return
      const ph = panel.current?.offsetHeight ?? 0
      let left = align === 'end' ? a.right - width : a.left
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      let top = a.bottom + 6
      if (top + ph > window.innerHeight - 8) top = Math.max(8, a.top - ph - 6)
      setPos({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, width, align])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return
      if ((t as HTMLElement).closest?.('[data-popover]')) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <>
      {trigger({ open, toggle, ref: anchor })}
      {open &&
        createPortal(
          <div
            ref={panel}
            data-popover
            role="dialog"
            style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, width, zIndex: 60 } as CSSProperties}
            className={`max-h-[calc(100dvh-16px)] overflow-y-auto rounded-lg border border-line bg-surface p-3 text-ink shadow-[0_8px_30px_rgba(0,0,0,0.18)] ${className}`}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  )
}

export function MenuItem({
  children,
  onSelect,
  icon,
  shortcut,
  disabled,
  danger,
}: {
  children: ReactNode
  onSelect: () => void
  icon?: ReactNode
  shortcut?: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${focusRing} ${
        danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-surface-2'
      } disabled:pointer-events-none disabled:opacity-40`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="shrink-0 text-xs tabular-nums text-faint">{shortcut}</span>}
    </button>
  )
}
export function MenuDivider() {
  return <div role="separator" className="my-1 h-px bg-line" />
}

// ---------------------------------------------------------------------------------------------
// dialog

export function Dialog({ title, onClose, children, width = 520, footer }: { title: string; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="flex max-h-[calc(100dvh-32px)] max-w-full flex-col rounded-xl border border-line bg-surface text-ink shadow-[0_20px_60px_rgba(0,0,0,0.3)] outline-none"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------------------------
// slider with live-quality flag

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  center,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  /** draw the fill from the centre (bipolar controls) */
  center?: boolean
  disabled?: boolean
}) {
  const id = useId()
  const live = (on: boolean) => editorStore.set({ interacting: on })
  const pct = ((value - min) / (max - min)) * 100
  const mid = ((0 - min) / (max - min)) * 100
  const bg = center
    ? `linear-gradient(to right, var(--line-strong-color) 0%, var(--line-strong-color) ${Math.min(pct, mid)}%, var(--accent-color) ${Math.min(pct, mid)}%, var(--accent-color) ${Math.max(pct, mid)}%, var(--line-strong-color) ${Math.max(pct, mid)}%, var(--line-strong-color) 100%)`
    : `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${pct}%, var(--line-strong-color) ${pct}%, var(--line-strong-color) 100%)`
  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <label htmlFor={id} className="text-muted">
          {label}
        </label>
        <span className="tabular-nums text-ink">{format ? format(value) : Math.round(value * 100) / 100}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onPointerDown={() => live(true)}
        onPointerUp={() => live(false)}
        onPointerCancel={() => live(false)}
        onBlur={() => live(false)}
        onKeyUp={() => live(false)}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => center && onChange(0)}
        style={{ background: bg }}
        className="editor-range h-1 w-full cursor-pointer appearance-none rounded-full"
      />
    </div>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  className = '',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(Math.round(value * 100) / 100)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    setDraft(null)
    if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)))
  }
  return (
    <label className={`flex flex-col gap-1 text-xs text-muted ${className}`}>
      {label}
      <span className="flex items-center rounded-md border border-line bg-app px-2 focus-within:border-accent">
        <input
          inputMode="decimal"
          value={shown}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              const n = Number(shown) + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)
              setDraft(null)
              onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)))
            }
          }}
          className="h-8 w-full min-w-0 bg-transparent text-[13px] tabular-nums text-ink outline-none"
        />
        {suffix && <span className="ml-1 text-xs text-faint">{suffix}</span>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-app p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(o.value)}
          className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${focusRing} ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-xs font-semibold text-muted">{children}</h3>
}
