import { DEFAULT_ADJUSTMENTS, isDefaultAdjustments, type Adjustments } from './adjustments'

interface LightroomPanelProps {
  value: Adjustments
  onChange: (next: Adjustments) => void
}

const SLIDERS: { key: keyof Adjustments; label: string; min: number; max: number; step: number }[] = [
  { key: 'exposure', label: 'Exposure', min: -1, max: 1, step: 0.01 },
  { key: 'contrast', label: 'Contrast', min: -1, max: 1, step: 0.01 },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1, step: 0.01 },
  { key: 'vibrance', label: 'Vibrance', min: -1, max: 1, step: 0.01 },
  { key: 'temperature', label: 'Temperature', min: -1, max: 1, step: 0.01 },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 1, step: 0.01 },
]

export default function LightroomPanel({ value, onChange }: LightroomPanelProps) {
  function setField<K extends keyof Adjustments>(key: K, fieldValue: Adjustments[K]) {
    onChange({ ...value, [key]: fieldValue })
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Adjust</h2>
        <button
          onClick={() => onChange(DEFAULT_ADJUSTMENTS)}
          disabled={isDefaultAdjustments(value)}
          className="text-xs font-medium text-accent hover:text-accent-hover disabled:opacity-40"
        >
          Reset
        </button>
      </div>

      <div className="space-y-3">
        {SLIDERS.map((s) => (
          <label key={s.key} className="block">
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>{s.label}</span>
              <span className="tabular-nums text-faint">{(value[s.key] as number).toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={value[s.key] as number}
              onChange={(e) => setField(s.key, Number(e.target.value) as Adjustments[typeof s.key])}
              className="w-full accent-[var(--accent-color)]"
            />
          </label>
        ))}

        <label className="flex items-center gap-2 pt-1 text-sm text-ink">
          <input
            type="checkbox"
            checked={value.grayscale}
            onChange={(e) => setField('grayscale', e.target.checked)}
            className="accent-[var(--accent-color)]"
          />
          Black &amp; white
        </label>
      </div>
    </div>
  )
}
