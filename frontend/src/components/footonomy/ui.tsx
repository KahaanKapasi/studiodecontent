import type { ReactNode } from 'react'

export function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'bad' ? 'text-danger' : tone === 'good' ? 'text-success' : 'text-ink'
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-faint">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export const buttonClass =
  'rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50'
export const dangerButtonClass =
  'rounded-md border border-danger/50 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50'

export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString())
export const fmtPct = (n: number | null | undefined, digits = 1) => (n == null ? '—' : `${(n * 100).toFixed(digits)}%`)
export const fmtSeconds = (n: number | null | undefined) =>
  n == null ? '—' : n < 1 ? `${Math.round(n * 1000)} ms` : `${n.toFixed(2)} s`

export function fmtDuration(totalSeconds: number) {
  const d = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
      {error instanceof Error ? error.message : 'Something went wrong'}
    </p>
  )
}
