import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { apiFetch } from '../api/client'
import { ENDPOINTS } from '../api/endpoints'
import { getAccessPassword, setAccessPassword, UNAUTHORIZED_EVENT } from '../auth'

type Phase = 'connecting' | 'locked' | 'ready' | 'unreachable'

const MAX_ATTEMPTS = 30
const RETRY_MS = 3000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function AccessGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('connecting')
  const [slow, setSlow] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [attemptKey, setAttemptKey] = useState(0)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    setPhase('connecting')
    setSlow(false)
    const slowTimer = setTimeout(() => setSlow(true), 3000)

    async function connect() {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !cancelled.current; attempt++) {
        try {
          const res = await apiFetch(ENDPOINTS.auth.status)
          if (!res.ok) throw new Error(String(res.status))
          const { required } = (await res.json()) as { required: boolean }
          if (cancelled.current) return
          if (!required) return setPhase('ready')
          if (!getAccessPassword()) return setPhase('locked')
          const check = await apiFetch(ENDPOINTS.auth.check)
          if (cancelled.current) return
          return setPhase(check.ok ? 'ready' : 'locked')
        } catch {
          await sleep(RETRY_MS)
        }
      }
      if (!cancelled.current) setPhase('unreachable')
    }

    connect()
    return () => {
      cancelled.current = true
      clearTimeout(slowTimer)
    }
  }, [attemptKey])

  useEffect(() => {
    function onUnauthorized() {
      setError('Access password changed or expired — enter it again.')
      setPhase('locked')
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setChecking(true)
    setError('')
    setAccessPassword(password)
    try {
      const res = await apiFetch(ENDPOINTS.auth.check)
      if (res.ok) {
        setPassword('')
        setPhase('ready')
      } else {
        setError('Wrong password.')
      }
    } catch {
      setError('Could not reach the server.')
    } finally {
      setChecking(false)
    }
  }

  if (phase === 'ready') return <>{children}</>

  return (
    <div className="flex min-h-screen items-center justify-center bg-app p-6 text-ink">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 text-center">
        <h1 className="mb-1 text-lg font-semibold">Content Studio</h1>

        {phase === 'connecting' && (
          <p className="mt-3 text-sm text-muted">
            {slow
              ? 'Waking the server up — free hosting sleeps when idle, this can take up to a minute.'
              : 'Connecting…'}
          </p>
        )}

        {phase === 'unreachable' && (
          <>
            <p className="mt-3 text-sm text-danger">Could not reach the server.</p>
            <button
              onClick={() => setAttemptKey((k) => k + 1)}
              className="mt-4 rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2"
            >
              Try again
            </button>
          </>
        )}

        {phase === 'locked' && (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-left">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Access password"
              className="w-full rounded-md border border-line bg-app px-3 py-2 text-sm text-ink placeholder:text-faint"
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              type="submit"
              disabled={checking || !password}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {checking ? 'Checking…' : 'Unlock'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
