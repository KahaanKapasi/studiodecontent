import { API_BASE_URL, ENDPOINTS } from './endpoints'
import type {
  Article,
  InstagramMetricSnapshot,
  KpiSummary,
  PostDraft,
  Template,
  TopicCandidate,
  TwitterMetricSnapshot,
  TwitterPostSuggestion,
} from '../types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: options?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API error ${res.status}: ${path} ${body}`)
  }
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
  renderPreview: async (templateName: string, text: string, imageFile: File): Promise<string> => {
    const form = new FormData()
    form.append('image', imageFile)
    const res = await fetch(`${API_BASE_URL}${ENDPOINTS.posts.renderPreview(templateName, text)}`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) throw new Error(`API error ${res.status}: render-preview`)
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  },
  renderBackground: async (templateName: string, imageFile: File): Promise<string> => {
    const form = new FormData()
    form.append('image', imageFile)
    const res = await fetch(`${API_BASE_URL}${ENDPOINTS.posts.renderBackground(templateName)}`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Template render failed (${res.status}): ${body}`)
    }
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
  twitterSuggestions: () =>
    request<TwitterPostSuggestion[]>(ENDPOINTS.dashboard.twitterSuggestions),
  generateTwitterSuggestions: () =>
    request<TwitterPostSuggestion[]>(ENDPOINTS.dashboard.generateTwitterSuggestions, { method: 'POST' }),
  postSuggestion: (id: number) =>
    request<TwitterPostSuggestion>(ENDPOINTS.dashboard.postSuggestion(id), { method: 'POST' }),
}
