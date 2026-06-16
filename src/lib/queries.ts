import { supabase } from './supabase'
import { countsToPercents } from './parse'
import type {
  Survey, Run, Response, ModelRegistry, NewsBrief,
  DriftAlert, TimeSeriesPoint, RunModelParticipation, RunDigest,
} from './types'
import { PRIORITIES_QUESTION_ID } from './priorities-constants'

// PostgREST caps a single response at 1000 rows. A run can hold a few thousand response rows, so any
// "all rows for a run / survey" query must page through with .range() or it silently drops data
// (which made ~half the questions look empty on the dashboard). This helper loops until a short page.
const PAGE_SIZE = 1000
type PageResult<T> = { data: T[] | null; error: { message: string } | null }

async function fetchAllRows<T>(
  makePage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makePage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return out
}

// ─── Surveys ──────────────────────────────────────────────────────────────────

export async function getActiveSurveys(): Promise<Survey[]> {
  const { data, error } = await supabase
    .from('surveys')
    .select('*')
    .eq('active', true)
    .order('question_id')
  if (error) throw error
  return data ?? []
}

/** Open priorities item first, then SP-* by id */
export function sortSurveysForHome(surveys: Survey[]): Survey[] {
  return [...surveys].sort((a, b) => {
    if (a.question_id === PRIORITIES_QUESTION_ID) return -1
    if (b.question_id === PRIORITIES_QUESTION_ID) return 1
    return a.question_id.localeCompare(b.question_id)
  })
}

