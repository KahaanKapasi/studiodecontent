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
  reach_30d: number | null
  /** Fraction (0.15 = 15%): total_interactions / reach over the last 30 days. */
  engagement_rate: number | null
  top_post_ids: number[]
  /** Only on the refresh response: set when reach/engagement couldn't be fetched. */
  warning?: string | null
}

/** Reels publishing state carried by Studio projects and clip generations. */
export type InstagramPublishStatus = 'publishing' | 'published' | 'failed'
export interface InstagramPublishFields {
  instagram_media_id?: string | null
  instagram_permalink?: string | null
  instagram_status?: InstagramPublishStatus | null
  instagram_error?: string | null
  /** Soft warnings (aspect ratio / length); only present on the publish response. */
  instagram_warnings?: string[]
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

export interface VideoGeneration extends InstagramPublishFields {
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
  estimated_cost_low_usd?: number | null
  estimated_cost_high_usd?: number | null
  created_at: string
  completed_at: string | null
}

// ---- Video Studio (multi-stage engines, docs/10_Video_Studio_Engines.md) ----

export type StudioFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'number'
  | 'toggle'
  | 'image'
  | 'images'
  | 'video'
  | 'audio'

export interface StudioFieldOption {
  value: string
  label: string
}

export interface StudioFieldSpec {
  name: string
  label: string
  type: StudioFieldType
  required: boolean
  default?: unknown
  options?: StudioFieldOption[]
  min?: number
  max?: number
  help?: string
}

export interface StudioRecipeInfo {
  id: string
  label: string
  description: string
  configured: boolean
  missing_keys: string[]
  paid: boolean
  fields: StudioFieldSpec[]
}

export interface StudioEngineInfo {
  id: string
  label: string
  description: string
  recipes: StudioRecipeInfo[]
}

export type StudioStatus =
  | 'queued'
  | 'planning'
  | 'awaiting_approval'
  | 'rendering'
  | 'succeeded'
  | 'failed'

export interface StudioScene {
  index: number
  text: string
  visual: string
  duration_s: number
}

export interface StudioPlan {
  summary: string
  script?: string
  scenes?: StudioScene[]
  notes?: string
}

export interface StudioPreview {
  name: string
  label: string
  kind: 'image' | 'audio' | 'video'
}

export interface StudioProject extends InstagramPublishFields {
  id: number
  engine: string
  recipe: string | null
  title: string
  status: StudioStatus
  stage: string
  progress: number
  error: string | null
  params: Record<string, unknown>
  plan: StudioPlan | null
  previews: StudioPreview[]
  has_file: boolean
  video_url: string | null
  estimated_cost_usd: number | null
  estimated_cost_low_usd?: number | null
  estimated_cost_high_usd?: number | null
  created_at: string
  completed_at: string | null
}

// --- Cost awareness (docs/11_Cost_Awareness.md) ---

export type CostConfidence = 'official' | 'mixed' | 'unknown'

export interface CostBreakdownRow {
  item: string
  qty_low: number
  qty_high: number
  unit: string
  unit_usd: number | null
  low_usd: number
  high_usd: number
  confidence?: 'official' | 'third-party' | 'unknown'
  verified_on?: string | null
  source_url?: string | null
}

export interface CostEstimate {
  action: string
  low_usd: number
  high_usd: number
  currency: 'USD'
  free: boolean
  confidence: CostConfidence
  breakdown: CostBreakdownRow[]
  notes: string[]
  prices_verified_on?: string | null
}

export interface CostSummary {
  days: number
  total_usd: number
  estimated_usd: number
  event_count: number
  by_service: { service: string; usd: number }[]
  by_action: { action: string; count: number; usd: number; estimated_count: number }[]
  daily: { date: string; usd: number }[]
}

export interface PriceRow {
  id: string
  service: string
  unit: string
  usd: number | null
  low_usd: number | null
  high_usd: number | null
  source_url: string
  verified_on: string
  confidence: 'official' | 'third-party' | 'unknown'
  effective_from: string | null
  note: string | null
  upcoming: { effective_from: string; usd: number | null }[]
}
