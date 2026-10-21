import { apiFetch, errorMessageFrom } from './client'

export class FootonomyApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`/api/footonomy${path}`, init)
  if (!res.ok) throw new FootonomyApiError(await errorMessageFrom(res), res.status)
  if (res.status === 204) return undefined as T
  return res.json()
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

export interface Overview {
  generatedAt: string
  users: { total: number; new24h: number; new7d: number; new30d: number; suspended: number; followingAnything: number }
  follows: { total: number; teams: number; tournaments: number }
  reactions: { total: number }
  signInCodesLast24h: number
  system: {
    uptimeSeconds: number
    http: { requestsTotal: number; errors5xxTotal: number; errorRate: number; meanSeconds: number; p95Seconds: number | null }
    upstream: { cacheHitRatio: number | null; lookups: number; staleServed: number; failures: number; cacheEntries: number | null }
    websocketSessions: number | null
    liveUpdatesBroadcast: number
    tomcatThreadsBusy: number | null
    tomcatThreadsMax: number | null
    heapUsedRatio: number | null
  }
}

export interface DailyPoint { date: string; count: number }
export interface Daily { signups: DailyPoint[]; follows: DailyPoint[] }
export interface TopFollow { type: string; id: string; name: string; logoUrl: string | null; followers: number }
export interface ReactedMatch { matchId: string; total: number; fire: number; love: number; wow: number }

export interface HistoryPoint {
  captured_at: string
  total_users: number | null
  follows_total: number | null
  requests_total: number | null
  errors_5xx_total: number | null
  p95_seconds: number | null
  cache_hit_ratio: number | null
  websocket_sessions: number | null
}

export interface AdminUser {
  id: string
  email: string
  createdAt: string
  suspended: boolean
  suspendedReason: string | null
  followCount: number
}
export interface UsersPage { total: number; page: number; size: number; users: AdminUser[] }
export interface UserDetail extends AdminUser { follows: { type: string; id: string; name: string }[] }

export interface Flag { key: string; enabled: boolean; text: string | null }
export interface AuditEntry { at: string; action: string; target: string; detail: string }

export const footonomyApi = {
  overview: () => call<Overview>('/overview'),
  history: (hours = 72) => call<HistoryPoint[]>(`/history?hours=${hours}`),
  daily: (days: number) => call<Daily>(`/daily?days=${days}`),
  topFollows: () => call<TopFollow[]>('/top-follows?limit=8'),
  reactions: () => call<ReactedMatch[]>('/reactions?limit=8'),
  users: (q: string, page: number) => call<UsersPage>(`/users?q=${encodeURIComponent(q)}&page=${page}&size=15`),
  user: (id: string) => call<UserDetail>(`/users/${id}`),
  deleteUser: (id: string) => call<void>(`/users/${id}`, send('DELETE')),
  suspend: (id: string, reason: string) => call<void>(`/users/${id}/suspend`, send('POST', { reason: reason || null })),
  unsuspend: (id: string) => call<void>(`/users/${id}/unsuspend`, send('POST')),
  flags: () => call<Flag[]>('/flags'),
  setFlag: (key: string, enabled: boolean, text: string | null) => call<Flag>(`/flags/${key}`, send('PUT', { enabled, text })),
  resetReactions: (matchId: string) => call<void>(`/matches/${encodeURIComponent(matchId)}/reactions/reset`, send('POST')),
  flushCache: () => call<{ cleared: number }>('/cache/flush', send('POST')),
  audit: () => call<AuditEntry[]>('/audit?limit=40'),
}