export async function getSurveyByQuestionId(questionId: string): Promise<Survey | null> {
  const { data, error } = await supabase
    .from('surveys')
    .select('*')
    .eq('question_id', questionId)
    .single()
  if (error) return null
  return data
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export async function getLatestRun(): Promise<Run | null> {
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('status', 'complete')
    .order('run_date', { ascending: false })
    .limit(1)
    .single()
  if (error) return null
  return data
}

export async function getAllRuns(): Promise<Run[]> {
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .order('run_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** News briefs attached to a run (balanced / left / right). */
export async function getNewsBriefsForRun(run: Run): Promise<NewsBrief[]> {
  const ids = Object.values(run.brief_ids ?? {}).filter(Boolean) as string[]
  if (!ids.length) return []
  const { data, error } = await supabase.from('news_briefs').select('*').in('id', ids)
  if (error) throw error
  return data ?? []
}

// ─── Models ───────────────────────────────────────────────────────────────────

export async function getActiveModels(): Promise<ModelRegistry[]> {
  const { data, error } = await supabase
    .from('model_registry')
    .select('*')
    .eq('active', true)
    .order('display_name')
  if (error) throw error
  return data ?? []
}

export async function getAllModels(): Promise<ModelRegistry[]> {
  const { data, error } = await supabase
    .from('model_registry')
    .select('*')
    .order('display_name')
  if (error) throw error
  return data ?? []
}

export async function getModelById(modelId: string): Promise<ModelRegistry | null> {
  const { data, error } = await supabase
    .from('model_registry')
    .select('*')
    .eq('id', modelId)
    .single()
  if (error) return null
  return data
}

// ─── Responses ────────────────────────────────────────────────────────────────

export async function getResponsesForRun(runId: string): Promise<Response[]> {
  return fetchAllRows<Response>((from, to) =>
    supabase.from('responses').select('*').eq('run_id', runId).order('id').range(from, to)
  )
}

export async function getResponsesForSurvey(
  surveyId: string,
  runId?: string
): Promise<Response[]> {
  return fetchAllRows<Response>((from, to) => {
    let query = supabase
      .from('responses')
      .select('*')
      .eq('survey_id', surveyId)
      .not('answer', 'is', null)
    if (runId) query = query.eq('run_id', runId)
    return query.order('created_at', { ascending: false }).order('id').range(from, to)
  })
}

export async function getModelResponseHistory(
  modelId: string,
  surveyId: string
): Promise<Response[]> {
  const { data, error } = await supabase
    .from('responses')
    .select('*, runs(run_date)')
    .eq('model_id', modelId)
    .eq('survey_id', surveyId)
    .not('answer', 'is', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ─── Computed: Run participation ───────────────────────────────────────────────

export async function getRunResponseTotals(runId: string): Promise<{
  total: number
  ok: number
  failed: number
}> {
  const rows = await fetchAllRows<{ error: string | null }>((from, to) =>
    supabase.from('responses').select('error').eq('run_id', runId).order('id').range(from, to)
  )
  const failed = rows.filter(r => r.error != null && String(r.error).length > 0).length
  const ok = rows.length - failed
  return { total: rows.length, ok, failed }
}

export async function getRunModelParticipation(runId: string): Promise<RunModelParticipation[]> {
  const { data: runRow } = await supabase.from('runs').select('model_list').eq('id', runId).single()

  const responses = await fetchAllRows<{ model_id: string; model_name: string; error: string | null }>(
    (from, to) =>
      supabase
        .from('responses')
        .select('model_id, model_name, error')
        .eq('run_id', runId)
        .order('id')
        .range(from, to)
  )

  const tally = new Map<string, { model_name: string; ok: number; failed: number }>()
  for (const r of responses) {
    if (!tally.has(r.model_id)) {
      tally.set(r.model_id, { model_name: r.model_name, ok: 0, failed: 0 })
    }
    const row = tally.get(r.model_id)!
    if (r.error != null && String(r.error).length > 0) row.failed++
    else row.ok++
  }

  const planned: string[] = Array.isArray(runRow?.model_list) ? runRow.model_list : []
  for (const id of planned) {
    if (!tally.has(id)) {
      tally.set(id, { model_name: id, ok: 0, failed: 0 })
    }
  }

  const { data: models } = await supabase.from('model_registry').select('*')
  const modelMeta = new Map((models ?? []).map((m: ModelRegistry) => [m.id, m]))

  const out: RunModelParticipation[] = [...tally.entries()].map(([model_id, v]) => {
    const meta = modelMeta.get(model_id)
    return {
      model_id,
      model_name: meta?.display_name ?? v.model_name,
      provider: meta?.provider ?? 'unknown',
      origin: meta?.origin ?? null,
      anchor_lab: meta?.anchor_lab ?? null,
      responses_ok: v.ok,
      responses_failed: v.failed,
    }
  })

  return out.sort((a, b) => b.responses_ok - a.responses_ok || a.model_name.localeCompare(b.model_name))
}

// ─── Computed: Drift Alerts ────────────────────────────────────────────────────

export async function getDriftAlerts(
  currentRunId: string,
  previousRunId: string
): Promise<DriftAlert[]> {
  type DriftRow = {
    model_id: string
    model_name?: string
    survey_id: string
    answer: string
    feed_type: string
  }
  let current: DriftRow[]
  let previous: DriftRow[]
  try {
    ;[current, previous] = await Promise.all([
      fetchAllRows<DriftRow>((from, to) =>
        supabase
          .from('responses')
          .select('model_id, model_name, survey_id, answer, feed_type')
          .eq('run_id', currentRunId)
          .eq('condition', 'baseline')
          .not('answer', 'is', null)
          .order('id')
          .range(from, to)
      ),
      fetchAllRows<DriftRow>((from, to) =>
        supabase
          .from('responses')
          .select('model_id, survey_id, answer, feed_type')
          .eq('run_id', previousRunId)
          .eq('condition', 'baseline')
          .not('answer', 'is', null)
          .order('id')
          .range(from, to)
      ),
    ])
  } catch {
    return []
  }

  const { data: surveys } = await supabase.from('surveys').select('*')
  const surveyMap = new Map((surveys ?? []).map((s: Survey) => [s.id, s]))

  const prevMap = new Map<string, string>()
  for (const r of previous) {
    prevMap.set(`${r.model_id}::${r.survey_id}::${r.feed_type}`, r.answer)
  }

  const alerts: DriftAlert[] = []
  for (const r of current) {
    const key = `${r.model_id}::${r.survey_id}::${r.feed_type}`
    const prevAnswer = prevMap.get(key)
    if (prevAnswer && prevAnswer !== r.answer) {
      const survey = surveyMap.get(r.survey_id)
      alerts.push({
        model_id: r.model_id,
        model_name: r.model_name ?? r.model_id,
        survey_id: r.survey_id,
        question_id: survey?.question_id ?? '',
        question_text: survey?.question_text ?? '',
        prev_answer: prevAnswer,
        curr_answer: r.answer,
        feed_type: r.feed_type as DriftAlert['feed_type'],
        run_date: new Date().toISOString(),
      })
    }
  }

  return alerts
}

// ─── Computed: Time Series ─────────────────────────────────────────────────────

export async function getTimeSeriesForSurvey(surveyId: string): Promise<TimeSeriesPoint[]> {
  const { data: runs } = await supabase
    .from('runs')
    .select('id, run_date')
    .eq('status', 'complete')
    .order('run_date', { ascending: true })

  if (!runs?.length) return []

  const points: TimeSeriesPoint[] = []

  for (const run of runs) {
    const { data: responses } = await supabase
      .from('responses')
      .select('feed_type, answer')
      .eq('run_id', run.id)
      .eq('survey_id', surveyId)
      .not('answer', 'is', null)

    if (!responses?.length) continue

    // Group by feed_type
    const byFeed = new Map<string, string[]>()
    for (const r of responses) {
      if (!byFeed.has(r.feed_type)) byFeed.set(r.feed_type, [])
      byFeed.get(r.feed_type)!.push(r.answer)
    }

    for (const [feedType, answers] of byFeed) {
      const counts: Record<string, number> = {}
      for (const a of answers) counts[a] = (counts[a] ?? 0) + 1
      const dist = countsToPercents(counts)

      points.push({
        run_date: run.run_date,
        run_id: run.id,
        feed_type: feedType as any,
        answer_distribution: dist,
        model_count: answers.length,
      })
    }
  }

  return points
}

// ─── News Briefs ──────────────────────────────────────────────────────────────

export async function getNewsBrief(briefId: string): Promise<NewsBrief | null> {
  const { data, error } = await supabase
    .from('news_briefs')
    .select('*')
    .eq('id', briefId)
    .single()
  if (error) return null
  return data
}

export async function getNewsBriefsByRun(briefIds: Record<string, string>): Promise<NewsBrief[]> {
  const ids = Object.values(briefIds)
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('news_briefs')
    .select('*')
    .in('id', ids)
  if (error) return []
  return data ?? []
}

// ─── Run digests (briefing newsletter) ────────────────────────────────────────

const DIGEST_PAGE_SIZE = 10

export async function getRunDigestsPage(
  page: number
): Promise<{ digests: RunDigest[]; total: number; pageSize: number }> {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
  const from = (safePage - 1) * DIGEST_PAGE_SIZE
  const to = from + DIGEST_PAGE_SIZE - 1

  const { data, error, count } = await supabase
    .from('run_digests')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  const total = count ?? 0
  return {
    digests: (data ?? []) as RunDigest[],
    total,
    pageSize: DIGEST_PAGE_SIZE,
  }
}

export async function getRunDigestBySlug(slug: string): Promise<RunDigest | null> {
  const { data, error } = await supabase.from('run_digests').select('*').eq('slug', slug).maybeSingle()
  if (error) return null
  return data as RunDigest | null
}
