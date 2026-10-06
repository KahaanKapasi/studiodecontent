import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { videoApi } from '../../api/client'
import type { VideoGeneration } from '../../types'
import { GENERATIONS_KEY } from './keys'
import GenerationCard from './GenerationCard'
import { isPending, isPendingStatus } from './format'

const POLL_MS = 4000

/** True once `active` has stayed true for `ms` — used to explain cold starts instead of erroring. */
function useSlow(active: boolean, ms = 6000) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setSlow(true), ms)
    return () => {
      clearTimeout(t)
      setSlow(false)
    }
  }, [active, ms])
  return slow
}

function errText(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback
}

export default function GenerationGallery() {
  const queryClient = useQueryClient()
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({})

  const listQuery = useQuery({
    queryKey: GENERATIONS_KEY,
    queryFn: () => videoApi.listGenerations(),
  })
  const items = listQuery.data
  const slow = useSlow(listQuery.isLoading)

  // Poll each non-terminal item individually: GET /generations/{id} reconciles with the provider.
  // react-query pauses refetchInterval in hidden tabs by default, and the interval stops itself
  // once an item reaches a terminal status (and so drops out of `pendingIds`).
  const pendingIds = (items ?? []).filter(isPending).map((g) => g.id)
  const polls = useQueries({
    queries: pendingIds.map((id) => ({
      queryKey: ['video', 'generation', id],
      queryFn: () => videoApi.getGeneration(id),
      refetchInterval: (q: { state: { data?: VideoGeneration } }) =>
        q.state.data && !isPendingStatus(q.state.data.status) ? false : POLL_MS,
      refetchIntervalInBackground: false,
      staleTime: 0,
    })),
  })

  // Merge fresh poll results back into the list cache.
  const merged = useRef('')
  useEffect(() => {
    const fresh = polls.map((p) => p.data).filter((d): d is VideoGeneration => !!d)
    const sig = fresh.map((g) => `${g.id}:${g.status}:${g.has_file}:${g.video_url ?? ''}:${g.error ?? ''}`).join('|')
    if (!sig || sig === merged.current) return
    merged.current = sig
    queryClient.setQueryData<VideoGeneration[]>(GENERATIONS_KEY, (old) =>
      old?.map((g) => fresh.find((f) => f.id === g.id) ?? g),
    )
  }, [polls, queryClient])

  const setError = (id: number, msg: string | null) =>
    setActionErrors((prev) => {
      const next = { ...prev }
      if (msg) next[id] = msg
      else delete next[id]
      return next
    })

  const retryMutation = useMutation({
    mutationFn: (id: number) => videoApi.retryGeneration(id),
    onMutate: (id) => setError(id, null),
    onSuccess: (created) => {
      queryClient.setQueryData<VideoGeneration[]>(GENERATIONS_KEY, (old) => [
        created,
        ...(old ?? []).filter((g) => g.id !== created.id),
      ])
      queryClient.invalidateQueries({ queryKey: GENERATIONS_KEY })
    },
    onError: (e, id) => setError(id, errText(e, 'Could not retry.')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => videoApi.deleteGeneration(id),
    onMutate: (id) => setError(id, null),
    onSuccess: (_void, id) => {
      queryClient.setQueryData<VideoGeneration[]>(GENERATIONS_KEY, (old) =>
        old?.filter((g) => g.id !== id),
      )
      queryClient.removeQueries({ queryKey: ['video', 'generation', id] })
    },
    onError: (e, id) => setError(id, errText(e, 'Could not delete.')),
  })

  return (
    <section aria-labelledby="video-results-heading" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="video-results-heading" className="text-sm font-semibold uppercase tracking-wide text-faint">
          Results
        </h2>
        {items && items.length > 0 && (
          <span className="text-xs text-faint">
            {items.length} video{items.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {listQuery.isLoading && (
        <div className="rounded-lg border border-line bg-surface p-6 text-sm text-faint">
          {slow
            ? 'Waking up the server — this can take up to a minute the first time…'
            : 'Loading your videos…'}
        </div>
      )}

      {listQuery.isError && (
        <div role="alert" className="space-y-3 rounded-lg border border-line bg-surface p-6 text-sm">
          <p className="text-danger">{errText(listQuery.error, 'Could not load your videos.')}</p>
          <button
            type="button"
            onClick={() => listQuery.refetch()}
            className="min-h-10 rounded-md border border-line-strong px-4 py-2 font-medium text-ink hover:bg-surface-2"
          >
            Try again
          </button>
        </div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">No videos yet</p>
          <p className="mt-1 text-sm text-faint">
            Describe a video and hit Generate — finished clips will show up here.
          </p>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-4">
          {items.map((gen) => (
            <li key={gen.id}>
              <GenerationCard
                gen={gen}
                onRetry={(id) => retryMutation.mutate(id)}
                onDelete={(id) => deleteMutation.mutate(id)}
                retrying={retryMutation.isPending && retryMutation.variables === gen.id}
                deleting={deleteMutation.isPending && deleteMutation.variables === gen.id}
                actionError={actionErrors[gen.id]}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
