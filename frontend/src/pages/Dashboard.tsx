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
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-100">{value}</div>
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
      <h1 className="mb-6 text-xl font-semibold text-neutral-100">Dashboard</h1>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-200">Instagram</h2>
          <button
            onClick={() => igRefreshMutation.mutate()}
            disabled={igRefreshMutation.isPending}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            {igRefreshMutation.isPending ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {igRefreshMutation.isError && (
          <p className="mb-2 text-xs text-neutral-500">{(igRefreshMutation.error as Error).message}</p>
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
          <h2 className="text-sm font-semibold text-neutral-200">X (Twitter)</h2>
          <div className="flex items-center gap-2">
            <input
              value={twitterHandle}
              onChange={(e) => setTwitterHandle(e.target.value)}
              placeholder="handle (no @)"
              className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600"
            />
            <button
              onClick={() => twRefreshMutation.mutate()}
              disabled={twRefreshMutation.isPending || !twitterHandle.trim()}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              {twRefreshMutation.isPending ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {twRefreshMutation.isError && (
          <p className="mb-2 text-xs text-neutral-500">{(twRefreshMutation.error as Error).message}</p>
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

      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="mb-1 text-sm font-semibold text-neutral-200">
          Posting cadence — before vs. after Studio adoption
        </h2>
        <p className="mb-4 text-xs text-neutral-500">
          Dummy chart data — a real before/after time series needs a manual pre-Studio baseline
          entry, an open item per 05_Dashboard_Analytics.md. Since-adoption counts tracked so far:{' '}
          {kpiSummary
            ? `${kpiSummary.since_studio_adoption.articles_published} articles, ${kpiSummary.since_studio_adoption.posts_published} posts.`
            : 'backend not reachable.'}
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis dataKey="period" stroke="#a3a3a3" fontSize={12} />
            <YAxis stroke="#a3a3a3" fontSize={12} />
            <Tooltip
              contentStyle={{ background: '#171717', border: '1px solid #262626', fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="before" fill="#525252" name="Before" radius={[4, 4, 0, 0]} />
            <Bar dataKey="after" fill="#f59e0b" name="After" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-200">Twitter Post Suggestions</h2>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            {generateMutation.isPending ? 'Generating…' : 'Generate suggestions'}
          </button>
        </div>
        {suggestions.length === 0 && (
          <p className="text-xs text-neutral-500">No suggestions yet — backend not wired.</p>
        )}
        <ul className="space-y-2">
          {suggestions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2"
            >
              <span className="text-sm text-neutral-300">{s.draft_text}</span>
              <button
                onClick={() => postMutation.mutate(s.id)}
                disabled={postMutation.isPending || s.status !== 'suggested'}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
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
