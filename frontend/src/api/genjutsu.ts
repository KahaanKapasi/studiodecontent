import { apiFetch, errorMessageFrom } from './client'

export type GenjutsuStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'moderated' | 'canceled'

export interface GenjutsuJob {
  id: number
  prompt: string | null
  resolution: string
  status: GenjutsuStatus
  error: string | null
  video_name: string | null
  image_count: number
  input_seconds: number | null
  billed_seconds: number | null
  est_cost_usd: number | null
  has_file: boolean
  video_url: string | null
  created_at: string
  completed_at: string | null
}

export interface GenjutsuInfo {
  configured: boolean
  missing_keys: string[]
  model: string
  resolutions: { id: string; price_per_second_usd: number }[]
  limits: { min_video_seconds: number; max_billed_seconds: number; max_images: number }
}

const BASE = '/api/video/genjutsu'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await errorMessageFrom(res))
  return res.json()
}

export const isActiveJob = (j: Pick<GenjutsuJob, 'status'>) => j.status === 'queued' || j.status === 'running'

export const genjutsuApi = {
  info: async () => json<GenjutsuInfo>(await apiFetch(`${BASE}/status`)),
  list: async () => json<GenjutsuJob[]>(await apiFetch(`${BASE}/jobs`)),
  create: async (form: FormData) => json<GenjutsuJob>(await apiFetch(`${BASE}/jobs`, { method: 'POST', body: form })),
  cancel: async (id: number) => json<GenjutsuJob>(await apiFetch(`${BASE}/jobs/${id}/cancel`, { method: 'POST' })),
  retry: async (id: number, confirmCostUsd: number) => {
    const form = new FormData()
    form.append('confirm_cost_usd', String(confirmCostUsd))
    return json<GenjutsuJob>(await apiFetch(`${BASE}/jobs/${id}/retry`, { method: 'POST', body: form }))
  },
  remove: async (id: number) => {
    const res = await apiFetch(`${BASE}/jobs/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await errorMessageFrom(res))
  },
  fileBlob: async (id: number) => {
    const res = await apiFetch(`${BASE}/jobs/${id}/file`)
    if (!res.ok) throw new Error(await errorMessageFrom(res))
    return res.blob()
  },
}
