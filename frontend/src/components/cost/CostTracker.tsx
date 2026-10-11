import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { costsApi } from '../../api/client'
import CostLogDrawer from './CostLogDrawer'
import { onOpenCostLog } from './costLogStore'
import { usd } from './format'

interface Toast {
  id: number
  text: string
}

const POLL_MS = 10_000
const TOAST_MS = 6_000

/**
 * Global cost tracker: header pill with today/total spend, a cost-log drawer, and a toast whenever new paid
 * events appear. Synchronous actions are caught by subscribing to the mutation cache (any finished mutation
 * re-checks the totals); background jobs (Studio renders, video generation, Discovery topic generation) are caught
 * by a light 10 s poll that only runs while the tab is visible.
 */
export default function CostTracker() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const lastSeenId = useRef<number | null | undefined>(undefined) // undefined = first load, no toast
  const nextToastId = useRef(1)

  const { data: total, isError } = useQuery({
    queryKey: ['costs', 'total'],
    queryFn: costsApi.total,
    refetchInterval: () => (document.visibilityState === 'visible' ? POLL_MS : false),
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  })

  const pushToast = useCallback((text: string) => {
    const id = nextToastId.current++
    setToasts((list) => [...list.slice(-2), { id, text }])
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS)
  }, [])

  // New events since the last total we looked at -> one toast for the paid ones.
  useEffect(() => {
    if (!total) return
    const previous = lastSeenId.current
    lastSeenId.current = total.last_event_id
    if (previous === undefined || total.last_event_id === null || total.last_event_id === previous) return
    let cancelled = false
    costsApi
      .events({ limit: 20 })
      .then((events) => {
        if (cancelled) return
        const fresh = events.filter((e) => previous === null || e.id > previous).filter((e) => e.usd > 0)
        if (fresh.length === 0) return
        const spent = fresh.reduce((sum, e) => sum + e.usd, 0)
        const estimated = fresh.some((e) => e.is_estimate)
        const what = fresh.length === 1 ? fresh[0].label : `${fresh.length} actions`
        pushToast(
          `Spent ${estimated ? '≈ ' : ''}${usd(spent)} · ${what} — total today ${usd(total.today_usd)}`,
        )
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [total, pushToast])

  // Any finished mutation (success or error: a failed call can still have spent) re-checks the totals.
  useEffect(() => {
    let timer: number | undefined
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated') return
      const kind = event.action.type
      if (kind !== 'success' && kind !== 'error') return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['costs', 'total'] })
        queryClient.invalidateQueries({ queryKey: ['costs', 'events'] })
        queryClient.invalidateQueries({ queryKey: ['costs', 'summary'] })
      }, 400)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [queryClient])

  useEffect(() => onOpenCostLog(() => setOpen(true)), [])
  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={
          total
            ? `Cost tracker: today ${usd(total.today_usd)}, total ${usd(total.all_time_usd)}. Open cost log`
            : 'Cost tracker. Open cost log'
        }
        className="inline-flex h-8 min-w-[7.5rem] sm:min-w-[15rem] items-center justify-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-xs tabular-nums text-muted transition-colors hover:text-ink"
      >
        {isError ? (
          <span>Cost log</span>
        ) : total ? (
          <>
            <span>
              Today <span className="font-medium text-ink">{usd(total.today_usd)}</span>
            </span>
            <span className="hidden text-faint sm:inline" aria-hidden>
              ·
            </span>
            <span className="hidden sm:inline">
              Total <span className="font-medium text-ink">{total.any_estimates ? '≈ ' : ''}{usd(total.all_time_usd)}</span>
            </span>
          </>
        ) : (
          <span className="text-faint">Today —</span>
        )}
      </button>

      {open && <CostLogDrawer total={total} onClose={close} />}

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-end gap-2 md:bottom-6 md:right-6 md:left-auto"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setToasts((list) => list.filter((x) => x.id !== t.id))
              setOpen(true)
            }}
            className="pointer-events-auto max-w-sm rounded-lg border border-line-strong bg-surface px-3 py-2 text-left text-xs text-ink shadow-lg"
          >
            {t.text}
          </button>
        ))}
      </div>
    </>
  )
}
