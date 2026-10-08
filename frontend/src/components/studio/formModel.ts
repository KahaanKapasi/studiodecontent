import type { StudioFieldSpec, StudioRecipeInfo } from '../../types'

export type FieldValue = string | boolean

export interface FormState {
  values: Record<string, FieldValue>
  files: Record<string, File[]>
  /** Seconds, read from the browser for `video` fields. */
  durations: Record<string, number>
}

export const FILE_TYPES = ['image', 'images', 'video', 'audio'] as const
export const isFileField = (f: StudioFieldSpec) => (FILE_TYPES as readonly string[]).includes(f.type)

/** Selects with ≤ this many options render as a segmented control. */
export const SEGMENTED_MAX_OPTIONS = 4

function defaultValue(f: StudioFieldSpec): FieldValue {
  switch (f.type) {
    case 'toggle':
      return Boolean(f.default)
    case 'number':
      return f.default === undefined || f.default === null ? '' : String(f.default)
    case 'select': {
      const opts = f.options ?? []
      if (f.default !== undefined && f.default !== null) return String(f.default)
      // A segmented control can't be left empty; a required select starts on its first option.
      return (f.required || opts.length <= SEGMENTED_MAX_OPTIONS) && opts[0] ? opts[0].value : ''
    }
    default:
      return f.default === undefined || f.default === null ? '' : String(f.default)
  }
}

export function initialState(recipe: StudioRecipeInfo): FormState {
  const values: Record<string, FieldValue> = {}
  for (const f of recipe.fields) if (!isFileField(f)) values[f.name] = defaultValue(f)
  return { values, files: {}, durations: {} }
}

export function validate(fields: StudioFieldSpec[], state: FormState): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const f of fields) {
    const label = f.label
    if (f.type === 'toggle') continue

    if (f.type === 'text' || f.type === 'textarea') {
      const v = String(state.values[f.name] ?? '').trim()
      if (f.required && !v) errors[f.name] = `${label} is required.`
      else if (v && f.min !== undefined && v.length < f.min)
        errors[f.name] = `${label} must be at least ${f.min} characters.`
      else if (v && f.max !== undefined && v.length > f.max)
        errors[f.name] = `${label} must be at most ${f.max} characters.`
    } else if (f.type === 'number') {
      const raw = String(state.values[f.name] ?? '').trim()
      if (!raw) {
        if (f.required) errors[f.name] = `${label} is required.`
        continue
      }
      const n = Number(raw)
      if (!Number.isFinite(n)) errors[f.name] = `${label} must be a number.`
      else if (f.min !== undefined && n < f.min) errors[f.name] = `${label} must be at least ${f.min}.`
      else if (f.max !== undefined && n > f.max) errors[f.name] = `${label} must be at most ${f.max}.`
    } else if (f.type === 'select') {
      if (f.required && !String(state.values[f.name] ?? '')) errors[f.name] = `Choose a ${label.toLowerCase()}.`
    } else if (f.type === 'images') {
      const count = (state.files[f.name] ?? []).length
      const min = f.min ?? (f.required ? 1 : 0)
      if (count < min) errors[f.name] = min <= 1 ? `Add at least one image.` : `Add at least ${min} images.`
      else if (f.max !== undefined && count > f.max) errors[f.name] = `Add at most ${f.max} images.`
    } else {
      // image / video / audio — a single file
      const file = (state.files[f.name] ?? [])[0]
      if (f.required && !file) errors[f.name] = `${label} is required.`
      else if (file && f.type === 'video' && f.max !== undefined) {
        const d = state.durations[f.name]
        if (d !== undefined && d > f.max) errors[f.name] = `${label} must be ${f.max}s or shorter.`
      }
    }
  }
  return errors
}

/** Non-file field values, typed for JSON; empty optional values are left out. */
export function buildParams(fields: StudioFieldSpec[], state: FormState): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const f of fields) {
    if (isFileField(f)) continue
    const v = state.values[f.name]
    if (f.type === 'toggle') params[f.name] = Boolean(v)
    else if (f.type === 'number') {
      const raw = String(v ?? '').trim()
      if (raw) params[f.name] = Number(raw)
    } else {
      const s = String(v ?? '').trim()
      if (s) params[f.name] = s
    }
  }
  return params
}

export function buildFiles(fields: StudioFieldSpec[], state: FormState): Record<string, File[]> {
  const out: Record<string, File[]> = {}
  for (const f of fields) if (isFileField(f) && state.files[f.name]?.length) out[f.name] = state.files[f.name]
  return out
}
