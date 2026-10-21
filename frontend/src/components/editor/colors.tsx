import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Eyedropper } from '@phosphor-icons/react'
import { cssGradient } from './fabricBuild'
import { docColors, type GradientPaint, type Paint } from './model'
import { useEditor } from './store'
import { Popover, SectionTitle, Slider, focusRing } from './ui'

// ---------------------------------------------------------------------------------------------
// brand colours (global, kept in localStorage)

const BRAND_KEY = 'contentstudio.brandColors'
const DEFAULT_BRAND = ['#000000', '#ffffff', '#febe10', '#00529f', '#e32636']
let brand: string[] = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(BRAND_KEY) ?? 'null')
    if (Array.isArray(v) && v.every((c) => typeof c === 'string')) return v
  } catch {
    // fall through
  }
  return DEFAULT_BRAND
})()
const brandListeners = new Set<() => void>()
function setBrand(next: string[]) {
  brand = next
  try {
    localStorage.setItem(BRAND_KEY, JSON.stringify(next))
  } catch {
    // storage blocked: palette lasts for this session
  }
  for (const l of brandListeners) l()
}
export function useBrandColors() {
  const colors = useSyncExternalStore(
    (l) => {
      brandListeners.add(l)
      return () => brandListeners.delete(l)
    },
    () => brand,
  )
  return {
    colors,
    add: (c: string) => !brand.includes(c) && setBrand([...brand, c].slice(0, 16)),
    remove: (c: string) => setBrand(brand.filter((x) => x !== c)),
  }
}

const PALETTE = [
  '#000000', '#545454', '#a6a6a6', '#d9d9d9', '#ffffff',
  '#ff3131', '#ff5757', '#ff66c4', '#cb6ce6', '#8c52ff',
  '#5271ff', '#0071e3', '#38b6ff', '#5ce1e6', '#00c2a8',
  '#7ed957', '#c1ff72', '#ffde59', '#febe10', '#ff914d',
]

export const GRADIENTS: GradientPaint[] = [
  { kind: 'linear', angle: 180, stops: [{ offset: 0, color: '#1d1d1f' }, { offset: 1, color: '#000000' }] },
  { kind: 'linear', angle: 180, stops: [{ offset: 0, color: '#00529f' }, { offset: 1, color: '#001a33' }] },
  { kind: 'linear', angle: 135, stops: [{ offset: 0, color: '#febe10' }, { offset: 1, color: '#ff914d' }] },
  { kind: 'linear', angle: 135, stops: [{ offset: 0, color: '#ff66c4' }, { offset: 1, color: '#8c52ff' }] },
  { kind: 'linear', angle: 160, stops: [{ offset: 0, color: '#38b6ff' }, { offset: 1, color: '#5271ff' }] },
  { kind: 'linear', angle: 135, stops: [{ offset: 0, color: '#00c2a8' }, { offset: 1, color: '#0071e3' }] },
  { kind: 'linear', angle: 180, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#d9d9d9' }] },
  { kind: 'linear', angle: 135, stops: [{ offset: 0, color: '#ff3131' }, { offset: 1, color: '#7a0012' }] },
  { kind: 'linear', angle: 90, stops: [{ offset: 0, color: '#0f0c29' }, { offset: 0.5, color: '#302b63' }, { offset: 1, color: '#24243e' }] },
  { kind: 'linear', angle: 135, stops: [{ offset: 0, color: '#7ed957' }, { offset: 1, color: '#00805c' }] },
  { kind: 'linear', angle: 0, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: 'rgba(0,0,0,0)' }] },
  { kind: 'linear', angle: 180, stops: [{ offset: 0, color: 'rgba(0,0,0,0)' }, { offset: 1, color: '#000000' }] },
]

export function paintCss(p: Paint): string {
  if (typeof p === 'string') return p === 'transparent' ? 'transparent' : p
  return cssGradient(p)
}

function normalizeHex(v: string): string | null {
  const t = v.trim().replace(/^#?/, '#')
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(t)) return ('#' + [...t.slice(1)].map((c) => c + c).join('')).toLowerCase()
  return null
}

function Swatch({ color, active, onClick, title }: { color: string; active?: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title ?? color}
      aria-label={title ?? color}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{ background: color }}
      className={`h-6 w-6 rounded-md border border-black/15 ${focusRing} ${active ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`}
    />
  )
}

