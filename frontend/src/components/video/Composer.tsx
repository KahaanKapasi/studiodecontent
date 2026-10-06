import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { videoApi } from '../../api/client'
import type { ImprovePromptResult, VideoGeneration } from '../../types'
import ProviderPicker from './ProviderPicker'
import { estimateCost, formatUsd } from './format'
import { GENERATIONS_KEY } from './keys'
import { DEFAULT_PREFS, resolveSelection, type SelectionPrefs } from './selection'

/** Above this estimate, Generate needs an explicit inline confirmation. */
const CONFIRM_THRESHOLD_USD = 1

export interface Prefill {
  text: string
  /** Bump to re-apply the same text (e.g. clicking "Use as prompt" twice). */
  nonce: number
}

const inputClass =
  'w-full rounded-md border border-line bg-app px-3 py-2.5 text-base text-ink placeholder:text-faint sm:text-sm'

function errText(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-10 items-center gap-3 rounded-md text-left"
    >
      <span
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-line-strong'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </span>
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-faint">{hint}</span>
      </span>
    </button>
  )
}

export default function Composer({
  prefill,
  onCreated,
}: {
  prefill: Prefill
  onCreated?: () => void
}) {
  const queryClient = useQueryClient()

  const [idea, setIdea] = useState('')
  const [research, setResearch] = useState(false)
  const [improved, setImproved] = useState<ImprovePromptResult | null>(null)
  const [finalPrompt, setFinalPrompt] = useState('')
  const [prefs, setPrefs] = useState<SelectionPrefs>(DEFAULT_PREFS)
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const [justQueued, setJustQueued] = useState(false)

  // Pre-fill from "Use as prompt" — adjusting state during render (no effect needed).
  const [seenNonce, setSeenNonce] = useState(prefill.nonce)
  if (prefill.nonce !== seenNonce) {
    setSeenNonce(prefill.nonce)
    setIdea(prefill.text)
    setImproved(null)
    setFinalPrompt('')
    setConfirmKey(null)
    setJustQueued(false)
  }

  const providersQuery = useQuery({
    queryKey: ['video', 'providers'],
    queryFn: videoApi.providers,
    staleTime: 5 * 60_000,
  })
  const providers = useMemo(() => providersQuery.data ?? [], [providersQuery.data])
  const selection = useMemo(() => resolveSelection(providers, prefs), [providers, prefs])

  const improveMutation = useMutation({
    mutationFn: videoApi.improvePrompt,
    onSuccess: (result) => {
      setImproved(result)
      setFinalPrompt(result.prompt)
      setConfirmKey(null)
    },
  })

  const createMutation = useMutation({
    mutationFn: videoApi.createGeneration,
    onSuccess: (created) => {
      queryClient.setQueryData<VideoGeneration[]>(GENERATIONS_KEY, (old) => [
        created,
        ...(old ?? []).filter((g) => g.id !== created.id),
      ])
      queryClient.invalidateQueries({ queryKey: GENERATIONS_KEY })
      setConfirmKey(null)
      setJustQueued(true)
      onCreated?.()
    },
  })

  const usingImproved = improved !== null
  const promptToSend = (usingImproved ? finalPrompt : idea).trim()
  const cost = selection ? estimateCost(selection.model, selection.resolution, selection.duration) : null
  const needsConfirm = cost === null || cost >= CONFIRM_THRESHOLD_USD
  const currentKey = selection
    ? [
        selection.provider.id,
        selection.model.id,
        selection.aspect,
        selection.duration,
        selection.resolution,
        promptToSend,
      ].join('|')
    : ''
  const confirming = confirmKey !== null && confirmKey === currentKey

  let blocker: string | null = null
  if (providersQuery.isLoading) blocker = 'Loading providers…'
  else if (!selection) blocker = 'No video models are available yet.'
  else if (!selection.provider.configured)
    blocker = `${selection.provider.label} isn't configured on the server, so Generate is disabled.`
  else if (!promptToSend) blocker = 'Describe your video first.'

  function patchPrefs(patch: Partial<SelectionPrefs>) {
    setPrefs((p) => ({ ...p, ...patch }))
    setJustQueued(false)
  }

  function submit() {
    if (!selection || blocker) return
    createMutation.mutate({
      prompt: promptToSend,
      original_idea: usingImproved && idea.trim() ? idea.trim() : undefined,
      provider: selection.provider.id,
      model: selection.model.id,
      aspect_ratio: selection.aspect,
      duration_seconds: selection.duration,
      resolution: selection.resolution,
      research_sources: improved && improved.sources.length ? improved.sources : undefined,
    })
  }

  function onGenerateClick() {
    if (!selection || blocker) return
    setJustQueued(false)
    createMutation.reset()
    if (needsConfirm && !confirming) {
      setConfirmKey(currentKey)
      return
    }
    submit()
  }

  function onImprove() {
    if (!selection || !idea.trim()) return
    improveMutation.mutate({
      idea: idea.trim(),
      research,
      aspect_ratio: selection.aspect,
      duration_seconds: selection.duration,
    })
  }

  const costLine = selection
    ? `${cost !== null ? `≈ ${formatUsd(cost)}` : 'Cost unknown'} · ${selection.model.label} · ${selection.duration}s · ${selection.resolution}`
    : null

  return (
    <section className="space-y-6 rounded-lg border border-line bg-surface p-4 sm:p-6">
      {/* 1. Idea */}
      <div>
        <label htmlFor="video-idea" className="mb-2 block text-sm font-semibold text-ink">
          Describe your video
        </label>
        <textarea
          id="video-idea"
          value={idea}
          onChange={(e) => {
            setIdea(e.target.value)
            setJustQueued(false)
          }}
          rows={5}
          placeholder="e.g. A 15-second recap of Madrid's comeback win at the Bernabéu, night match, roaring crowd…"
          className={`${inputClass} resize-y`}
        />
      </div>

      {/* 2. Research + improve */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Switch
            checked={research}
            onChange={setResearch}
            label="Research on the web"
            hint="Ground the prompt in current facts"
          />
          <button
            type="button"
            onClick={onImprove}
            disabled={!idea.trim() || !selection || improveMutation.isPending}
            className="min-h-10 rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            {improveMutation.isPending
              ? research
                ? 'Researching…'
                : 'Improving…'
              : improved
                ? 'Improve again'
                : 'Improve prompt'}
          </button>
        </div>
        {improveMutation.isError && (
          <p role="alert" className="text-sm text-danger">
            {errText(improveMutation.error, 'Could not improve the prompt.')}
          </p>
        )}
        {!improved && !improveMutation.isPending && (
          <p className="text-xs text-faint">
            Optional — you can also generate straight from the text above.
          </p>
        )}
      </div>

      {improved && (
        <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="video-final" className="text-sm font-semibold text-ink">
              Final prompt
            </label>
            <button
              type="button"
              onClick={() => {
                setImproved(null)
                setFinalPrompt('')
                setConfirmKey(null)
              }}
              className="text-xs text-faint underline-offset-2 hover:text-ink hover:underline"
            >
              Discard · use my idea
            </button>
          </div>
          <textarea
            id="video-final"
            value={finalPrompt}
            onChange={(e) => {
              setFinalPrompt(e.target.value)
              setJustQueued(false)
            }}
            rows={8}
            className={`${inputClass} resize-y`}
          />
          {improved.research_notes && (
            <details className="group text-sm">
              <summary className="min-h-8 cursor-pointer py-1 font-medium text-muted hover:text-ink">
                Research notes
              </summary>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{improved.research_notes}</p>
            </details>
          )}
          {improved.sources.length > 0 && (
            <details className="text-sm">
              <summary className="min-h-8 cursor-pointer py-1 font-medium text-muted hover:text-ink">
                Sources ({improved.sources.length})
              </summary>
              <ul className="mt-1 space-y-1.5">
                {improved.sources.map((s) => (
                  <li key={s.url} className="min-w-0">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-accent hover:underline"
                    >
                      {s.title || s.url} <span aria-hidden>↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* 3. Provider / model / format */}
      <div className="border-t border-line pt-6">
        {providersQuery.isLoading && (
          <p className="text-sm text-faint">
            Loading providers… the server may take up to a minute to wake up.
          </p>
        )}
        {providersQuery.isError && (
          <div role="alert" className="space-y-2 text-sm">
            <p className="text-danger">{errText(providersQuery.error, 'Could not load providers.')}</p>
            <button
              type="button"
              onClick={() => providersQuery.refetch()}
              className="min-h-10 rounded-md border border-line-strong px-4 py-2 font-medium text-ink hover:bg-surface-2"
            >
              Try again
            </button>
          </div>
        )}
        {selection && (
          <ProviderPicker
            providers={providers}
            selection={selection}
            onChange={patchPrefs}
            disabled={createMutation.isPending}
          />
        )}
      </div>

      {/* 4. Cost + Generate */}
      <div className="space-y-3 border-t border-line pt-6">
        {costLine && (
          <div>
            <div className="text-lg font-semibold tracking-tight text-ink">{costLine}</div>
            <p className="mt-0.5 text-xs text-faint">
              {cost !== null
                ? 'Estimate based on provider list prices. Real money is spent when you generate.'
                : 'No price on file for this combination. Real money may be spent.'}
            </p>
          </div>
        )}

        {confirming ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
            <span className="min-w-0 flex-1 text-sm text-ink">
              {cost !== null ? `This will cost ≈ ${formatUsd(cost)} — confirm` : 'Cost unknown — confirm'}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={createMutation.isPending}
              className="min-h-10 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {createMutation.isPending ? 'Starting…' : 'Confirm & generate'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmKey(null)}
              disabled={createMutation.isPending}
              className="min-h-10 rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onGenerateClick}
            disabled={!!blocker || createMutation.isPending}
            className="min-h-11 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            {createMutation.isPending ? 'Starting…' : 'Generate video'}
          </button>
        )}

        {blocker && !confirming && <p className="text-sm text-muted">{blocker}</p>}
        {createMutation.isError && (
          <p role="alert" className="text-sm text-danger">
            {errText(createMutation.error, 'Could not start the generation.')}
          </p>
        )}
        {justQueued && (
          <p role="status" className="text-sm text-success">
            Queued — it will appear in Results and update automatically.
          </p>
        )}
      </div>
    </section>
  )
}
