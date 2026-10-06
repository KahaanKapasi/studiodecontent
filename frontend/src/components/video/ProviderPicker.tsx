import type { ReactNode } from 'react'
import type { VideoProviderInfo } from '../../types'
import Segmented from './Segmented'
import type { ResolvedSelection, SelectionPrefs } from './selection'

interface ProviderPickerProps {
  providers: VideoProviderInfo[]
  selection: ResolvedSelection
  onChange: (patch: Partial<SelectionPrefs>) => void
  disabled?: boolean
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">{children}</div>
}

export default function ProviderPicker({ providers, selection, onChange, disabled }: ProviderPickerProps) {
  const { provider, model, aspect, duration, resolution } = selection

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>Provider</FieldLabel>
        <Segmented
          ariaLabel="Provider"
          value={provider.id}
          options={providers.map((p) => ({
            value: p.id,
            label: p.configured ? p.label : `${p.label} · setup needed`,
          }))}
          // switching provider resets the model so the new provider's default is used
          onChange={(id) => onChange({ providerId: id, modelId: undefined })}
          fullWidth
        />
        {!provider.configured && (
          <p
            role="alert"
            className="mt-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
          >
            {provider.label} isn&apos;t set up on the server yet
            {provider.missing_keys.length > 0 && (
              <>
                {' '}
                — missing{' '}
                {provider.missing_keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && ', '}
                    <code className="font-mono">{k}</code>
                  </span>
                ))}
              </>
            )}
            . Generation is disabled until it is.
          </p>
        )}
      </div>

      <div>
        <FieldLabel>Model</FieldLabel>
        <select
          aria-label="Model"
          value={model.id}
          disabled={disabled}
          onChange={(e) => onChange({ modelId: e.target.value })}
          className="min-h-10 w-full rounded-md border border-line bg-app px-3 py-2 text-base text-ink sm:text-sm"
        >
          {provider.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {model.notes && <p className="mt-1.5 text-xs text-faint">{model.notes}</p>}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <FieldLabel>Aspect ratio</FieldLabel>
          <Segmented
            ariaLabel="Aspect ratio"
            layout="chips"
            value={aspect}
            options={model.aspect_ratios.map((r) => ({ value: r, label: r }))}
            onChange={(r) => onChange({ aspect: r })}
          />
        </div>
        <div>
          <FieldLabel>Duration</FieldLabel>
          <Segmented
            ariaLabel="Duration"
            layout="chips"
            value={duration}
            options={model.durations.map((d) => ({ value: d, label: `${d}s` }))}
            onChange={(d) => onChange({ duration: d })}
          />
        </div>
      </div>

      <div>
        <FieldLabel>Resolution</FieldLabel>
        <Segmented
          ariaLabel="Resolution"
          layout="chips"
          value={resolution}
          options={model.resolutions.map((r) => ({ value: r, label: r }))}
          onChange={(r) => onChange({ resolution: r })}
        />
      </div>
    </div>
  )
}
