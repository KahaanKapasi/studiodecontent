import { API_BASE_URL, ENDPOINTS } from './endpoints'
import { authHeaders, setAccessPassword, UNAUTHORIZED_EVENT } from '../auth'
import type {
  Article,
  CreateGenerationRequest,
  ImprovePromptRequest,
  ImprovePromptResult,
  VideoGeneration,
  VideoProviderInfo,
  InstagramMetricSnapshot,
  KpiBaseline,
  KpiSummary,
  PostDraft,
  Script,
  StudioEngineInfo,
  StudioProject,
  Template,
  TopicCandidate,
  TwitterMetricSnapshot,
  TwitterPostSuggestion,
  VideoTopic,
} from '../types'

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { ...authHeaders() }
  if (!(options?.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  if (res.status === 401) {
    setAccessPassword('')
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
  return res
}

export async function errorMessageFrom(res: Response): Promise<string> {
  const body = await res.text().catch(() => '')
  let detail: unknown
  try {
    detail = JSON.parse(body)?.detail
  } catch {
    // not JSON — fall through to the raw body
  }
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail) && detail.length) {
    // FastAPI 422 shape: [{ loc, msg }, ...]
    return detail
      .map((d) => (d && typeof d === 'object' && 'msg' in d ? String(d.msg) : String(d)))
      .join('; ')
  }
  return body || `Request failed (${res.status})`
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options)
  if (!res.ok) throw new Error(await errorMessageFrom(res))
  return res.json() as Promise<T>
}

