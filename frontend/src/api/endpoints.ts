export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? 'https://contentstudio-be.onrender.com' : 'http://localhost:8000')

export const ENDPOINTS = {
  discovery: {
    topics: '/api/discovery/topics',
    updateTopic: (id: number) => `/api/discovery/topics/${id}`,
    triggerScrape: '/api/discovery/scrape',
  },
  articles: {
    list: '/api/articles',
    detail: (id: number) => `/api/articles/${id}`,
    generate: '/api/articles/generate',
    update: (id: number) => `/api/articles/${id}`,
    publish: (id: number) => `/api/articles/${id}/publish`,
    regenerate: (id: number) => `/api/articles/${id}/regenerate`,
  },
  video: {
    generateTitles: '/api/video/generate-titles',
    topics: (topicId: number) => `/api/video/topics?topic_id=${topicId}`,
    generateScripts: '/api/video/scripts/generate',
    scripts: (videoTopicId: number) => `/api/video/scripts?video_topic_id=${videoTopicId}`,
    updateScript: (id: number) => `/api/video/scripts/${id}`,
  },
  posts: {
    drafts: '/api/posts/drafts',
    createDraft: '/api/posts/drafts',
    detail: (id: number) => `/api/posts/drafts/${id}`,
    updateDraft: (id: number) => `/api/posts/drafts/${id}`,
    templates: '/api/posts/templates',
    aspectRatios: '/api/posts/aspect-ratios',
    renderPreview: (templateName: string, text: string, aspectRatio: string) =>
      `/api/posts/render-preview?template_name=${encodeURIComponent(templateName)}&text=${encodeURIComponent(text)}&aspect_ratio=${encodeURIComponent(aspectRatio)}`,
    renderBackground: (templateName: string, aspectRatio: string) =>
      `/api/posts/render-background?template_name=${encodeURIComponent(templateName)}&aspect_ratio=${encodeURIComponent(aspectRatio)}`,
    uploadToHost: '/api/posts/upload-to-host',
    matchScrape: (team: string) => `/api/posts/match-scrape?team=${encodeURIComponent(team)}`,
    publish: (id: number) => `/api/posts/drafts/${id}/publish`,
  },
  dashboard: {
    instagramMetrics: '/api/dashboard/instagram/metrics',
    instagramRefresh: '/api/dashboard/instagram/refresh',
    twitterMetrics: '/api/dashboard/twitter/metrics',
    twitterRefresh: (username: string) => `/api/dashboard/twitter/refresh?username=${encodeURIComponent(username)}`,
    kpiSummary: '/api/dashboard/kpi-summary',
    kpiBaseline: '/api/dashboard/kpi-baseline',
    twitterSuggestions: '/api/dashboard/twitter/suggestions',
    generateTwitterSuggestions: '/api/dashboard/twitter/suggestions/generate',
    postSuggestion: (id: number) => `/api/dashboard/twitter/suggestions/${id}/post`,
  },
} as const
