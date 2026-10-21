import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { footonomyApi } from '../../api/footonomy'
import { buttonClass, Empty, ErrorNote, fmtDuration, fmtInt, fmtPct, fmtSeconds, Section, StatCard } from './ui'

const AXIS = { fontSize: 11, fill: 'var(--color-faint)' }
const TOOLTIP = {
  contentStyle: { background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: 'var(--color-muted)' },
}

function DailyChart({ title, points, color }: { title: string; points: { date: string; count: number }[]; color: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 text-xs uppercase tracking-wide text-faint">{title}</div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ left: -20, right: 4, top: 4 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="date" tick={AXIS} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip {...TOOLTIP} cursor={{ fill: 'var(--color-surface-2)' }} />
            <Bar dataKey="count" name={title} fill={color} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function HistoryChart({ title, data, dataKey, color, format }: {
  title: string
  data: Record<string, unknown>[]
  dataKey: string
  color: string
  format: (n: number) => string
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 text-xs uppercase tracking-wide text-faint">{title}</div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -10, right: 8, top: 4 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="t" tick={AXIS} minTickGap={32} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} tickFormatter={format} axisLine={false} tickLine={false} width={48} />
            <Tooltip {...TOOLTIP} formatter={(v) => format(Number(v))} />
            <Line type="monotone" dataKey={dataKey} name={title} stroke={color} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function OverviewTab() {
  const [days, setDays] = useState(30)
  const overview = useQuery({ queryKey: ['footonomy', 'overview'], queryFn: footonomyApi.overview, retry: false, refetchInterval: 60_000 })
  const daily = useQuery({ queryKey: ['footonomy', 'daily', days], queryFn: () => footonomyApi.daily(days), retry: false })
  const history = useQuery({ queryKey: ['footonomy', 'history'], queryFn: () => footonomyApi.history(72), retry: false })
  const top = useQuery({ queryKey: ['footonomy', 'top-follows'], queryFn: footonomyApi.topFollows, retry: false })
  const reacted = useQuery({ queryKey: ['footonomy', 'reactions'], queryFn: footonomyApi.reactions, retry: false })

  if (overview.isError) return <ErrorNote error={overview.error} />
  const o = overview.data
  const sys = o?.system
  const errorRate = sys?.http.errorRate ?? 0
  const hist = (history.data ?? []).map((h) => ({
    t: new Date(h.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    p95: h.p95_seconds,
    cache: h.cache_hit_ratio,
    ws: h.websocket_sessions,
  }))

  return (
    <div>
      <Section
        title="People"
        action={
          <button className={buttonClass} onClick={() => overview.refetch()} disabled={overview.isFetching}>
            {overview.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Users" value={fmtInt(o?.users.total)} hint={`${fmtInt(o?.users.suspended)} suspended`} />
          <StatCard label="New (7 days)" value={fmtInt(o?.users.new7d)} hint={`${fmtInt(o?.users.new24h)} in last 24h`} />
          <StatCard label="Follow something" value={fmtInt(o?.users.followingAnything)} hint={o && o.users.total ? fmtPct(o.users.followingAnything / o.users.total, 0) + ' of users' : undefined} />
          <StatCard label="Follows" value={fmtInt(o?.follows.total)} hint={`${fmtInt(o?.follows.teams)} ${o?.follows.teams === 1 ? 'team' : 'teams'} · ${fmtInt(o?.follows.tournaments)} ${o?.follows.tournaments === 1 ? 'league' : 'leagues'}`} />
          <StatCard label="Reactions" value={fmtInt(o?.reactions.total)} />
          <StatCard label="Sign-in codes (24h)" value={fmtInt(o?.signInCodesLast24h)} />
        </div>
      </Section>

      <Section
        title="Growth"
        action={
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={`${buttonClass} ${days === d ? 'bg-surface-2' : ''}`}>
                {d}d
              </button>
            ))}
          </div>
        }
      >
        {daily.isError ? <ErrorNote error={daily.error} /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            <DailyChart title="Sign-ups per day" points={daily.data?.signups ?? []} color="var(--color-accent)" />
            <DailyChart title="Follows per day" points={daily.data?.follows ?? []} color="var(--color-success)" />
          </div>
        )}
      </Section>

      <Section title="App health (since last restart)">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Requests" value={fmtInt(sys?.http.requestsTotal)} hint={`avg ${fmtSeconds(sys?.http.meanSeconds)}`} />
          <StatCard label="Server errors" value={fmtPct(errorRate, 2)} tone={errorRate > 0.02 ? 'bad' : 'good'} hint={`${fmtInt(sys?.http.errors5xxTotal)} responses`} />
          <StatCard label="p95 latency" value={fmtSeconds(sys?.http.p95Seconds)} tone={(sys?.http.p95Seconds ?? 0) > 1 ? 'bad' : undefined} hint="upper bound" />
          <StatCard label="Data cache hit rate" value={fmtPct(sys?.upstream.cacheHitRatio, 0)} tone={sys?.upstream.cacheHitRatio != null && sys.upstream.cacheHitRatio < 0.7 ? 'bad' : undefined} hint={`${fmtInt(sys?.upstream.failures)} upstream failures`} />
          <StatCard label="Live connections" value={fmtInt(sys?.websocketSessions)} hint={`${fmtInt(sys?.liveUpdatesBroadcast)} updates sent`} />
          <StatCard label="Request threads" value={`${fmtInt(sys?.tomcatThreadsBusy)} / ${fmtInt(sys?.tomcatThreadsMax)}`} />
          <StatCard label="Memory" value={fmtPct(sys?.heapUsedRatio, 0)} />
          <StatCard label="Uptime" value={sys ? fmtDuration(sys.uptimeSeconds) : '—'} />
        </div>
        {hist.length > 1 ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <HistoryChart title="p95 latency" data={hist} dataKey="p95" color="var(--color-accent)" format={(n) => fmtSeconds(n)} />
            <HistoryChart title="Cache hit rate" data={hist} dataKey="cache" color="var(--color-success)" format={(n) => fmtPct(n, 0)} />
            <HistoryChart title="Live connections" data={hist} dataKey="ws" color="var(--color-muted)" format={(n) => fmtInt(n)} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">History charts fill in as this page is used (one snapshot every 5 minutes, kept by Studio).</p>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Most followed">
          {top.isError ? <ErrorNote error={top.error} /> : (top.data ?? []).length === 0 ? <Empty>Nobody follows anything yet.</Empty> : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {(top.data ?? []).map((t) => (
                <li key={`${t.type}-${t.id}`} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-ink">{t.name} <span className="text-xs text-faint">{t.type}</span></span>
                  <span className="text-muted">{fmtInt(t.followers)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Most reacted matches">
          {reacted.isError ? <ErrorNote error={reacted.error} /> : (reacted.data ?? []).length === 0 ? <Empty>No reactions yet.</Empty> : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {(reacted.data ?? []).map((m) => (
                <li key={m.matchId} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-ink">Match {m.matchId}</span>
                  <span className="text-muted">{fmtInt(m.total)} <span className="text-xs text-faint">({m.fire}F · {m.love}L · {m.wow}W)</span></span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}
