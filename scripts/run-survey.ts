#!/usr/bin/env npx ts-node
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import type { AnchorModelsFile } from '../src/lib/anchor-models.types'
import { currentModelIdForLab } from '../src/lib/anchor-models'
dotenv.config({ path: '.env.local' })

function loadAnchorConfig(): AnchorModelsFile {
  return JSON.parse(readFileSync(join(process.cwd(), 'src/config/anchor-models.json'), 'utf-8'))
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE = 8
const BATCH_DELAY_MS = 2000
const MAX_RETRIES = 2
const REQUEST_TIMEOUT_MS = 120000

/** Baseline (no news): up to this many models × all questions. Match TARGET_MODEL_COUNT in update-models.ts. */
const BASELINE_MODEL_CAP = 15
/** Informed (with news): up to this many models × each digest slice - keeps news-side API usage bounded. */
const INFORMED_MODEL_CAP = 15

// Parse CLI args
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const MODEL_LIMIT = (() => {
  const idx = args.indexOf('--models')
  return idx >= 0 ? parseInt(args[idx + 1]) : null
})()
const QUESTION_FILTER = (() => {
  const idx = args.indexOf('--questions')
  return idx >= 0 ? args[idx + 1].split(',') : null
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
}

/**
 * Anchors first (per `anchor-models.json`), then fill from weekly usage leaderboard without duplicate ids.
 * Total length is capped at `baselineCap`.
 */
function buildMergedModelList(
  rows: RegistryRow[],
  config: AnchorModelsFile,
  baselineCap: number
): Model[] {
  const byId = new Map(rows.map(r => [r.id, r]))
  const merged: Model[] = []
  const seen = new Set<string>()

  for (const def of config.anchors) {
    const id = currentModelIdForLab(def)
    const row = byId.get(id)
    if (!row) {
      console.error(
        `❌ Anchor ${def.lab} → ${id} not in model_registry. Run npm run update-models after editing anchor-models.json.`
      )
      continue
    }
    if (!seen.has(id)) {
      merged.push({ id: row.id, display_name: row.display_name })
      seen.add(id)
    }
  }

  const usagePool = rows
    .filter(r => r.usage_rank != null)
    .sort((a, b) => (a.usage_rank ?? 999) - (b.usage_rank ?? 999))

  const usageOrdered: RegistryRow[] =
    usagePool.length > 0
      ? usagePool
      : (() => {
          console.warn(
            '⚠️ No usage_rank in registry — using alphabetical non-anchor fallback. Run npm run update-models.'
          )
          return rows
            .filter(r => r.anchor_lab == null)
            .sort((a, b) => a.display_name.localeCompare(b.display_name))
        })()

  for (const u of usageOrdered) {
    if (merged.length >= baselineCap) break
    if (!seen.has(u.id)) {
      merged.push({ id: u.id, display_name: u.display_name })
      seen.add(u.id)
    }
  }

  const nAnch = config.anchors.filter(d => byId.has(currentModelIdForLab(d))).length
  console.log(
    `Model merge: ${merged.length} models (cap ${baselineCap}) — ${nAnch} anchor labs resolved, ` +
      `${usageOrdered.length} usage-pool rows, ${seen.size} unique ids`
  )
  return merged
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

function buildPrompt(survey: Survey, shuffledOptions: string[], brief?: string): string {
  const optionList = shuffledOptions.join(' / ')

  if (brief) {
    return `You are participating in a social science research study examining how AI systems respond to public opinion survey questions.

Before answering, consider the following summary of recent news coverage:

---
${brief}
---

Now answer the following question by selecting ONE option from the list provided, then explain your reasoning in one sentence.

Question: ${survey.question_text}
Options: ${optionList}

Respond in this exact format:
Answer: [your choice]
Reasoning: [one sentence]`
  }

  if (survey.source === 'open') {
    return `You are participating in a social science research study.

In your view, what is the most important problem facing the United States today? Give a brief answer in one or two sentences.`
  }

  return `You are participating in a social science research study examining how AI systems respond to public opinion survey questions.

Answer the following question by selecting ONE option from the list provided, then explain your reasoning in one sentence.

Question: ${survey.question_text}
Options: ${optionList}

Respond in this exact format:
Answer: [your choice]
Reasoning: [one sentence]`
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
  prompt: string
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
      temperature: 0,
      max_tokens: 512,
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
  const prompt = buildPrompt(task.survey, shuffledOptions, task.brief?.content)

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callOpenRouter(task.model.id, prompt)

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

async function runBatch(tasks: SurveyTask[], supabase: SupabaseClient): Promise<{
  succeeded: number
  failed: number
  totalCost: number
}> {
  let succeeded = 0
  let failed = 0
  let totalCost = 0

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE)
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tasks.length / BATCH_SIZE)} (${batch.length} calls)...`)

    const results = await Promise.all(batch.map(executeTask))

    if (!DRY_RUN) {
      const rows = results.map(r => ({
        run_id: r.task.runId,
        survey_id: r.task.survey.id,
        model_id: r.task.model.id,
        model_name: r.task.model.display_name,
        condition: r.task.condition,
        feed_type: r.task.feedType,
        news_brief_id: r.task.brief?.id ?? null,
        answer: r.answer,
        reasoning: r.reasoning,
        raw_response: r.rawResponse,
        error: r.error,
        option_order: r.optionOrder,
        temperature: 0,
        tokens_input: r.tokensInput,
        tokens_output: r.tokensOutput,
        cost_usd: r.costUsd,
        latency_ms: r.latencyMs,
      }))

      const { error } = await supabase.from('responses').insert(rows)
      if (error) console.error('  DB insert error:', error.message)
    }

    for (const r of results) {
      if (r.success) {
        succeeded++
        totalCost += r.costUsd ?? 0
      } else {
        failed++
      }
    }

    if (i + BATCH_SIZE < tasks.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  return { succeeded, failed, totalCost }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Silicon Pulse survey run' + (DRY_RUN ? ' (dry)' : ''))

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const { data: regRows, error: modelsError } = await supabase
    .from('model_registry')
    .select('id, display_name, anchor_lab, usage_rank')
    .eq('active', true)
  if (modelsError) throw modelsError
  if (!regRows?.length) throw new Error('No active models in registry.')

  const anchorConfig = loadAnchorConfig()
  const merged = buildMergedModelList(regRows as RegistryRow[], anchorConfig, BASELINE_MODEL_CAP)
  const pool = MODEL_LIMIT != null ? merged.slice(0, MODEL_LIMIT) : merged

  const baselineModels = pool.slice(0, Math.min(BASELINE_MODEL_CAP, pool.length))
  const informedModels = pool.slice(0, Math.min(INFORMED_MODEL_CAP, pool.length))

  console.log(
    `Models: baseline ${baselineModels.length} (cap ${BASELINE_MODEL_CAP}), informed ${informedModels.length} (cap ${INFORMED_MODEL_CAP})`
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

  // 3. Load recent news briefs (one per feed type, most recent)
  const { data: briefsData, error: briefsError } = await supabase
    .from('news_briefs')
    .select('id, feed_type, content')
    .order('created_at', { ascending: false })
    .limit(10)
  if (briefsError) throw briefsError

  const briefsByType: Record<string, NewsBrief> = {}
  for (const brief of briefsData ?? []) {
    if (!briefsByType[brief.feed_type]) briefsByType[brief.feed_type] = brief
  }

  const hasBriefs = Object.keys(briefsByType).length
  console.log(`News brief feeds: ${hasBriefs}`)
  if (hasBriefs === 0) {
    console.warn('No news briefs - only baseline (no informed conditions).')
  }

  // 4. Create run record
  let runId = 'dry-run'
  if (!DRY_RUN) {
    const { data: run, error: runError } = await supabase
      .from('runs')
      .insert({
        status: 'running',
        model_list: baselineModels.map((m: Model) => m.id),
        brief_ids: Object.fromEntries(Object.entries(briefsByType).map(([k, v]) => [k, v.id])),
      })
      .select('id')
      .single()
    if (runError) throw runError
    runId = run.id
  }

  console.log(`Run ID: ${runId}\n`)

  const tasks: SurveyTask[] = []

  for (const survey of activeSurveys) {
    for (const model of baselineModels) {
      tasks.push({
        survey,
        model,
        condition: 'baseline',
        feedType: 'none',
        brief: undefined,
        runId,
      })
    }

    if (hasBriefs > 0) {
      for (const model of informedModels) {
        for (const feedType of ['balanced', 'left', 'right'] as const) {
          const brief = briefsByType[feedType]
          if (brief) {
            tasks.push({
              survey,
              model,
              condition: 'informed',
              feedType,
              brief,
              runId,
            })
          }
        }
      }
    }
  }

  console.log(`Tasks: ${tasks.length}`)

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
