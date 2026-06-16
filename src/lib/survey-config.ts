import surveyConfigJson from '../config/survey-config.json'

export type InformedScope = 'anchors-only' | 'pool'
export type FeedType = 'balanced' | 'left' | 'right'

export interface SurveyConfig {
  baseline: { fillPoolCap: number; openSourceFillCap: number }
  informed: { scope: InformedScope; fillPoolCap: number; feeds: FeedType[] }
  anchors: { repetitions: number; sampleTemperature: number }
  registry: { targetModelCount: number; minContextLength: number }
  models: { summarizer: string; classifier: string; digestAuthor: string | null }
  call: {
    temperature: number
    maxTokens: number
    batchSize: number
    batchDelayMs: number
    maxRetries: number
    requestTimeoutMs: number
  }
  backfill: { days: number; stepDays: number; informedStepDays: number; fillPoolCap: number }
}

const raw = surveyConfigJson as Record<string, unknown>

/** Typed, comment-stripped view of survey-config.json (bundled at build time). */
export const surveyConfig: SurveyConfig = {
  baseline: {
    fillPoolCap: num((raw.baseline as any)?.fillPoolCap, 5),
    openSourceFillCap: num((raw.baseline as any)?.openSourceFillCap, 0),
  },
  informed: {
    scope: ((raw.informed as any)?.scope as InformedScope) ?? 'anchors-only',
    fillPoolCap: num((raw.informed as any)?.fillPoolCap, 0),
    feeds: (((raw.informed as any)?.feeds as FeedType[]) ?? ['balanced', 'left', 'right']),
  },
  anchors: {
    repetitions: num((raw.anchors as any)?.repetitions, 1),
    sampleTemperature: num((raw.anchors as any)?.sampleTemperature, 0.7),
  },
  registry: {
    targetModelCount: num((raw.registry as any)?.targetModelCount, 12),
    minContextLength: num((raw.registry as any)?.minContextLength, 8192),
  },
  models: {
    summarizer: str((raw.models as any)?.summarizer, 'anthropic/claude-haiku-4-5'),
    classifier: str((raw.models as any)?.classifier, 'anthropic/claude-haiku-4-5'),
    digestAuthor: ((raw.models as any)?.digestAuthor as string | null) ?? null,
  },
  call: {
    temperature: num((raw.call as any)?.temperature, 0),
    maxTokens: num((raw.call as any)?.maxTokens, 512),
    batchSize: num((raw.call as any)?.batchSize, 8),
    batchDelayMs: num((raw.call as any)?.batchDelayMs, 2000),
    maxRetries: num((raw.call as any)?.maxRetries, 2),
    requestTimeoutMs: num((raw.call as any)?.requestTimeoutMs, 120000),
  },
  backfill: {
    days: num((raw.backfill as any)?.days, 30),
    stepDays: num((raw.backfill as any)?.stepDays, 1),
    informedStepDays: num((raw.backfill as any)?.informedStepDays, 3),
    fillPoolCap: num((raw.backfill as any)?.fillPoolCap, 5),
  },
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback
}
