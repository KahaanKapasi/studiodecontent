import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { dashboardApi } from '../api/client'
import { API_BASE_URL, ENDPOINTS } from '../api/endpoints'

async function refreshInstagram(): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.dashboard.instagramRefresh}`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Instagram refresh failed (${res.status})`)
  }
  return res.json()
}

async function refreshTwitter(username: string): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.dashboard.twitterRefresh(username)}`, {
    method: 'POST',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Twitter refresh failed (${res.status})`)
  }
  return res.json()
}

const DUMMY_KPI_DATA = [
  { period: 'Jun', before: 8, after: 0 },
  { period: 'Jul', before: 10, after: 0 },
  { period: 'Aug', before: 9, after: 0 },
  { period: 'Sep', before: 0, after: 22 },
]

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [twitterHandle, setTwitterHandle] = useState('')

  const { data: igStats } = useQuery({
    queryKey: ['dashboard', 'instagram'],
    queryFn: dashboardApi.instagramLatest,
    retry: false,
  })
  const { data: twStats } = useQuery({
    queryKey: ['dashboard', 'twitter'],
    queryFn: dashboardApi.twitterLatest,
    retry: false,
  })
  const { data: kpiSummary } = useQuery({
    queryKey: ['dashboard', 'kpi-summary'],
    queryFn: dashboardApi.kpiSummary,
    retry: false,
  })
  const { data: suggestions = [] } = useQuery({
    queryKey: ['dashboard', 'twitter-suggestions'],
    queryFn: dashboardApi.twitterSuggestions,
    retry: false,
  })

  const postMutation = useMutation({
    mutationFn: (id: number) => dashboardApi.postSuggestion(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'twitter-suggestions'] }),
  })

  const generateMutation = useMutation({
    mutationFn: dashboardApi.generateTwitterSuggestions,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'twitter-suggestions'] }),
  })

  const igRefreshMutation = useMutation({
    mutationFn: refreshInstagram,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard', 'instagram'] }),
  })

  const twRefreshMutation = useMutation({
    mutationFn: () => refreshTwitter(twitterHandle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard', 'twitter'] }),
  })

  const chartData = DUMMY_KPI_DATA

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">Dashboard</h1>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Instagram</h2>
          <button
            onClick={() => igRefreshMutation.mutate()}
            disabled={igRefreshMutation.isPending}
            className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            {igRefreshMutation.isPending ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {igRefreshMutation.isError && (
          <p className="mb-2 text-xs text-faint">{(igRefreshMutation.error as Error).message}</p>
        )}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="IG Followers" value={String(igStats?.followers ?? 0)} />
          <StatCard label="IG Reach (30d)" value={String(igStats?.reach_30d ?? 0)} />
          <StatCard
            label="IG Engagement"
            value={`${((igStats?.engagement_rate ?? 0) * 100).toFixed(1)}%`}
          />
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">X (Twitter)</h2>
          <div className="flex items-center gap-2">
            <input
              value={twitterHandle}
              onChange={(e) => setTwitterHandle(e.target.value)}
              placeholder="handle (no @)"
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-faint"
            />
            <button
              onClick={() => twRefreshMutation.mutate()}
              disabled={twRefreshMutation.isPending || !twitterHandle.trim()}
              className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
            >
              {twRefreshMutation.isPending ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {twRefreshMutation.isError && (
          <p className="mb-2 text-xs text-faint">{(twRefreshMutation.error as Error).message}</p>
        )}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="X Followers" value={String(twStats?.followers ?? 0)} />
          <StatCard label="X Impressions (30d)" value={String(twStats?.impressions_30d ?? 0)} />
          <StatCard
            label="X Engagement"
            value={`${((twStats?.engagement_rate ?? 0) * 100).toFixed(1)}%`}
          />
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink">
          Posting cadence — before vs. after Studio adoption
        </h2>
        <p className="mb-4 text-xs text-faint">
          Dummy chart data — a real before/after time series needs a manual pre-Studio baseline
          entry, an open item per 05_Dashboard_Analytics.md. Since-adoption counts tracked so far:{' '}
          {kpiSummary
            ? `${kpiSummary.since_studio_adoption.articles_published} articles, ${kpiSummary.since_studio_adoption.posts_published} posts.`
            : 'backend not reachable.'}
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-color)" />
            <XAxis dataKey="period" stroke="var(--faint-color)" fontSize={12} />
            <YAxis stroke="var(--faint-color)" fontSize={12} />
            <Tooltip
              contentStyle={{
                background: 'var(--surface-bg)',
                border: '1px solid var(--line-color)',
                fontSize: 12,
                color: 'var(--ink-color)',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-color)' }} />
            <Bar dataKey="before" fill="var(--faint-color)" name="Before" radius={[4, 4, 0, 0]} />
            <Bar dataKey="after" fill="var(--accent-color)" name="After" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Twitter Post Suggestions</h2>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            {generateMutation.isPending ? 'Generating…' : 'Generate suggestions'}
          </button>
        </div>
        {suggestions.length === 0 && (
          <p className="text-xs text-faint">No suggestions yet — backend not wired.</p>
        )}
        <ul className="space-y-2">
          {suggestions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-md border border-line bg-app px-3 py-2"
            >
              <span className="text-sm text-muted">{s.draft_text}</span>
              <button
                onClick={() => postMutation.mutate(s.id)}
                disabled={postMutation.isPending || s.status !== 'suggested'}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
              >
                {s.status === 'posted' ? 'Posted' : 'Post'}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
