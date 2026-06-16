#!/usr/bin/env npx ts-node
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import type { AnchorModelsFile } from '../src/lib/anchor-models.types'
import { currentModelIdForLab, modelIdForLabAtDate } from '../src/lib/anchor-models'
import { surveyConfig } from '../src/lib/survey-config'
dotenv.config({ path: '.env.local' })

function loadAnchorConfig(): AnchorModelsFile {
  return JSON.parse(readFileSync(join(process.cwd(), 'src/config/anchor-models.json'), 'utf-8'))
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!

// ─── Config (from src/config/survey-config.json) ───────────────────────────────

const BATCH_SIZE = surveyConfig.call.batchSize
const BATCH_DELAY_MS = surveyConfig.call.batchDelayMs
const MAX_RETRIES = surveyConfig.call.maxRetries
const REQUEST_TIMEOUT_MS = surveyConfig.call.requestTimeoutMs

/** Baseline (no news): anchors are always included; this many usage-ranked models fill on top. */
const BASELINE_FILL_CAP = surveyConfig.baseline.fillPoolCap
/** Baseline open-source tier: extra open-weights models stacked on top of anchors + usage fill. */
const BASELINE_OSS_CAP = surveyConfig.baseline.openSourceFillCap
/** Informed (with news): 'anchors-only' keeps cost low; 'pool' reuses the baseline pool. */
const INFORMED_SCOPE = surveyConfig.informed.scope
const INFORMED_FEEDS = surveyConfig.informed.feeds
/** Anchors are sampled this many times per closed-question cell to estimate an answer distribution. */
const ANCHOR_REPS = Math.max(1, surveyConfig.anchors.repetitions)
/** Temperature for sampled anchor draws (0 would make repetition pointless - identical answers). */
const ANCHOR_SAMPLE_TEMP = surveyConfig.anchors.sampleTemperature

// Parse CLI args
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
/** Backfill: skip informed conditions because historical news briefs do not exist. */
const BASELINE_ONLY = args.includes('--baseline-only')
/** Skip the same-day guard and run even if a completed run already exists for this date. */
const FORCE = args.includes('--force')
const MODEL_LIMIT = (() => {
  const idx = args.indexOf('--models')
  return idx >= 0 ? parseInt(args[idx + 1]) : null
})()
const QUESTION_FILTER = (() => {
  const idx = args.indexOf('--questions')
  return idx >= 0 ? args[idx + 1].split(',') : null
})()
/** Backfill: stamp this run with a past date and resolve anchors as of that date. ISO yyyy-mm-dd. */
const RUN_DATE = (() => {
  const idx = args.indexOf('--run-date')
  if (idx < 0) return null
  const v = args[idx + 1]
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid --run-date: ${v} (use yyyy-mm-dd)`)
  return d
})()

// ─── Types ────────────────────────────────────────────────────────────────────

interface Survey {
  id: string
  question_id: string
  question_text: string
  options: string[]
  source: string
  topic: string
}

interface Model {
  id: string
  display_name: string
}

type RegistryRow = {
  id: string
  display_name: string
  anchor_lab: string | null
  usage_rank: number | null
  active: boolean
  open_weights: boolean | null
}

/**
 * Resolve the flagship anchors first (as of `asOf` for backfill, else current), then fill `fillCap`
 * additional slots from the active usage-ranked pool. Anchors are always kept even if retired
 * (inactive rows are allowed for anchors so historical backfill works). Returns the merged roster
 * and the set of anchor ids so callers can run informed conditions on anchors only.
 */
function buildMergedModelList(
  rows: RegistryRow[],
  config: AnchorModelsFile,
  fillCap: number,
  ossCap: number,
  asOf: Date | null
): { models: Model[]; anchorIds: Set<string> } {
  const byId = new Map(rows.map(r => [r.id, r]))
  const anchorModels: Model[] = []
  const anchorIds = new Set<string>()
  const seen = new Set<string>()

  for (const def of config.anchors) {
    const id = asOf ? modelIdForLabAtDate(def, asOf) : currentModelIdForLab(def)
    if (!id) continue // lab not yet launched at asOf
    const row = byId.get(id)
    if (!row) {
      console.error(
        `❌ Anchor ${def.lab} → ${id} not in model_registry. Run npm run update-models after editing anchor-models.json.`
      )
      continue
    }
    if (!seen.has(id)) {
      anchorModels.push({ id: row.id, display_name: row.display_name })
      anchorIds.add(id)
      seen.add(id)
    }
  }

  const usagePool = rows
    .filter(r => r.active && r.usage_rank != null)
    .sort((a, b) => (a.usage_rank ?? 999) - (b.usage_rank ?? 999))

  const usageOrdered: RegistryRow[] =
    usagePool.length > 0
      ? usagePool
      : (() => {
          console.warn(
            '⚠️ No usage_rank in registry — using alphabetical active non-anchor fallback. Run npm run update-models.'
          )
          return rows
            .filter(r => r.active && r.anchor_lab == null)
            .sort((a, b) => a.display_name.localeCompare(b.display_name))
        })()

  const usagePicks: Model[] = []
  for (const u of usageOrdered) {
    if (usagePicks.length >= fillCap) break
    if (!seen.has(u.id)) {
      usagePicks.push({ id: u.id, display_name: u.display_name })
      seen.add(u.id)
    }
  }

  // Open-source tier: top up with additional open-weights models (by usage order) not already picked
  // by the anchor or usage tiers. Keeps the panel diverse + cheap. Set ossCap = 0 to disable.
  const ossPicks: Model[] = []
  if (ossCap > 0) {
    for (const u of usageOrdered) {
      if (ossPicks.length >= ossCap) break
      if (!seen.has(u.id) && u.open_weights) {
        ossPicks.push({ id: u.id, display_name: u.display_name })
        seen.add(u.id)
      }
    }
  }

  const merged = [...anchorModels, ...usagePicks, ...ossPicks]

  console.log(
    `Model merge: ${merged.length} models (anchors ${anchorModels.length}, usage fill ${usagePicks.length}/${fillCap}, open-source ${ossPicks.length}/${ossCap})` +
      (asOf ? ` — anchors as of ${asOf.toISOString().slice(0, 10)}` : '')
  )
  return { models: merged, anchorIds }
}

interface NewsBrief {
  id: string
  feed_type: string
  content: string
}

interface SurveyTask {
  survey: Survey
  model: Model
  condition: 'baseline' | 'informed'
  feedType: 'balanced' | 'left' | 'right' | 'none'
  brief?: NewsBrief
  runId: string
  /** Flagship anchors reason (and get the informed feed); other models give structured answers only. */
  isAnchor: boolean
  /** 0-based draw index within a cell. Anchors are sampled ANCHOR_REPS times; everyone else uses 0. */
  sampleIndex: number
}

/** Anchors sample at a nonzero temperature so repeats reveal a distribution; everyone else is deterministic. */
function temperatureForTask(task: SurveyTask): number {
  const isOpen = task.survey.source === 'open'
  return task.isAnchor && !isOpen ? ANCHOR_SAMPLE_TEMP : surveyConfig.call.temperature
}

/** Only the first anchor draw on a closed question reasons (for the displayed rationale); repeats are answer-only. */
function withReasoningForTask(task: SurveyTask): boolean {
  return task.isAnchor && task.survey.source !== 'open' && task.sampleIndex === 0
}

interface TaskResult {
  task: SurveyTask
  success: boolean
  answer: string | null
  reasoning: string | null
  rawResponse: string | null
  error: string | null
  tokensInput: number | null
  tokensOutput: number | null
  costUsd: number | null
  latencyMs: number | null
  optionOrder: string[]
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Minimal prompt by design: we want the model's own view, not a view shaped by framing, so we add as
 * little instruction as possible. News context (when present) is given as bare headlines. Only anchors
 * are asked to reason; every other model returns just the chosen option to stay fast and cheap.
 */
function buildPrompt(
  survey: Survey,
  shuffledOptions: string[],
  opts: { brief?: string; withReasoning: boolean }
): string {
  const newsBlock = opts.brief ? `Recent news headlines:\n${opts.brief}\n\n` : ''

  if (survey.source === 'open') {
    // Free-text item: the answer IS the text; never a Answer/Reasoning format.
    return `${newsBlock}${survey.question_text}\n\nAnswer in one or two sentences.`
  }

  const optionList = shuffledOptions.join(' / ')

  if (opts.withReasoning) {
    return `${newsBlock}${survey.question_text}
Options: ${optionList}

Answer: <one of the options above>
Reasoning: <one sentence>`
  }

  return `${newsBlock}${survey.question_text}
Options: ${optionList}

Reply with exactly one of the options above and nothing else.`
}

// ─── Response Parsing ─────────────────────────────────────────────────────────

function parseResponse(
  raw: string,
  validOptions: string[]
): { answer: string | null; reasoning: string | null } {
  const answerMatch = raw.match(/^Answer:\s*(.+)$/im)
  const reasoningMatch = raw.match(/^Reasoning:\s*(.+)$/im)

  const answer = answerMatch ? answerMatch[1].trim() : null
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : null

  if (answer) {
    const matched = matchOption(answer, validOptions)
    if (matched) return { answer: matched, reasoning }
  }

  // Fallback: find any option in the response
  const lower = raw.toLowerCase()
  const sorted = [...validOptions].sort((a, b) => b.length - a.length)
  for (const opt of sorted) {
    if (lower.includes(opt.toLowerCase())) {
      return { answer: opt, reasoning }
    }
  }

  return { answer: null, reasoning }
}

function matchOption(raw: string, options: string[]): string | null {
  const normalized = raw.toLowerCase().trim()
  return (
    options.find(o => o.toLowerCase() === normalized) ??
    options.find(o => normalized.startsWith(o.toLowerCase())) ??
    options.find(o => normalized.includes(o.toLowerCase())) ??
    null
  )
}

// ─── API Call ─────────────────────────────────────────────────────────────────

async function callOpenRouter(
  modelId: string,
  prompt: string,
  maxTokens: number,
  temperature: number
): Promise<{
  content: string
  tokensInput: number
  tokensOutput: number
  costUsd: number | null
  latencyMs: number
}> {
  const start = Date.now()

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://silicon-pulse.vercel.app',
      'X-Title': 'Silicon Pulse Research',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const latencyMs = Date.now() - start

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`HTTP ${response.status}: ${err.slice(0, 200)}`)
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: string }
  }
  const content = data.choices?.[0]?.message?.content ?? ''
  const usage = data.usage ?? {}

  // OpenRouter sometimes returns cost in the response metadata
  let costUsd: number | null = null
  if (data.usage?.cost) {
    costUsd = parseFloat(data.usage.cost)
  }

  return {
    content,
    tokensInput: usage.prompt_tokens ?? 0,
    tokensOutput: usage.completion_tokens ?? 0,
    costUsd,
    latencyMs,
  }
}

// ─── Task Execution ───────────────────────────────────────────────────────────

async function executeTask(task: SurveyTask): Promise<TaskResult> {
  const isOpenPriorities = task.survey.source === 'open'
  const shuffledOptions = isOpenPriorities ? [] : shuffleArray(task.survey.options)
  // Only the first anchor draw reasons on closed questions (the rest are answer-only samples). Open
  // questions are free text for everyone (no reasoning field).
  const withReasoning = withReasoningForTask(task)
  const temperature = temperatureForTask(task)
  // Standard OpenRouter call. Keep the budget wide enough that reasoning-mandatory models aren't
  // truncated; non-reasoning models stop early at EOS anyway.
  const maxTokens = isOpenPriorities ? 160 : surveyConfig.call.maxTokens
  const prompt = buildPrompt(task.survey, shuffledOptions, { brief: task.brief?.content, withReasoning })

  // Dry run: never hit OpenRouter (no network, no cost). Return a synthetic placeholder so the rest
  // of the pipeline (counts, logging) still exercises without spending.
  if (DRY_RUN) {
    return {
      task,
      success: true,
      answer: shuffledOptions[0] ?? '(dry)',
      reasoning: null,
      rawResponse: null,
      error: null,
      tokensInput: 0,
      tokensOutput: 0,
      costUsd: 0,
      latencyMs: 0,
      optionOrder: shuffledOptions,
    }
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callOpenRouter(task.model.id, prompt, maxTokens, temperature)

      const { answer, reasoning } = isOpenPriorities
        ? { answer: result.content.slice(0, 1000), reasoning: null }
        : parseResponse(result.content, shuffledOptions)

      return {
        task,
        success: true,
        answer,
        reasoning,
        rawResponse: result.content,
        error: null,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        optionOrder: shuffledOptions,
      }
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        const errorMsg = (err as Error).message
        console.warn(`fail ${task.model.id} / ${task.survey.question_id}: ${errorMsg.slice(0, 100)}`)
        return {
          task,
          success: false,
          answer: null,
          reasoning: null,
          rawResponse: null,
          error: errorMsg,
          tokensInput: null,
          tokensOutput: null,
          costUsd: null,
          latencyMs: null,
          optionOrder: shuffledOptions,
        }
      }
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  throw new Error('unreachable')
}

// ─── Batch Processor ─────────────────────────────────────────────────────────

function rowFromResult(r: TaskResult) {
  return {
    run_id: r.task.runId,
    survey_id: r.task.survey.id,
    model_id: r.task.model.id,
    model_name: r.task.model.display_name,
    condition: r.task.condition,
    feed_type: r.task.feedType,
    news_brief_id: r.task.brief?.id ?? null,
    answer: r.answer,
    reasoning: r.reasoning,
    // Lean storage: keep the full raw text only when we failed to parse a structured answer
    // (for debugging); otherwise answer + reasoning are enough and rows stay small.
    raw_response: r.success && r.answer != null ? null : r.rawResponse,
    error: r.error,
    option_order: r.optionOrder,
    sample_index: r.task.sampleIndex,
    temperature: temperatureForTask(r.task),
    tokens_input: r.tokensInput,
    tokens_output: r.tokensOutput,
    cost_usd: r.costUsd,
    latency_ms: r.latencyMs,
  }
}

/**
 * Continuous worker pool: keeps BATCH_SIZE requests in flight at all times instead of waiting for a
 * whole batch to finish (which stalled on the slowest model). Results are flushed to the DB in chunks
 * as they accumulate so progress is durable even if the process is interrupted.
 */
async function runBatch(tasks: SurveyTask[], supabase: SupabaseClient): Promise<{
  succeeded: number
  failed: number
  totalCost: number
}> {
  let succeeded = 0
  let failed = 0
  let totalCost = 0
  let next = 0
  let done = 0
  const FLUSH_SIZE = 60
  let buffer: TaskResult[] = []
  let flushing = false

  async function flush() {
    if (DRY_RUN || buffer.length === 0) return
    const batch = buffer
    buffer = []
    const { error } = await supabase.from('responses').insert(batch.map(rowFromResult))
    if (error) console.error('  DB insert error:', error.message)
  }

  async function worker() {
    while (next < tasks.length) {
      const r = await executeTask(tasks[next++])
      if (r.success) {
        succeeded++
        totalCost += r.costUsd ?? 0
      } else {
        failed++
      }
      buffer.push(r)
      done++
      if (done % 50 === 0 || done === tasks.length) {
        console.log(`  ${done}/${tasks.length} (ok ${succeeded}, fail ${failed})`)
      }
      if (!flushing && buffer.length >= FLUSH_SIZE) {
        flushing = true
        await flush()
        flushing = false
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(BATCH_SIZE, tasks.length) }, worker))
  await flush()
  return { succeeded, failed, totalCost }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Silicon Pulse survey run' + (DRY_RUN ? ' (dry)' : ''))

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // Fetch ALL rows (incl. inactive) so historical anchors resolve for backfill; the usage pool is
  // filtered to active rows inside buildMergedModelList.
  const { data: regRows, error: modelsError } = await supabase
    .from('model_registry')
    .select('id, display_name, anchor_lab, usage_rank, active, open_weights')
  if (modelsError) throw modelsError
  if (!regRows?.length) throw new Error('No models in registry. Run npm run update-models first.')

  const anchorConfig = loadAnchorConfig()
  const { models: merged, anchorIds } = buildMergedModelList(
    regRows as RegistryRow[],
    anchorConfig,
    BASELINE_FILL_CAP,
    BASELINE_OSS_CAP,
    RUN_DATE
  )
  const pool = MODEL_LIMIT != null ? merged.slice(0, MODEL_LIMIT) : merged

  const baselineModels = pool
  const informedModels =
    INFORMED_SCOPE === 'anchors-only' ? pool.filter(m => anchorIds.has(m.id)) : pool

  console.log(
    `Models: baseline ${baselineModels.length} (anchors+fill ${BASELINE_FILL_CAP}), ` +
      `informed ${informedModels.length} (scope ${INFORMED_SCOPE})`
  )

  // 2. Load active surveys
  const surveyQuery = supabase
    .from('surveys')
    .select('id, question_id, question_text, options, source, topic')
    .eq('active', true)
  const { data: surveys, error: surveysError } = await surveyQuery
  if (surveysError) throw surveysError
  if (!surveys?.length) throw new Error('No active surveys found.')

  const activeSurveys = QUESTION_FILTER
    ? surveys.filter((s: Survey) => QUESTION_FILTER.includes(s.question_id))
    : surveys
  console.log(`Questions: ${activeSurveys.length}`)

  // 3. Load news briefs (one per feed type). For a backfill run (--run-date) we load the briefs built
  // for THAT day (real historical headlines via GDELT); otherwise the most recent briefs.
  const includeInformed = !BASELINE_ONLY
  const briefsByType: Record<string, NewsBrief> = {}
  if (includeInformed) {
    let q = supabase
      .from('news_briefs')
      .select('id, feed_type, content, created_at')
      .order('created_at', { ascending: false })
    if (RUN_DATE) {
      const day = RUN_DATE.toISOString().slice(0, 10)
      q = q.gte('created_at', `${day}T00:00:00Z`).lte('created_at', `${day}T23:59:59Z`)
    } else {
      q = q.limit(10)
    }
    const { data: briefsData, error: briefsError } = await q
    if (briefsError) throw briefsError
    for (const brief of briefsData ?? []) {
      if (!briefsByType[brief.feed_type]) briefsByType[brief.feed_type] = brief
    }
  } else {
    console.log(`Baseline-only run${RUN_DATE ? ' (backfill)' : ''} - skipping informed conditions.`)
  }

  const hasBriefs = Object.keys(briefsByType).length
  console.log(`News brief feeds: ${hasBriefs}${RUN_DATE && includeInformed ? ` (for ${RUN_DATE.toISOString().slice(0, 10)})` : ''}`)
  if (includeInformed && hasBriefs === 0) {
    console.warn('No news briefs - only baseline (no informed conditions).')
  }

  // 4. Create run record (stamp past date for backfill runs)
  let runId = 'dry-run'
  if (!DRY_RUN) {
    // Idempotency guard: don't create a second run for a date that already has a completed one.
    // (A failed/partial run for the same date is allowed to be retried.) Override with --force.
    if (!FORCE) {
      const targetDay = (RUN_DATE ?? new Date()).toISOString().slice(0, 10)
      const { data: recentRuns } = await supabase
        .from('runs')
        .select('id, run_date, created_at, status')
        .order('created_at', { ascending: false })
        .limit(50)
      const existing = (recentRuns ?? []).find(
        r =>
          ((r.run_date ?? r.created_at) as string | null)?.slice(0, 10) === targetDay &&
          r.status === 'complete'
      )
      if (existing) {
        console.log(
          `A completed run already exists for ${targetDay} (${(existing.id as string).slice(0, 8)}). ` +
            `Skipping to avoid a duplicate. Pass --force to run anyway.`
        )
        return
      }
    }

    const runRow: Record<string, unknown> = {
      status: 'running',
      model_list: baselineModels.map((m: Model) => m.id),
      brief_ids: Object.fromEntries(Object.entries(briefsByType).map(([k, v]) => [k, v.id])),
    }
    if (RUN_DATE) runRow.run_date = RUN_DATE.toISOString()
    const { data: run, error: runError } = await supabase
      .from('runs')
      .insert(runRow)
      .select('id')
      .single()
    if (runError) throw runError
    runId = run.id
  }

  console.log(`Run ID: ${runId}\n`)

  const tasks: SurveyTask[] = []

  // Anchors are sampled ANCHOR_REPS times per closed-question cell to estimate a distribution; fill
  // models and open-ended items get a single deterministic draw.
  const repsFor = (isAnchor: boolean, survey: Survey) =>
    isAnchor && survey.source !== 'open' ? ANCHOR_REPS : 1

  for (const survey of activeSurveys) {
    for (const model of baselineModels) {
      const isAnchor = anchorIds.has(model.id)
      for (let s = 0; s < repsFor(isAnchor, survey); s++) {
        tasks.push({
          survey,
          model,
          condition: 'baseline',
          feedType: 'none',
          brief: undefined,
          runId,
          isAnchor,
          sampleIndex: s,
        })
      }
    }

    if (hasBriefs > 0) {
      for (const model of informedModels) {
        const isAnchor = anchorIds.has(model.id)
        for (const feedType of INFORMED_FEEDS) {
          const brief = briefsByType[feedType]
          if (!brief) continue
          for (let s = 0; s < repsFor(isAnchor, survey); s++) {
            tasks.push({
              survey,
              model,
              condition: 'informed',
              feedType,
              brief,
              runId,
              isAnchor,
              sampleIndex: s,
            })
          }
        }
      }
    }
  }

  console.log(`Tasks: ${tasks.length} (anchor reps ${ANCHOR_REPS} @ temp ${ANCHOR_SAMPLE_TEMP})`)

  // 6. Execute
  const startTime = Date.now()
  const { succeeded, failed, totalCost } = await runBatch(tasks, supabase)
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1)

  console.log(`Done in ${elapsed}m - ok ${succeeded}, failed ${failed}`)

  // 7. Update run record
  if (!DRY_RUN) {
    await supabase
      .from('runs')
      .update({
        status: failed > succeeded / 2 ? 'failed' : 'complete',
        total_calls: succeeded + failed,
        total_cost: totalCost,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
  }

}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
