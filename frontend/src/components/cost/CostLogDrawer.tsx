import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { costsApi } from '../../api/client'
import type { CostEvent, CostTotal } from '../../types'
import { usd } from './format'

const PAGE = 50
type Range = 'today' | '7d' | '30d' | 'all'
const RANGES: { id: Range; label: string; days?: number; total: (t: CostTotal) => number }[] = [
  { id: 'today', label: 'Today', days: 1, total: (t) => t.today_usd },
  { id: '7d', label: '7 days', days: 7, total: (t) => t.last_7d_usd },
  { id: '30d', label: '30 days', days: 30, total: (t) => t.last_30d_usd },
  { id: 'all', label: 'All', total: (t) => t.all_time_usd },
]

function amount(e: CostEvent): string {
  return `${e.is_estimate ? '≈ ' : ''}${usd(e.usd)}`
}

function when(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}

export default function CostLogDrawer({ total, onClose }: { total: CostTotal | undefined; onClose: () => void }) {
  const [range, setRange] = useState<Range>('today')
  const closeRef = useRef<HTMLButtonElement>(null)
  const days = RANGES.find((r) => r.id === range)?.days

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['costs', 'events', range],
    queryFn: ({ pageParam }) => costsApi.events({ limit: PAGE, before_id: pageParam, days }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].id : undefined),
  })
  const events = data?.pages.flat() ?? []

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Cost log"
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-xl border border-line bg-surface shadow-xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[26rem] md:rounded-none md:border-y-0 md:border-r-0"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Cost log</h2>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">
              {total ? `${total.any_estimates ? '≈ ' : ''}${usd(total.all_time_usd)}` : '—'}
              <span className="ml-2 text-xs font-normal text-faint">all time</span>
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close cost log"
            className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="flex flex-wrap gap-2 border-b border-line p-3" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              className={`min-h-8 rounded-full border px-3 text-xs transition-colors ${
                range === r.id
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line text-muted hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {r.label}
              {total && <span className="ml-1.5 tabular-nums">{usd(r.total(total))}</span>}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-xs text-faint">Loading…</p>}
          {isError && <p className="p-4 text-xs text-danger">Could not load the cost log.</p>}
          {!isLoading && !isError && events.length === 0 && (
            <p className="p-4 text-xs text-faint">Nothing spent in this range.</p>
          )}
          {events.length > 0 && (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-surface text-left text-faint">
                <tr>
                  <th className="px-4 py-2 font-medium">When / what</th>
                  <th className="px-2 py-2 text-right font-medium">Cost</th>
                  <th className="px-4 py-2 text-right font-medium">Running total</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-line align-top">
                    <td className="px-4 py-2">
                      <span className="block text-ink">{e.label}</span>
                      <span className="text-faint">{when(e.created_at)}</span>
                    </td>
                    <td
                      className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${e.usd > 0 ? 'text-ink' : 'text-faint'}`}
                      title={
                        e.is_estimate && e.est_low_usd !== null && e.est_high_usd !== null
                          ? `Estimated ${usd(e.est_low_usd)}–${usd(e.est_high_usd).replace('$', '')}`
                          : undefined
                      }
                    >
                      {amount(e)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-muted">
                      {usd(e.running_total_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {hasNextPage && (
            <div className="p-3">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="min-h-9 w-full rounded-md border border-line text-xs text-muted hover:bg-surface-2 disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading…' : 'Load older'}
              </button>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line p-3 text-xs text-faint">
          <span>≈ marks an estimate, not a measured amount.</span>
          <Link
            to="/dashboard?prices=1"
            onClick={onClose}
            className="shrink-0 font-medium text-accent hover:text-accent-hover"
          >
            Price table
          </Link>
        </footer>
      </aside>
    </div>
  )
}
