import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { footonomyApi, FootonomyApiError } from '../api/footonomy'
import ControlsTab from '../components/footonomy/ControlsTab'
import OverviewTab from '../components/footonomy/OverviewTab'
import UsersTab from '../components/footonomy/UsersTab'
import { buttonClass } from '../components/footonomy/ui'

const TABS = ['Overview', 'Users', 'Controls'] as const
type Tab = (typeof TABS)[number]

function Unavailable({ error, onRetry }: { error: FootonomyApiError | Error; onRetry: () => void }) {
  const notConfigured = error instanceof FootonomyApiError && error.status === 503
  return (
    <div className="max-w-xl rounded-lg border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">{notConfigured ? 'Connect Footonomy' : 'Footonomy is not reachable'}</h2>
      <p className="mt-2 text-sm text-muted">{error.message}</p>
      {notConfigured ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>On the Footonomy backend, set <code className="text-ink">ADMIN_TOKEN</code> to a long random value and restart it.</li>
          <li>In Studio's <code className="text-ink">.env</code>, set <code className="text-ink">FOOTONOMY_ADMIN_TOKEN</code> to the same value.</li>
          <li>Set <code className="text-ink">FOOTONOMY_ADMIN_URL</code> to the app's private admin port (default <code className="text-ink">http://127.0.0.1:8082</code>), then restart Studio.</li>
        </ol>
      ) : (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Is the Footonomy backend running with <code className="text-ink">ADMIN_TOKEN</code> set?</li>
          <li>Is <code className="text-ink">FOOTONOMY_ADMIN_URL</code> the admin port, reachable from this machine (same host, SSH tunnel or Tailscale)?</li>
        </ul>
      )}
      <button className={`${buttonClass} mt-4`} onClick={onRetry}>Try again</button>
    </div>
  )
}

export default function Footonomy() {
  const [tab, setTab] = useState<Tab>('Overview')
  const status = useQuery({ queryKey: ['footonomy', 'overview'], queryFn: footonomyApi.overview, retry: false, refetchInterval: 60_000 })

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">Footonomy</h1>
      <p className="mb-5 text-sm text-muted">Admin and analytics for the football app. Everything here goes through its private admin port.</p>

      {status.isError ? (
        <Unavailable error={status.error} onRetry={() => status.refetch()} />
      ) : (
        <>
          <div className="mb-6 flex gap-1 border-b border-line" role="tablist">
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'Overview' && <OverviewTab />}
          {tab === 'Users' && <UsersTab />}
          {tab === 'Controls' && <ControlsTab />}
        </>
      )}
    </div>
  )
}