export const discoveryApi = {
  listTopics: (params?: { status?: string; suitable_for?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    return request<TopicCandidate[]>(`${ENDPOINTS.discovery.topics}${qs ? `?${qs}` : ''}`)
  },
  updateTopicStatus: (id: number, status: string) =>
    request<TopicCandidate>(ENDPOINTS.discovery.updateTopic(id), {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  triggerScrape: () =>
    request<{ source_health: unknown[]; topics_created: number; error?: string }>(
      ENDPOINTS.discovery.triggerScrape,
      { method: 'POST' },
    ),
}

export const articlesApi = {
  list: () => request<Article[]>(ENDPOINTS.articles.list),
  detail: (id: number) => request<Article>(ENDPOINTS.articles.detail(id)),
  generate: (topicId: number) =>
    request<Article>(ENDPOINTS.articles.generate, {
      method: 'POST',
      body: JSON.stringify({ topic_id: topicId }),
    }),
  update: (id: number, payload: Partial<Article>) =>
    request<Article>(ENDPOINTS.articles.update(id), { method: 'PATCH', body: JSON.stringify(payload) }),
  publish: (id: number) => request<Article>(ENDPOINTS.articles.publish(id), { method: 'POST' }),
  regenerate: (id: number) =>
    request<Article>(ENDPOINTS.articles.regenerate(id), { method: 'POST' }),
}

export const videoApi = {
  generateTitles: (topicId: number) =>
    request<VideoTopic[]>(ENDPOINTS.video.generateTitles, {
      method: 'POST',
      body: JSON.stringify({ topic_id: topicId }),
    }),
  listTopics: (topicId: number) => request<VideoTopic[]>(ENDPOINTS.video.topics(topicId)),
  generateScripts: (videoTopicId: number) =>
    request<Script[]>(ENDPOINTS.video.generateScripts, {
      method: 'POST',
      body: JSON.stringify({ video_topic_id: videoTopicId }),
    }),
  listScripts: (videoTopicId: number) => request<Script[]>(ENDPOINTS.video.scripts(videoTopicId)),
  updateScript: (id: number, selected: boolean) =>
    request<Script>(ENDPOINTS.video.updateScript(id), {
      method: 'PATCH',
      body: JSON.stringify({ selected }),
    }),

  // ---- prompt in -> video out ----
  providers: () => request<VideoProviderInfo[]>(ENDPOINTS.video.providers),
  improvePrompt: (payload: ImprovePromptRequest) =>
    request<ImprovePromptResult>(ENDPOINTS.video.improvePrompt, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createGeneration: (payload: CreateGenerationRequest) =>
    request<VideoGeneration>(ENDPOINTS.video.generations, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listGenerations: (limit = 50) =>
    request<VideoGeneration[]>(`${ENDPOINTS.video.generations}?limit=${limit}`),
  getGeneration: (id: number) => request<VideoGeneration>(ENDPOINTS.video.generation(id)),
  deleteGeneration: async (id: number): Promise<void> => {
    const res = await apiFetch(ENDPOINTS.video.generation(id), { method: 'DELETE' })
    if (!res.ok) throw new Error(await errorMessageFrom(res))
  },
  retryGeneration: (id: number) =>
    request<VideoGeneration>(ENDPOINTS.video.retryGeneration(id), { method: 'POST' }),
  /** The file endpoint needs the access header, so it is fetched as a Blob. */
  fetchFileBlob: async (id: number): Promise<Blob> => {
    const res = await apiFetch(ENDPOINTS.video.generationFile(id))
    if (!res.ok) throw new Error(await errorMessageFrom(res))
    return res.blob()
  },
}

async function blobRequest(path: string): Promise<Blob> {
  const res = await apiFetch(path)
  if (!res.ok) throw new Error(await errorMessageFrom(res))
  return res.blob()
}

async function emptyRequest(path: string, method: string): Promise<void> {
  const res = await apiFetch(path, { method })
  if (!res.ok) throw new Error(await errorMessageFrom(res))
}

export interface CreateStudioProjectInput {
  engine: string
  recipe: string
  /** Field values except files. */
  params: Record<string, unknown>
  autoApprove: boolean
  /** Files keyed by FieldSpec name; an array repeats the field name (type `images`). */
  files: Record<string, File | File[] | null | undefined>
}

export const studioApi = {
  engines: () => request<StudioEngineInfo[]>(ENDPOINTS.studio.engines),
  createProject: (input: CreateStudioProjectInput) => {
    const form = new FormData()
    form.append('engine', input.engine)
    form.append('recipe', input.recipe)
    form.append('params', JSON.stringify(input.params))
    form.append('auto_approve', input.autoApprove ? 'true' : 'false')
    for (const [name, value] of Object.entries(input.files)) {
      if (!value) continue
      for (const file of Array.isArray(value) ? value : [value]) form.append(name, file)
    }
    return request<StudioProject>(ENDPOINTS.studio.projects, { method: 'POST', body: form })
  },
  listProjects: (limit = 50) =>
    request<StudioProject[]>(`${ENDPOINTS.studio.projects}?limit=${limit}`),
  getProject: (id: number) => request<StudioProject>(ENDPOINTS.studio.project(id)),
  approve: (id: number) => request<StudioProject>(ENDPOINTS.studio.approve(id), { method: 'POST' }),
  replan: (id: number) => request<StudioProject>(ENDPOINTS.studio.replan(id), { method: 'POST' }),
  retry: (id: number) => request<StudioProject>(ENDPOINTS.studio.retry(id), { method: 'POST' }),
  deleteProject: (id: number) => emptyRequest(ENDPOINTS.studio.project(id), 'DELETE'),
  /** The file / asset endpoints need the access header, so they are fetched as Blobs. */
  fileBlob: (id: number) => blobRequest(ENDPOINTS.studio.file(id)),
  assetBlob: (id: number, name: string) => blobRequest(ENDPOINTS.studio.asset(id, name)),
}

export const postsApi = {
  listDrafts: () => request<PostDraft[]>(ENDPOINTS.posts.drafts),
  createDraft: (payload: Partial<PostDraft>) =>
    request<PostDraft>(ENDPOINTS.posts.createDraft, { method: 'POST', body: JSON.stringify(payload) }),
  detail: (id: number) => request<PostDraft>(ENDPOINTS.posts.detail(id)),
  listTemplates: () => request<Template[]>(ENDPOINTS.posts.templates),
  updateDraft: (id: number, payload: Partial<PostDraft>) =>
    request<PostDraft>(ENDPOINTS.posts.updateDraft(id), {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  renderPreview: async (
    templateName: string,
    text: string,
    aspectRatio: string,
    imageFile: File,
  ): Promise<string> => {
    const form = new FormData()
    form.append('image', imageFile)
    const res = await apiFetch(ENDPOINTS.posts.renderPreview(templateName, text, aspectRatio), {
      method: 'POST',
      body: form,
    })
    if (!res.ok) throw new Error(await errorMessageFrom(res))
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  },
  renderBackground: async (templateName: string, aspectRatio: string, imageFile: File): Promise<string> => {
    const form = new FormData()
    form.append('image', imageFile)
    const res = await apiFetch(ENDPOINTS.posts.renderBackground(templateName, aspectRatio), {
      method: 'POST',
      body: form,
    })
    if (!res.ok) throw new Error(await errorMessageFrom(res))
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  },
  uploadToHost: async (imageFile: File | Blob): Promise<{ url: string }> => {
    const form = new FormData()
    form.append('image', imageFile)
    return request<{ url: string }>(ENDPOINTS.posts.uploadToHost, { method: 'POST', body: form })
  },
  matchScrape: (team: string) =>
    request<PostDraft[]>(ENDPOINTS.posts.matchScrape(team), { method: 'POST' }),
  publish: (id: number) =>
    request<{ media_id: string }>(ENDPOINTS.posts.publish(id), { method: 'POST' }),
}

export const dashboardApi = {
  instagramLatest: async (): Promise<InstagramMetricSnapshot | undefined> => {
    const list = await request<InstagramMetricSnapshot[]>(ENDPOINTS.dashboard.instagramMetrics)
    return list.at(-1)
  },
  twitterLatest: async (): Promise<TwitterMetricSnapshot | undefined> => {
    const list = await request<TwitterMetricSnapshot[]>(ENDPOINTS.dashboard.twitterMetrics)
    return list.at(-1)
  },
  kpiSummary: () => request<KpiSummary>(ENDPOINTS.dashboard.kpiSummary),
  getBaseline: () => request<KpiBaseline | null>(ENDPOINTS.dashboard.kpiBaseline),
  setBaseline: (payload: { label: string; posts_per_week: number; avg_engagement_rate?: number }) =>
    request<KpiBaseline>(ENDPOINTS.dashboard.kpiBaseline, { method: 'PUT', body: JSON.stringify(payload) }),
  twitterSuggestions: () =>
    request<TwitterPostSuggestion[]>(ENDPOINTS.dashboard.twitterSuggestions),
  generateTwitterSuggestions: () =>
    request<TwitterPostSuggestion[]>(ENDPOINTS.dashboard.generateTwitterSuggestions, { method: 'POST' }),
  postSuggestion: (id: number) =>
    request<TwitterPostSuggestion>(ENDPOINTS.dashboard.postSuggestion(id), { method: 'POST' }),
}
