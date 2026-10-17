import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { discoveryApi } from '../api/client'
import TopicList from '../components/TopicList'
import WorkspaceSwitcher from '../components/WorkspaceSwitcher'
import { useWorkspace, type WorkspaceId } from '../workspace'
import CostedButton from '../components/cost/CostedButton'
import type { DiscoveryRun, ScrapeResponse, SourceHealth, SuitableFor, TopicCandidate, TopicStatus } from '../types'

export default function Discovery() {
  const [workspace] = useWorkspace()
  // Remounting per workspace resets the run/progress state, so each workspace shows only its own scrape.
  return <DiscoveryWorkspace key={workspace} workspace={workspace} />
}

function DiscoveryWorkspace({ workspace }: { workspace: WorkspaceId }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<TopicStatus | 'all'>('all')
  const [suitableFilter, setSuitableFilter] = useState<SuitableFor | 'all'>('all')

  const { data: topics = [], isLoading, isError } = useQuery({
    queryKey: ['discovery', 'topics', workspace],
    queryFn: () => discoveryApi.listTopics({ workspace }),
  })

  // Collection returns in a few seconds; topic generation continues server-side and is polled via the run.
  const [startedRunId, setRunId] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [first, setFirst] = useState<ScrapeResponse | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const scrapeMutation = useMutation({
    mutationFn: () => discoveryApi.triggerScrape(workspace),
    onMutate: () => setStartedAt(Date.now()),
    onSuccess: (res) => {
      setFirst(res)
      setRunId(res.run_id)
      if (res.status !== 'generating') queryClient.invalidateQueries({ queryKey: ['discovery', 'topics'] })
    },
  })

  // After a reload, pick a still-running generation back up.
  const { data: latest, dataUpdatedAt: latestAt } = useQuery({
    queryKey: ['discovery', 'run', 'latest', workspace],
    queryFn: () => discoveryApi.latestRun(workspace),
    staleTime: Infinity,
  })
  const resumed = startedRunId === null && latest?.status === 'generating' ? latest : null
  const runId = startedRunId ?? resumed?.id ?? null
  const startedAtMs = startedAt ?? (resumed ? latestAt - resumed.elapsed_seconds * 1000 : null)

  const { data: run } = useQuery({
    queryKey: ['discovery', 'run', runId],
    queryFn: () => discoveryApi.run(runId as number),
    enabled: runId !== null && first?.status !== 'skipped' && first?.status !== 'error',
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'generating' ? false : 2000),
    refetchOnWindowFocus: false,
  })

  const status = run?.status ?? first?.status
  const generating = status === 'generating'

  useEffect(() => {
    if (!generating) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [generating])

  useEffect(() => {
    if (run && run.status !== 'generating') {
      queryClient.invalidateQueries({ queryKey: ['discovery', 'topics'] })
      queryClient.invalidateQueries({ queryKey: ['costs'] }) // background spend: toast right away
    }
  }, [run, queryClient])

  const sourceHealth: SourceHealth[] = run?.source_health?.length ? run.source_health : (first?.source_health ?? [])
  const elapsed = generating
    ? Math.max(0, Math.round((now - (startedAtMs ?? now)) / 1000))
    : Math.round(run?.elapsed_seconds ?? 0)

  const filtered = useMemo(() => {
    return topics.filter((topic) => {
      if (statusFilter !== 'all' && topic.status !== statusFilter) return false
      if (suitableFilter !== 'all' && topic.suitable_for !== suitableFilter) return false
      return true
    })
  }, [topics, statusFilter, suitableFilter])

  function handleSelect(topic: TopicCandidate) {
    // TODO: cross-navigation param shape (e.g. /articles?topicId= vs /articles/:topicId)
    // depends on how the Articles screen ends up keying off topic_id once the backend
    // generation endpoint is finalized. For now just route toward the right pipeline.
    if (topic.suitable_for === 'article' || topic.suitable_for === 'both') {
      navigate('/articles', { state: { topicId: topic.id } })
    } else {
      navigate('/video', { state: { topicId: topic.id } })
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Discovery</h1>
          <p className="mt-1 text-sm text-faint">Topic candidates surfaced from scraping.</p>
          <WorkspaceSwitcher />
        </div>
        <CostedButton
          action="discovery.scrape"
          onClick={() => scrapeMutation.mutate()}
          disabled={scrapeMutation.isPending || generating}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {scrapeMutation.isPending ? 'Collecting…' : generating ? 'Generating…' : 'Trigger scrape now'}
        </CostedButton>
      </div>

      <ScrapeStatus
        pending={scrapeMutation.isPending}
        error={scrapeMutation.isError ? scrapeMutation.error.message : null}
        status={status}
        first={first}
        run={run}
        sourceHealth={sourceHealth}
        elapsed={elapsed}
      />

      <div className="mb-4 flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TopicStatus | 'all')}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="selected">Selected</option>
          <option value="discarded">Discarded</option>
        </select>
        <select
          value={suitableFilter}
          onChange={(e) => setSuitableFilter(e.target.value as SuitableFor | 'all')}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
        >
          <option value="all">All types</option>
          <option value="article">Article</option>
          <option value="video">Video</option>
          <option value="both">Both</option>
        </select>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {isLoading && <p className="py-8 text-center text-sm text-faint">Loading topics…</p>}
        {isError && (
          <p className="py-8 text-center text-sm text-faint">
            Could not reach backend at /api/discovery/topics. Is it running?
          </p>
        )}
        {!isLoading && !isError && <TopicList topics={filtered} onSelect={handleSelect} />}
      </div>
    </div>
  )
}

function ScrapeStatus({
  pending,
  error,
  status,
  first,
  run,
  sourceHealth,
  elapsed,
}: {
  pending: boolean
  error: string | null
  status: DiscoveryRun['status'] | undefined
  first: ScrapeResponse | null
  run: DiscoveryRun | undefined
  sourceHealth: SourceHealth[]
  elapsed: number
}) {
  if (!pending && !error && !status) return null
  const newItems = run?.new_items ?? first?.new_items ?? 0
  const failed = sourceHealth.filter((h) => !h.ok)
  const working = sourceHealth.filter((h) => h.ok).length

  let line: string
  let tone = 'text-muted'
  if (pending) line = 'Collecting from sources…'
  else if (error) {
    line = error
    tone = 'text-danger'
  } else if (status === 'generating') line = `Generating topics from ${newItems} new items… ${elapsed}s`
  else if (status === 'skipped') line = first?.message ?? 'No new items since the last scrape, so nothing was generated (cost $0).'
  else if (status === 'error') {
    line = `Topic generation failed: ${run?.error ?? first?.error ?? 'unknown error'}`
    tone = 'text-danger'
  } else line = `Done in ${elapsed}s: ${run?.topics_created ?? 0} topics from ${newItems} new items.`

  return (
    <section className="mb-4 rounded-lg border border-line bg-surface p-3" aria-label="Scrape status">
      <p className={`flex items-center gap-2 text-sm ${tone}`} role="status" aria-live="polite">
        {(pending || status === 'generating') && (
          <span className="inline-block size-3 animate-spin rounded-full border-2 border-line-strong border-t-accent" aria-hidden />
        )}
        {line}
      </p>
      {sourceHealth.length > 0 && (
        <details className="mt-2 text-xs text-faint">
          <summary className="cursor-pointer select-none">
            {working} of {sourceHealth.length} sources ok{failed.length > 0 && `, ${failed.length} failed`}
          </summary>
          <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {sourceHealth.map((h) => (
              <li key={h.source} className="flex justify-between gap-2">
                <span className={h.ok ? 'text-muted' : 'text-danger'}>{h.source}</span>
                <span className="tabular-nums" title={h.error ?? undefined}>
                  {h.ok ? `${h.item_count} items` : 'failed'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
