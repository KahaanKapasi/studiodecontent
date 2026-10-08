import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { costsApi } from '../../api/client'
import type { PriceRow } from '../../types'
import { usd } from './format'

const SERVICE_LABELS: Record<string, string> = {
  gemini: 'Gemini (text, images, speech)',
  veo: 'Google Veo',
  muapi: 'Muapi',
  higgsfield: 'Higgsfield',
  x: 'X API',
  studio: 'Video Studio',
  video: 'Video generation',
  other: 'Other',
}

function priceText(p: PriceRow): string {
  if (p.usd === null) return `${usd(p.low_usd ?? 0)}–${usd(p.high_usd ?? 0).replace('$', '')}`
  return p.usd === 0 ? 'Free' : usd(p.usd)
}

function PriceTable() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['costs', 'prices'],
    queryFn: costsApi.prices,
    staleTime: 10 * 60_000,
  })
  if (isLoading) return <p className="text-xs text-faint">Loading prices…</p>
  if (isError || !data) return <p className="text-xs text-faint">Could not load the price table.</p>
  return (
    <div className="max-h-80 overflow-auto rounded-md border border-line">
      <table className="w-full min-w-[32rem] border-collapse text-xs">
        <thead className="sticky top-0 bg-surface-2 text-left text-faint">
          <tr>
            <th className="px-2 py-1.5 font-medium">Price</th>
            <th className="px-2 py-1.5 font-medium">USD / unit</th>
            <th className="px-2 py-1.5 font-medium">Confidence</th>
            <th className="px-2 py-1.5 font-medium">Verified</th>
          </tr>
        </thead>
        <tbody>
          {data.prices.map((p) => (
            <tr key={p.id} className="border-t border-line align-top">
              <td className="px-2 py-1.5 text-ink">
                <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {p.id}
                </a>
                {p.note && <span className="block text-faint">{p.note}</span>}
              </td>
              <td className="px-2 py-1.5 tabular-nums text-muted">
                {priceText(p)} <span className="text-faint">/ {p.unit}</span>
                {p.upcoming.map((u) => (
                  <span key={u.effective_from} className="block text-faint">
                    from {u.effective_from}: {u.usd === null ? '—' : usd(u.usd)}
                  </span>
                ))}
              </td>
              <td className={`px-2 py-1.5 ${p.confidence === 'unknown' ? 'text-danger' : 'text-muted'}`}>
                {p.confidence}
              </td>
              <td className="px-2 py-1.5 tabular-nums text-muted">{p.verified_on}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SpendCard() {
  const [showPrices, setShowPrices] = useState(false)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['costs', 'summary', 30],
    queryFn: () => costsApi.summary(30),
    staleTime: 30_000,
    retry: false,
  })

  const max = Math.max(0, ...(data?.by_service.map((s) => s.usd) ?? []))

  return (
    <section className="mb-6 rounded-lg border border-line bg-surface p-4" aria-label="Spend">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Spend · last 30 days</h2>
        <button
          type="button"
          onClick={() => setShowPrices((v) => !v)}
          aria-expanded={showPrices}
          className="min-h-8 text-xs font-medium text-accent hover:text-accent-hover"
        >
          {showPrices ? 'Hide price table' : 'Price table & verified dates'}
        </button>
      </div>

      {isLoading && <p className="text-xs text-faint">Loading spend…</p>}
      {isError && <p className="text-xs text-faint">Spend is not available right now.</p>}

      {data && (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr_1fr] sm:items-center">
          <div>
            <div className="text-2xl font-semibold tabular-nums tracking-tight text-ink">{usd(data.total_usd)}</div>
            <p className="text-xs text-faint">
              {data.event_count} paid {data.event_count === 1 ? 'action' : 'actions'}
              {data.estimated_usd > 0 && ` · ${usd(data.estimated_usd)} is estimated`}
            </p>
          </div>

          <div className="space-y-1.5">
            {data.by_service.length === 0 && <p className="text-xs text-faint">Nothing spent yet.</p>}
            {data.by_service.map((s) => (
              <div key={s.service}>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">{SERVICE_LABELS[s.service] ?? s.service}</span>
                  <span className="tabular-nums text-ink">{usd(s.usd)}</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-surface-2">
                  <div
                    className="h-1.5 rounded-full bg-accent"
                    style={{ width: `${max > 0 ? Math.max(4, (s.usd / max) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="h-20 min-w-0" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" hide />
                <Tooltip
                  formatter={(v) => [usd(Number(v)), 'Spend']}
                  contentStyle={{
                    background: 'var(--surface-bg)',
                    border: '1px solid var(--line-color)',
                    fontSize: 12,
                    color: 'var(--ink-color)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="usd"
                  stroke="var(--accent-color)"
                  fill="var(--accent-color)"
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {showPrices && (
        <div className="mt-4">
          <PriceTable />
          <p className="mt-2 text-xs text-faint">
            Estimates come from this table, not from your bills. Gemini text, speech and grounding prices double on
            2027-01-01.
          </p>
        </div>
      )}
    </section>
  )
}
