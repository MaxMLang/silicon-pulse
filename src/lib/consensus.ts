import type { Survey, Response, FeedType } from './types'
import { conditionForFeed } from './feed'
import { normalizePriorityThemeLabel } from './priority-theme-display'

/** One row per question: plurality answer or top theme under baseline (no-news). */
export interface AnswerOverviewRow {
  question_id: string
  topic: string
  isOpen: boolean
  label: string
  pct: number | null
  n: number
}

export function buildBaselineAnswersOverview(
  surveys: Survey[],
  responses: Response[]
): AnswerOverviewRow[] {
  const cond = conditionForFeed('none')
  const rows: AnswerOverviewRow[] = []

  for (const survey of surveys) {
    const rs = responses.filter(
      r =>
        r.survey_id === survey.id &&
        r.feed_type === 'none' &&
        r.condition === cond &&
        !r.error
    )
    const n = rs.length

    if (n === 0) {
      rows.push({
        question_id: survey.question_id,
        topic: survey.topic,
        isOpen: !survey.options?.length,
        label: '-',
        pct: null,
        n: 0,
      })
      continue
    }

    if (survey.options?.length) {
      const counts: Record<string, number> = {}
      for (const r of rs) {
        const a = r.answer?.trim()
        if (a) counts[a] = (counts[a] ?? 0) + 1
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
      const top = sorted[0]
      if (top) {
        const [label, c] = top
        rows.push({
          question_id: survey.question_id,
          topic: survey.topic,
          isOpen: false,
          label,
          pct: Math.round((c / n) * 100),
          n,
        })
      } else {
        rows.push({
          question_id: survey.question_id,
          topic: survey.topic,
          isOpen: false,
          label: '-',
          pct: null,
          n,
        })
      }
      continue
    }

    const counts: Record<string, number> = {}
    for (const r of rs) {
      const k = normalizePriorityThemeLabel(r.mip_category)
      counts[k] = (counts[k] ?? 0) + 1
    }
    const [label, c] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    rows.push({
      question_id: survey.question_id,
      topic: survey.topic,
      isOpen: true,
      label,
      pct: Math.round((c / n) * 100),
      n,
    })
  }

  return rows
}

function agreementKey(survey: Survey, r: Response): string | null {
  if (survey.options?.length) {
    const a = r.answer?.trim()
    return a ?? null
  }
  if (r.mip_category?.trim()) {
    return `cat:${normalizePriorityThemeLabel(r.mip_category)}`
  }
  const raw = r.answer?.trim().toLowerCase()
  return raw ? `raw:${raw}` : null
}

export function findMostConsensualClosedQuestion(
  surveys: Survey[],
  responses: Response[],
  feed: FeedType = 'none'
): {
  survey: Survey
  modalShare: number
  modalAnswer: string
  n: number
} | null {
  const cond = conditionForFeed(feed)
  const closed = surveys.filter(s => s.options?.length > 0)
  let best: {
    survey: Survey
    modalShare: number
    modalAnswer: string
    n: number
  } | null = null

  for (const survey of closed) {
    const rows = responses.filter(
      r =>
        r.survey_id === survey.id &&
        r.feed_type === feed &&
        r.condition === cond &&
        !r.error &&
        r.answer?.trim()
    )
    if (rows.length < 2) continue

    const counts: Record<string, number> = {}
    for (const r of rows) {
      const a = r.answer!.trim()
      counts[a] = (counts[a] ?? 0) + 1
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const [modalAnswer, modeCount] = sorted[0]
    const share = modeCount / rows.length

    if (!best || share > best.modalShare || (share === best.modalShare && rows.length > best.n)) {
      best = { survey, modalShare: share, modalAnswer, n: rows.length }
    }
  }

  return best
}

export interface SpotlightMatrixModel {
  id: string
  name: string
}

/** Pairwise same-answer for one survey (100 / 0 / empty if incomparable). */
export function buildSpotlightPairwiseMatrix(
  survey: Survey,
  responses: Response[],
  feed: FeedType
): { models: SpotlightMatrixModel[]; matrix: (number | null)[][] } {
  const cond = conditionForFeed(feed)
  const rows = responses.filter(
    r => r.survey_id === survey.id && r.feed_type === feed && r.condition === cond && !r.error
  )

  const byModel = new Map<string, Response>()
  for (const r of rows) {
    if (!byModel.has(r.model_id)) byModel.set(r.model_id, r)
  }

  const models: SpotlightMatrixModel[] = [...byModel.entries()]
    .sort((a, b) => a[1].model_name.localeCompare(b[1].model_name))
    .map(([id, r]) => ({ id, name: r.model_name }))

  const n = models.length
  const grid: (number | null)[][] = Array.from({ length: n }, () => Array(n).fill(null))

  for (let i = 0; i < n; i++) {
    grid[i][i] = 100
    const ri = byModel.get(models[i].id)!
    const ki = agreementKey(survey, ri)
    for (let j = i + 1; j < n; j++) {
      const rj = byModel.get(models[j].id)!
      const kj = agreementKey(survey, rj)
      let v: number | null = null
      if (ki !== null && kj !== null) {
        v = ki === kj ? 100 : 0
      }
      grid[i][j] = v
      grid[j][i] = v
    }
  }

  return { models, matrix: grid }
}
