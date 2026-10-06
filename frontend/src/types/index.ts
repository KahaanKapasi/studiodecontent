export type SuitableFor = 'article' | 'video' | 'both'
export type TopicStatus = 'new' | 'selected' | 'discarded'

export interface TopicCandidate {
  id: number
  title: string
  rationale: string
  suitable_for: SuitableFor
  status: TopicStatus
  created_at: string
}

export type ArticleStatus = 'draft' | 'published'

export interface Article {
  id: number
  topic_id: number
  title: string
  body: string
  meta_description: string
  slug: string
  tags: string[]
  status: ArticleStatus
  created_at: string
  published_at: string | null
}

export type VideoFormat = 'long' | 'short'

export interface VideoTopic {
  id: number
  topic_id: number | null
  title: string
  suggestion_score: number | null
  format: VideoFormat | null
}

export type ScriptVariant = 'long' | 'short'

export interface Script {
  id: number
  video_topic_id: number | null
  variant: ScriptVariant | null
  body: string | null
  selected: boolean
}

export type PostDraftSource = 'match_scrape' | 'manual'
export type PostDraftStatus = 'draft' | 'finalized' | 'published'

export interface FinalImageConfig {
  crop?: { x: number; y: number; width: number; height: number }
  position?: { x: number; y: number }
  filters?: Record<string, unknown>
  // set right before publish — the Cloudinary URL(s) Instagram's publish API fetches from
  hosted_image_urls?: string[]
}

export interface PostDraft {
  id: number
  source: PostDraftSource
  suggested_opinion_text: string
  image_source_url: string | null
  template_id: number | null
  final_text: string
  final_image_config: FinalImageConfig | null
  status: PostDraftStatus
  created_at: string
}

export interface Template {
  id: number
  name: string
  layout_config: Record<string, unknown>
}

export interface InstagramMetricSnapshot {
  id: number
  captured_at: string
  followers: number
  reach_30d: number
  engagement_rate: number
  top_post_ids: number[]
}

export interface TwitterMetricSnapshot {
  id: number
  captured_at: string
  followers: number
  impressions_30d: number
  engagement_rate: number
}

export type TwitterSuggestionStatus = 'suggested' | 'posted' | 'discarded'

export interface TwitterPostSuggestion {
  id: number
  topic_id: number | null
  draft_text: string
  status: TwitterSuggestionStatus
}

export interface KpiBaseline {
  id: number
  label: string
  posts_per_week: number
  avg_engagement_rate: number | null
  created_at: string
}

export interface KpiSummary {
  since_studio_adoption: {
    articles_published: number
    posts_published: number
    posts_per_week: number | null
  }
  // Manually entered — 05_Dashboard_Analytics.md flags that this window can't
  // be backfilled automatically. Null until one is recorded (see kpi-baseline).
  pre_studio_baseline: {
    label: string
    posts_per_week: number
    avg_engagement_rate: number | null
  } | null
}

// ---- Video generation (prompt in -> video out) ----

export type VideoProviderId = 'veo' | 'higgsfield'

export interface VideoModelInfo {
  id: string
  label: string
  aspect_ratios: string[]
  durations: number[]
  resolutions: string[]
  price_per_second_usd: Record<string, number> | null
  notes: string | null
}

export interface VideoProviderInfo {
  id: VideoProviderId
  label: string
  configured: boolean
  missing_keys: string[]
  default_model: string
  models: VideoModelInfo[]
}

export interface VideoSource {
  title: string
  url: string
}

export interface ImprovePromptRequest {
  idea: string
  research: boolean
  aspect_ratio: string
  duration_seconds: number
}

export interface ImprovePromptResult {
  prompt: string
  sources: VideoSource[]
  research_notes: string | null
}

export interface CreateGenerationRequest {
  prompt: string
  original_idea?: string
  provider: string
  model: string
  aspect_ratio: string
  duration_seconds: number
  resolution: string
  research_sources?: VideoSource[]
}

export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface VideoGeneration {
  id: number
  prompt: string
  original_idea: string | null
  provider: string
  model: string
  aspect_ratio: string
  duration_seconds: number
  resolution: string
  status: GenerationStatus
  error: string | null
  has_file: boolean
  video_url: string | null
  research_sources: VideoSource[]
  estimated_cost_usd: number | null
  created_at: string
  completed_at: string | null
}
