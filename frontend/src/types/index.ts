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

export interface KpiSummary {
  since_studio_adoption: {
    articles_published: number
    posts_published: number
  }
  // pre-Studio baseline window is an open item (05_Dashboard_Analytics.md) —
  // no automatic backfill is possible, null until a baseline is defined.
  pre_studio_baseline: null
}
