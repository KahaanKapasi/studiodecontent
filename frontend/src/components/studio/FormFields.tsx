import { useId, useRef } from 'react'
import type { StudioFieldSpec } from '../../types'
import Segmented from '../video/Segmented'
import { formatBytes, formatDuration, fileUrl, releaseFile } from './fileUrl'
import { SEGMENTED_MAX_OPTIONS, type FieldValue } from './formModel'
import Switch from './Switch'

export const inputClass =
  'w-full rounded-md border border-line bg-app px-3 py-2.5 text-base text-ink placeholder:text-faint sm:text-sm'

const secondaryBtn =
  'min-h-10 rounded-md border border-line-strong px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50'

interface FieldProps {
  spec: StudioFieldSpec
  value: FieldValue | undefined
  files: File[]
  duration?: number
  error?: string
  disabled?: boolean
  onValue: (v: FieldValue) => void
  onFiles: (files: File[]) => void
  onDuration: (seconds: number) => void
}

function FileDropButton({
  accept,
  multiple,
  label,
  disabled,
  invalid,
  onPick,
}: {
  accept: string
  multiple?: boolean
  label: string
  disabled?: boolean
  invalid?: boolean
  onPick: (files: File[]) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (picked.length) onPick(picked)
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed border-line-strong px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50 ${
          invalid ? 'ring-1 ring-danger' : ''
        }`}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        </svg>
        {label}
      </button>
    </>
  )
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={secondaryBtn}>
      Remove
    </button>
  )
}

function SingleFile({
  spec,
  files,
  duration,
  error,
  disabled,
  onFiles,
  onDuration,
}: Pick<FieldProps, 'spec' | 'files' | 'duration' | 'error' | 'disabled' | 'onFiles' | 'onDuration'>) {
  const file = files[0]
  const kind = spec.type as 'image' | 'video' | 'audio'
  const accept = `${kind}/*`
  if (!file) {
    return (
      <FileDropButton
        accept={accept}
        label={`Choose ${kind === 'image' ? 'an image' : kind === 'video' ? 'a video' : 'an audio file'}`}
        disabled={disabled}
        invalid={!!error}
        onPick={(picked) => onFiles(picked.slice(0, 1))}
      />
    )
  }
  const url = fileUrl(file)
  return (
    <div className="space-y-2 rounded-md border border-line bg-surface-2 p-3">
      <div className="flex items-start gap-3">
        {kind === 'image' && (
          <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{file.name}</p>
          <p className="text-xs text-faint">
            {formatBytes(file.size)}
            {kind === 'video' && duration !== undefined && ` · ${formatDuration(duration)}`}
          </p>
        </div>
      </div>
      {kind === 'video' && (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration
            if (Number.isFinite(d)) onDuration(d)
          }}
          className="max-h-56 w-full rounded-md bg-black"
        />
      )}
      {kind === 'audio' && <audio src={url} controls preload="metadata" className="w-full" />}
      <div className="flex gap-2">
        <RemoveButton
          label={`Remove ${file.name}`}
          onClick={() => {
            releaseFile(file)
            onFiles([])
          }}
        />
      </div>
    </div>
  )
}

function MultiImages({
  spec,
  files,
  error,
  disabled,
  onFiles,
}: Pick<FieldProps, 'spec' | 'files' | 'error' | 'disabled' | 'onFiles'>) {
  const full = spec.max !== undefined && files.length >= spec.max
  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="relative">
              <img
                src={fileUrl(f)}
                alt={f.name}
                className="aspect-square w-full rounded-md border border-line object-cover"
              />
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => {
                  releaseFile(f)
                  onFiles(files.filter((_, j) => j !== i))
                }}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink/80 text-app hover:bg-ink"
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <FileDropButton
          accept="image/*"
          multiple
          label={files.length ? 'Add more images' : 'Choose images'}
          disabled={disabled}
          invalid={!!error}
          onPick={(picked) => onFiles([...files, ...picked])}
        />
      )}
      {files.length > 0 && (
        <p className="text-xs text-faint">
          {files.length} image{files.length === 1 ? '' : 's'}
          {spec.max !== undefined ? ` of max ${spec.max}` : ''}
        </p>
      )}
    </div>
  )
}

export default function FieldControl(props: FieldProps) {
  const { spec, value, error, disabled, onValue } = props
  const id = useId()
  const describedBy = [spec.help ? `${id}-help` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
  const invalid = error ? 'ring-1 ring-danger' : ''

  let control
  switch (spec.type) {
    case 'toggle':
      control = (
        <Switch
          checked={Boolean(value)}
          onChange={onValue}
          label={spec.label}
          hint={spec.help}
          disabled={disabled}
        />
      )
      return (
        <div>
          {control}
          {error && (
            <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )
    case 'text':
      control = (
        <input
          id={id}
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onValue(e.target.value)}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className={`${inputClass} ${invalid}`}
        />
      )
      break
    case 'textarea':
      control = (
        <textarea
          id={id}
          value={String(value ?? '')}
          onChange={(e) => onValue(e.target.value)}
          disabled={disabled}
          rows={5}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className={`${inputClass} resize-y ${invalid}`}
        />
      )
      break
    case 'number':
      control = (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={String(value ?? '')}
          min={spec.min}
          max={spec.max}
          step="any"
          onChange={(e) => onValue(e.target.value)}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className={`${inputClass} ${invalid}`}
        />
      )
      break
    case 'select': {
      const opts = spec.options ?? []
      control =
        opts.length > 0 && opts.length <= SEGMENTED_MAX_OPTIONS ? (
          <Segmented
            ariaLabel={spec.label}
            value={String(value ?? '')}
            onChange={onValue}
            options={opts.map((o) => ({ value: String(o.value), label: o.label, disabled }))}
            layout="chips"
          />
        ) : (
          <select
            id={id}
            value={String(value ?? '')}
            onChange={(e) => onValue(e.target.value)}
            disabled={disabled}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            className={`${inputClass} ${invalid}`}
          >
            {!spec.required && <option value="">Default</option>}
            {spec.required && !value && <option value="">Select…</option>}
            {opts.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        )
      break
    }
    case 'images':
      control = <MultiImages {...props} />
      break
    default:
      control = <SingleFile {...props} />
  }

  const isGroup = spec.type === 'select' || spec.type === 'images' || ['image', 'video', 'audio'].includes(spec.type)
  return (
    <div>
      {isGroup ? (
        <span className="mb-1.5 block text-sm font-medium text-ink">
          {spec.label}
          {spec.required && <span className="ml-0.5 text-danger" aria-label="required">*</span>}
        </span>
      ) : (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
          {spec.label}
          {spec.required && <span className="ml-0.5 text-danger" aria-label="required">*</span>}
        </label>
      )}
      {control}
      {spec.help && (
        <p id={`${id}-help`} className="mt-1.5 text-xs leading-relaxed text-faint">
          {spec.help}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
