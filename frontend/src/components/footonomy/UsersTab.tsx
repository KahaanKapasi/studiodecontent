import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { footonomyApi, type AdminUser } from '../../api/footonomy'
import { buttonClass, dangerButtonClass, Empty, ErrorNote, fmtInt } from './ui'

type Pending = { kind: 'suspend' | 'delete'; user: AdminUser } | null

function Detail({ id }: { id: string }) {
  const { data, isError, error } = useQuery({ queryKey: ['footonomy', 'user', id], queryFn: () => footonomyApi.user(id), retry: false })
  if (isError) return <ErrorNote error={error} />
  if (!data) return <p className="text-xs text-muted">Loading…</p>
  return (
    <div className="text-xs text-muted">
      {data.suspended && <p className="mb-1 text-danger">Suspended{data.suspendedReason ? `: ${data.suspendedReason}` : ''}</p>}
      {data.follows.length === 0 ? 'Follows nothing.' : (
        <ul className="flex flex-wrap gap-1.5">
          {data.follows.map((f) => (
            <li key={`${f.type}-${f.id}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-ink">{f.name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function UsersTab() {
  const queryClient = useQueryClient()
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')

  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [input])

  const users = useQuery({ queryKey: ['footonomy', 'users', q, page], queryFn: () => footonomyApi.users(q, page), retry: false, placeholderData: (prev) => prev })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['footonomy'] })
  const close = () => { setPending(null); setReason(''); setTyped('') }

  const suspend = useMutation({ mutationFn: (u: AdminUser) => footonomyApi.suspend(u.id, reason.trim()), onSuccess: () => { close(); refresh() } })
  const unsuspend = useMutation({ mutationFn: (u: AdminUser) => footonomyApi.unsuspend(u.id), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (u: AdminUser) => footonomyApi.deleteUser(u.id), onSuccess: () => { close(); refresh() } })

  const data = users.data
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search by email"
          aria-label="Search users by email"
          className="w-full max-w-sm rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <span className="text-xs text-muted">{data ? `${fmtInt(data.total)} users` : ''}</span>
      </div>

      {users.isError && <ErrorNote error={users.error} />}
      {(suspend.isError || unsuspend.isError || remove.isError) && (
        <div className="mb-3"><ErrorNote error={suspend.error ?? unsuspend.error ?? remove.error} /></div>
      )}

      {data && data.users.length === 0 ? <Empty>No users match.</Empty> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {(data?.users ?? []).map((u) => (
            <li key={u.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button onClick={() => setOpen(open === u.id ? null : u.id)} className="min-w-0 text-left" aria-expanded={open === u.id}>
                  <span className="block truncate text-sm text-ink">{u.email}</span>
                  <span className="text-xs text-muted">
                    joined {new Date(u.createdAt).toLocaleDateString()} · {u.followCount} follows
                    {u.suspended && <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-danger">suspended</span>}
                  </span>
                </button>
                <div className="flex gap-2">
                  {u.suspended ? (
                    <button className={buttonClass} disabled={unsuspend.isPending} onClick={() => unsuspend.mutate(u)}>Unsuspend</button>
                  ) : (
                    <button className={buttonClass} onClick={() => { setPending({ kind: 'suspend', user: u }); setReason(''); setTyped('') }}>Suspend</button>
                  )}
                  <button className={dangerButtonClass} onClick={() => { setPending({ kind: 'delete', user: u }); setTyped(''); setReason('') }}>Delete</button>
                </div>
              </div>

              {open === u.id && <div className="mt-2"><Detail id={u.id} /></div>}

              {pending?.user.id === u.id && pending.kind === 'suspend' && (
                <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); suspend.mutate(u) }}>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="Reason (optional, kept in the audit log)" aria-label="Suspension reason" className="min-w-64 flex-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent" />
                  <button type="submit" className={dangerButtonClass} disabled={suspend.isPending}>Confirm suspend</button>
                  <button type="button" className={buttonClass} onClick={close}>Cancel</button>
                </form>
              )}
              {pending?.user.id === u.id && pending.kind === 'delete' && (
                <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim().toLowerCase() === u.email.toLowerCase()) remove.mutate(u) }}>
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${u.email} to confirm`} aria-label="Type the email to confirm deletion" className="min-w-64 flex-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-danger" />
                  <button type="submit" className={dangerButtonClass} disabled={remove.isPending || typed.trim().toLowerCase() !== u.email.toLowerCase()}>Delete permanently</button>
                  <button type="button" className={buttonClass} onClick={close}>Cancel</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <button className={buttonClass} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button className={buttonClass} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}
