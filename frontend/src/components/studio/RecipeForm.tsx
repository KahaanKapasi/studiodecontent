import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { studioApi } from '../../api/client'
import type { StudioEngineInfo, StudioProject, StudioRecipeInfo } from '../../types'
import FieldControl from './FormFields'
import { releaseFiles } from './fileUrl'
import { buildFiles, buildParams, initialState, validate, type FieldValue, type FormState } from './formModel'
import { PROJECTS_KEY } from './keys'
import Switch from './Switch'

function errText(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback
}

/** Best-effort: which field does a backend validation message talk about? */
function fieldNamedIn(message: string, recipe: StudioRecipeInfo): string | null {
  for (const f of recipe.fields) {
    if (new RegExp(`(^|[^a-z0-9_])${f.name}([^a-z0-9_]|$)`, 'i').test(message)) return f.name
  }
  return null
}

export default function RecipeForm({
  engine,
  recipe,
  onCreated,
}: {
  engine: StudioEngineInfo
  recipe: StudioRecipeInfo
  onCreated?: (p: StudioProject) => void
}) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<FormState>(() => initialState(recipe))
  const [autoApprove, setAutoApprove] = useState(!recipe.paid)
  const [attempted, setAttempted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [justQueued, setJustQueued] = useState(false)

  // Release preview object URLs when the form goes away (e.g. another recipe is chosen).
  const filesRef = useRef(state.files)
  useEffect(() => {
    filesRef.current = state.files
  })
  useEffect(
    () => () => {
      releaseFiles(Object.values(filesRef.current).flat())
    },
    [],
  )

  const errors = useMemo(() => (attempted ? validate(recipe.fields, state) : {}), [attempted, recipe.fields, state])
  const serverField = serverError ? fieldNamedIn(serverError, recipe) : null

  const create = useMutation({
    mutationFn: studioApi.createProject,
    onSuccess: (created) => {
      queryClient.setQueryData<StudioProject[]>(PROJECTS_KEY, (old) => [
        created,
        ...(old ?? []).filter((p) => p.id !== created.id),
      ])
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })
      releaseFiles(Object.values(state.files).flat())
      setState(initialState(recipe))
      setAttempted(false)
      setServerError(null)
      setJustQueued(true)
      onCreated?.(created)
    },
    onError: (e) => setServerError(errText(e, 'Could not start the project.')),
  })

  function edit(patch: (s: FormState) => FormState) {
    setState(patch)
    setServerError(null)
    setJustQueued(false)
  }

  function submit() {
    setAttempted(true)
    setJustQueued(false)
    setServerError(null)
    if (!recipe.configured) return
    const found = validate(recipe.fields, state)
    if (Object.keys(found).length) return
    create.mutate({
      engine: engine.id,
      recipe: recipe.id,
      params: buildParams(recipe.fields, state),
      autoApprove,
      files: buildFiles(recipe.fields, state),
    })
  }

  const errorCount = Object.keys(errors).length
  const blocked = !recipe.configured
  const busy = create.isPending

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      noValidate
      className="space-y-5"
    >
      {blocked && (
        <div role="status" className="rounded-md border border-line-strong bg-surface-2 px-3 py-2.5 text-sm text-muted">
          Not configured on the server. Missing{' '}
          {recipe.missing_keys.map((k, i) => (
            <span key={k}>
              {i > 0 && ', '}
              <code className="rounded bg-surface px-1 py-0.5 text-xs text-ink">{k}</code>
            </span>
          ))}
          . You can fill the form, but starting is disabled.
        </div>
      )}

      {recipe.fields.map((spec) => {
        const err = errors[spec.name] ?? (serverField === spec.name ? (serverError ?? undefined) : undefined)
        return (
          <FieldControl
            key={spec.name}
            spec={spec}
            value={state.values[spec.name] as FieldValue | undefined}
            files={state.files[spec.name] ?? []}
            duration={state.durations[spec.name]}
            error={err}
            disabled={busy}
            onValue={(v) => edit((s) => ({ ...s, values: { ...s.values, [spec.name]: v } }))}
            onFiles={(files) =>
              edit((s) => {
                const durations = { ...s.durations }
                delete durations[spec.name]
                return { ...s, files: { ...s.files, [spec.name]: files }, durations }
              })
            }
            onDuration={(d) => setState((s) => ({ ...s, durations: { ...s.durations, [spec.name]: d } }))}
          />
        )
      })}

      <div className="border-t border-line pt-4">
        <Switch
          checked={autoApprove}
          onChange={(v) => {
            setAutoApprove(v)
            setJustQueued(false)
          }}
          disabled={busy}
          label="Auto-approve"
          hint={
            recipe.paid
              ? 'Off: stops after planning so you can review the script and cost before anything expensive runs. On: renders straight through.'
              : 'Off: stops after planning so you can review the script and cost before anything expensive runs. On: renders straight through (this recipe is free or cheap).'
          }
        />
      </div>

      <div className="space-y-3">
        <button
          type="submit"
          disabled={blocked || busy}
          className="min-h-11 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'Starting…' : autoApprove ? 'Create video' : 'Plan video'}
        </button>
        {blocked && (
          <p className="text-sm text-muted">Add {recipe.missing_keys.join(', ')} to the server environment to enable this.</p>
        )}
        {attempted && errorCount > 0 && (
          <p role="alert" className="text-sm text-danger">
            {errorCount === 1 ? 'One field needs attention.' : `${errorCount} fields need attention.`}
          </p>
        )}
        {serverError && !serverField && (
          <p role="alert" className="text-sm text-danger">
            {serverError}
          </p>
        )}
        {justQueued && (
          <p role="status" className="text-sm text-success">
            Queued — it appears under Projects and updates automatically.
          </p>
        )}
      </div>
    </form>
  )
}