export function ColorPanel({
  value,
  onChange,
  allowGradient,
  allowTransparent,
}: {
  value: Paint
  onChange: (p: Paint) => void
  allowGradient?: boolean
  allowTransparent?: boolean
}) {
  const doc = useEditor((s) => s.doc)
  const docCols = useMemo(() => docColors(doc), [doc])
  const { colors, add, remove } = useBrandColors()
  const [tab, setTab] = useState<'solid' | 'gradient'>(typeof value === 'string' ? 'solid' : 'gradient')
  const solid = typeof value === 'string' ? value : value.stops[0].color
  const [hex, setHex] = useState(solid)
  useEffect(() => setHex(typeof value === 'string' ? value : value.stops[0].color), [value])
  const grad = typeof value === 'string' ? null : value
  const hasDropper = typeof window !== 'undefined' && 'EyeDropper' in window

  const pickScreen = async () => {
    try {
      const Ctor = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
      const r = await new Ctor().open()
      onChange(r.sRGBHex.toLowerCase())
    } catch {
      // cancelled
    }
  }

  return (
    <div className="space-y-3">
      {allowGradient && (
        <div className="flex gap-1 rounded-md border border-line bg-app p-0.5 text-xs font-medium">
          {(['solid', 'gradient'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-7 flex-1 rounded capitalize ${focusRing} ${tab === t ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {tab === 'solid' ? (
        <>
          <div className="flex items-center gap-2">
            <label className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line-strong" style={{ background: solid }}>
              <input
                type="color"
                aria-label="Pick a colour"
                value={/^#[0-9a-f]{6}$/i.test(solid) ? solid : '#000000'}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <input
              aria-label="Hex colour"
              value={hex}
              onChange={(e) => {
                setHex(e.target.value)
                const n = normalizeHex(e.target.value)
                if (n) onChange(n)
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-line bg-app px-2 text-[13px] tabular-nums text-ink outline-none focus:border-accent"
            />
            {hasDropper && (
              <button type="button" title="Pick from screen" aria-label="Pick from screen" onClick={pickScreen} className={`flex h-8 w-8 items-center justify-center rounded-md border border-line hover:bg-surface-2 ${focusRing}`}>
                <Eyedropper size={16} />
              </button>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <SectionTitle>Brand colours</SectionTitle>
              <button
                type="button"
                className={`mb-2 text-xs font-medium text-accent hover:text-accent-hover ${focusRing}`}
                onClick={() => typeof value === 'string' && /^#/.test(value) && add(value)}
              >
                Save current
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {colors.map((c) => (
                <span key={c} className="group relative">
                  <Swatch color={c} active={value === c} onClick={() => onChange(c)} />
                  <button
                    type="button"
                    aria-label={`Remove ${c} from brand colours`}
                    onClick={() => remove(c)}
                    className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-ink text-[9px] leading-none text-surface group-hover:flex"
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          </div>

          {docCols.length > 0 && (
            <div>
              <SectionTitle>In this design</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {docCols.map((c) => (
                  <Swatch key={c} color={c} active={value === c} onClick={() => onChange(c)} />
                ))}
              </div>
            </div>
          )}

          <div>
            <SectionTitle>Default colours</SectionTitle>
            <div className="grid grid-cols-10 gap-1.5">
              {PALETTE.map((c) => (
                <Swatch key={c} color={c} active={value === c} onClick={() => onChange(c)} />
              ))}
            </div>
            {allowTransparent && (
              <button type="button" onClick={() => onChange('transparent')} className={`mt-2 text-xs font-medium text-accent hover:text-accent-hover ${focusRing}`}>
                No fill
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {GRADIENTS.map((g, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Gradient ${i + 1}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange(g)}
                style={{ background: cssGradient(g) }}
                className={`h-10 rounded-md border border-black/15 ${focusRing} ${grad && JSON.stringify(grad.stops) === JSON.stringify(g.stops) ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`}
              />
            ))}
          </div>
          {grad && (
            <>
              <Slider label="Angle" value={grad.angle} min={0} max={360} step={5} onChange={(a) => onChange({ ...grad, angle: a })} format={(v) => `${v} deg`} />
              <div className="flex gap-2">
                {grad.stops.map((s, i) => (
                  <label key={i} className="flex items-center gap-1.5 text-xs text-muted">
                    Stop {i + 1}
                    <input
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#000000'}
                      onChange={(e) => onChange({ ...grad, stops: grad.stops.map((st, j) => (j === i ? { ...st, color: e.target.value } : st)) })}
                      className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent"
                    />
                  </label>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export function ColorButton({
  value,
  onChange,
  label,
  allowGradient,
  allowTransparent,
  className = '',
  onOpenChange,
}: {
  value: Paint
  onChange: (p: Paint) => void
  label: string
  allowGradient?: boolean
  allowTransparent?: boolean
  className?: string
  onOpenChange?: (o: boolean) => void
}) {
  return (
    <Popover
      width={288}
      onOpenChange={onOpenChange}
      trigger={({ open, toggle, ref }) => (
        <span ref={ref}>
          <button
            type="button"
            title={label}
            aria-label={label}
            aria-expanded={open}
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggle}
            className={`flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-2 ${focusRing} ${open ? 'bg-surface-2' : ''} ${className}`}
          >
            <span
              className="h-5 w-5 rounded-full border border-black/20"
              style={{
                background:
                  value === 'transparent'
                    ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px'
                    : paintCss(value),
              }}
            />
          </button>
        </span>
      )}
    >
      {() => <ColorPanel value={value} onChange={onChange} allowGradient={allowGradient} allowTransparent={allowTransparent} />}
    </Popover>
  )
}

