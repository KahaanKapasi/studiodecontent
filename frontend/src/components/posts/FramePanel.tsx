import { DEFAULT_FRAME, isDefaultFrame, type Frame } from './frame'

interface FramePanelProps {
  value: Frame
  onChange: (next: Frame) => void
}

const SLIDERS: { key: keyof Frame; label: string; min: number; max: number; step: number }[] = [
  { key: 'zoom', label: 'Zoom', min: 1, max: 3, step: 0.01 },
  { key: 'panX', label: 'Position X', min: -1, max: 1, step: 0.01 },
  { key: 'panY', label: 'Position Y', min: -1, max: 1, step: 0.01 },
]

export default function FramePanel({ value, onChange }: FramePanelProps) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Crop &amp; frame</h2>
        <button
          onClick={() => onChange(DEFAULT_FRAME)}
          disabled={isDefaultFrame(value)}
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
              <span className="tabular-nums text-faint">{value[s.key].toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={value[s.key]}
              disabled={s.key !== 'zoom' && value.zoom === 1}
              onChange={(e) => onChange({ ...value, [s.key]: Number(e.target.value) })}
              className="w-full accent-[var(--accent-color)] disabled:opacity-40"
            />
          </label>
        ))}
      </div>
    </div>
  )
}
