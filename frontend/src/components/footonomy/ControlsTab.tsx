import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { footonomyApi, type Flag } from '../../api/footonomy'
import { buttonClass, dangerButtonClass, Empty, ErrorNote, fmtInt, Section } from './ui'

const SWITCHES: { key: string; title: string; help: string }[] = [
  { key: 'signups', title: 'New sign-ups', help: 'Off: people who already have an account can still sign in, new emails are turned away.' },
  { key: 'reactions', title: 'Match reactions', help: 'Off: the reaction buttons disappear and the endpoint refuses new reactions.' },
  { key: 'live_updates', title: 'Live score updates', help: 'Off: the server stops pushing live changes (pages still load, just no push).' },
]

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-accent' : 'bg-surface-2 border border-line-strong'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

function BannerEditor({ flag }: { flag: Flag | undefined }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  useEffect(() => setText(flag?.text ?? ''), [flag?.text])
  const save = useMutation({
    mutationFn: (enabled: boolean) => footonomyApi.setFlag('maintenance_banner', enabled, text.trim() || null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['footonomy', 'flags'] }),
  })
  const showing = !!flag?.enabled && !!flag.text
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">Site-wide banner</div>
          <div className="text-xs text-muted">A message shown at the top of every page, e.g. planned maintenance.</div>
        </div>
        <span className={`text-xs ${showing ? 'text-success' : 'text-faint'}`}>{showing ? 'Showing' : 'Hidden'}</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        rows={2}
        aria-label="Banner message"
        placeholder="Message for visitors"
        className="mt-3 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />
      <div className="mt-2 flex gap-2">
        <button className={buttonClass} disabled={save.isPending || !text.trim()} onClick={() => save.mutate(true)}>Publish banner</button>
        <button className={buttonClass} disabled={save.isPending || !showing} onClick={() => save.mutate(false)}>Hide banner</button>
      </div>
      {save.isError && <div className="mt-2"><ErrorNote error={save.error} /></div>}
    </div>
  )
}

export default function ControlsTab() {
  const queryClient = useQueryClient()
  const flags = useQuery({ queryKey: ['footonomy', 'flags'], queryFn: footonomyApi.flags, retry: false })
  const reacted = useQuery({ queryKey: ['footonomy', 'reactions'], queryFn: footonomyApi.reactions, retry: false })
  const audit = useQuery({ queryKey: ['footonomy', 'audit'], queryFn: footonomyApi.audit, retry: false })

  const setFlag = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => footonomyApi.setFlag(key, enabled, null),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['footonomy', 'flags'] }); queryClient.invalidateQueries({ queryKey: ['footonomy', 'audit'] }) },
  })
  const reset = useMutation({
    mutationFn: (matchId: string) => footonomyApi.resetReactions(matchId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['footonomy', 'reactions'] }); queryClient.invalidateQueries({ queryKey: ['footonomy', 'audit'] }) },
  })
  const flush = useMutation({
    mutationFn: footonomyApi.flushCache,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['footonomy', 'audit'] }),
  })
  const [confirmReset, setConfirmReset] = useState<string | null>(null)

  const byKey = new Map((flags.data ?? []).map((f) => [f.key, f]))

  return (
    <div>
      <Section title="Feature switches">
        {flags.isError && <ErrorNote error={flags.error} />}
        <div className="space-y-3">
          {SWITCHES.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface p-4">
              <div>
                <div className="text-sm font-medium text-ink">{s.title}</div>
                <div className="text-xs text-muted">{s.help}</div>
              </div>
              <Toggle label={s.title} on={byKey.get(s.key)?.enabled ?? true} disabled={!flags.data || setFlag.isPending} onChange={(enabled) => setFlag.mutate({ key: s.key, enabled })} />
            </div>
          ))}
          <BannerEditor flag={byKey.get('maintenance_banner')} />
        </div>
        {setFlag.isError && <div className="mt-2"><ErrorNote error={setFlag.error} /></div>}
        <p className="mt-2 text-xs text-faint">Changes reach visitors within a couple of minutes (the site checks every 2 minutes).</p>
      </Section>

      <Section title="Moderation: reactions">
        {reacted.isError ? <ErrorNote error={reacted.error} /> : (reacted.data ?? []).length === 0 ? <Empty>No reactions to review.</Empty> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {(reacted.data ?? []).map((m) => (
              <li key={m.matchId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="text-ink">Match {m.matchId} <span className="text-xs text-faint">{fmtInt(m.total)} total ({m.fire}F · {m.love}L · {m.wow}W)</span></span>
                {confirmReset === m.matchId ? (
                  <span className="flex gap-2">
                    <button className={dangerButtonClass} disabled={reset.isPending} onClick={() => { reset.mutate(m.matchId); setConfirmReset(null) }}>Confirm reset</button>
                    <button className={buttonClass} onClick={() => setConfirmReset(null)}>Cancel</button>
                  </span>
                ) : (
                  <button className={buttonClass} onClick={() => setConfirmReset(m.matchId)}>Reset counts</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {reset.isError && <div className="mt-2"><ErrorNote error={reset.error} /></div>}
        <p className="mt-2 text-xs text-faint">Unusually high totals on a single match can mean someone is scripting the buttons.</p>
      </Section>

      <Section title="Operations">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink">Flush data cache</div>
            <div className="text-xs text-muted">Clears the app's stored scores and profiles so the next visits fetch fresh data. Expect a brief slowdown.</div>
          </div>
          <button className={buttonClass} disabled={flush.isPending} onClick={() => flush.mutate()}>{flush.isPending ? 'Flushing…' : 'Flush cache'}</button>
        </div>
        {flush.isSuccess && <p role="status" className="mt-2 text-xs text-success">Cleared {fmtInt(flush.data.cleared)} entries.</p>}
        {flush.isError && <div className="mt-2"><ErrorNote error={flush.error} /></div>}
      </Section>

      <Section title="Audit log">
        {audit.isError ? <ErrorNote error={audit.error} /> : (audit.data ?? []).length === 0 ? <Empty>No admin actions yet.</Empty> : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-xs">
              <thead className="text-faint"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">Detail</th></tr></thead>
              <tbody className="divide-y divide-line text-muted">
                {(audit.data ?? []).map((e, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-3 py-2">{new Date(e.at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-ink">{e.action}</td>
                    <td className="max-w-40 truncate px-3 py-2">{e.target}</td>
                    <td className="max-w-64 truncate px-3 py-2">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
