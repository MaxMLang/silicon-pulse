// ─── Database Types ────────────────────────────────────────────────────────────

export type FeedType = 'balanced' | 'left' | 'right' | 'none'
export type Condition = 'baseline' | 'informed'
export type RunStatus = 'pending' | 'running' | 'complete' | 'failed'
export type SurveySource = 'pulse' | 'open'

export type PriorityThemeCategory =
  | 'Economy'
  | 'Government/Leadership'
  | 'Immigration'
  | 'Healthcare'
  | 'Crime/Violence'
  | 'Education'
  | 'Environment/Climate'
  | 'National Security'
  | 'Race Relations'
  | 'Poverty/Inequality'
  | 'Other'

export const PRIORITY_THEMES: PriorityThemeCategory[] = [
  'Economy',
  'Government/Leadership',
  'Immigration',
  'Healthcare',
  'Crime/Violence',
  'Education',
  'Environment/Climate',
  'National Security',
  'Race Relations',
  'Poverty/Inequality',
  'Other',
]

export interface Survey {
  id: string
  source: SurveySource
  question_id: string
  topic: string
  question_text: string
  options: string[]
  source_url: string | null
  usage_disclaimer: string | null
  active: boolean
  created_at: string
}

export interface ModelRegistry {
  id: string
  display_name: string
  provider: string
  family: string | null
  parameter_count: string | null
  origin: string | null
  first_seen: string
  last_seen: string
  active: boolean
  context_length: number | null
  pricing_prompt: number | null
  pricing_completion: number | null
}

export interface NewsBrief {
  id: string
  feed_type: FeedType
  content: string
  headlines: Headline[]
  sources: string[]
  created_at: string
}

export interface Headline {
  title: string
  source: string
  url?: string
  summary: string
}

export interface Run {
  id: string
  run_date: string
  status: RunStatus
  model_list: string[]
  brief_ids: Record<string, string>  // feed_type -> brief_id
  total_calls: number
  total_cost: number
  error_log: string | null
  completed_at: string | null
  created_at: string
}

/** LLM-authored briefing for a run (see /digest). */
export interface RunDigest {
  id: string
  run_id: string
  slug: string
  title: string
  run_date_display: string
  author_model_id: string
  author_display_name: string
  body: string
  excerpt: string | null
  created_at: string
}

export interface Response {
  id: string
  run_id: string
  survey_id: string
  model_id: string
  model_name: string
  condition: Condition
  feed_type: FeedType
  news_brief_id: string | null
  answer: string | null
  reasoning: string | null
  /** Classifier-assigned policy theme (DB column name unchanged for compatibility). */
  mip_category: string | null
  option_order: string[]
  raw_response: string | null
  error: string | null
  temperature: number
  tokens_input: number | null
  tokens_output: number | null
  cost_usd: number | null
  latency_ms: number | null
  created_at: string
}

// ─── API / OpenRouter Types ────────────────────────────────────────────────────

export interface OpenRouterModel {
  id: string
  name: string
  description?: string
  context_length: number
  pricing: {
    prompt: string
    completion: string
    image?: string
  }
  top_provider?: {
    max_completion_tokens?: number
    is_moderated?: boolean
  }
  architecture?: {
    modality: string
    tokenizer: string
    instruct_type?: string
  }
  created?: number
}

export interface OpenRouterResponse {
  id: string
  choices: Array<{
    message: {
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  model: string
}

// ─── Dashboard / Computed Types ────────────────────────────────────────────────

export interface ModelDivergenceScore {
  model_id: string
  model_name: string
  provider: string
  origin: string | null
  mae: number              // Mean Absolute Error vs human ground truth
  question_count: number
}

/** Per-model participation counts for a single run */
export interface RunModelParticipation {
  model_id: string
  model_name: string
  provider: string
  origin: string | null
  responses_ok: number
  responses_failed: number
}

export interface DriftAlert {
  model_id: string
  model_name: string
  survey_id: string
  question_id: string
  question_text: string
  prev_answer: string
  curr_answer: string
  feed_type: FeedType
  run_date: string
}

export interface QuestionSummary {
  survey: Survey
  latest_run_id: string | null
  response_count: number
  model_distribution: Record<string, Record<string, number>>  // answer -> count
  human_mae: number | null
}

export interface TimeSeriesPoint {
  run_date: string
  run_id: string
  feed_type: FeedType
  answer_distribution: Record<string, number>
  model_count: number
}

export interface ModelFeedSensitivity {
  model_id: string
  model_name: string
  feed_sensitivity: number  // 0-1, how much news shifts answers
  baseline_consistency: number  // 0-1, how stable across runs
}
