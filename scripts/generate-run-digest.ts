#!/usr/bin/env npx ts-node
import { createClient } from '@supabase/supabase-js'
import { format, parseISO } from 'date-fns'
import * as dotenv from 'dotenv'
import { normalizePriorityThemeLabel } from '../src/lib/priority-theme-display'
import { surveyConfig } from '../src/lib/survey-config'
dotenv.config({ path: '.env.local' })

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!
// Author precedence: env override → survey-config.json digestAuthor (cheap by default) → first model in roster.
const OVERRIDE_AUTHOR = process.env.DIGEST_AUTHOR_MODEL_ID?.trim() || surveyConfig.models.digestAuthor || null

const args = process.argv.slice(2)
const RUN_IDX = args.indexOf('--run-id')
const TARGET_RUN_ID = RUN_IDX >= 0 ? args[RUN_IDX + 1] : null
/** --all: (re)generate a digest for every completed run. --force: overwrite runs that already have one. */
const ALL_RUNS = args.includes('--all')
const FORCE = args.includes('--force')

interface RunRow {
  id: string
  run_date: string
  status: string
  model_list: string[]
}

interface SurveyRow {
  id: string
  question_id: string
  question_text: string
  topic: string
  options: string[]
  source: string
}

interface ResponseRow {
  survey_id: string
  answer: string | null
  mip_category: string | null
  feed_type: string
  condition: string
}

function isBaseline(r: ResponseRow): boolean {
  return r.condition === 'baseline' && r.feed_type === 'none'
}

function buildSlug(run: RunRow): string {
  const d = format(parseISO(run.run_date), 'yyyy-MM-dd')
  return `${d}-${run.id.slice(0, 8)}`
}

function titleForRun(run: RunRow): string {
  const d = format(parseISO(run.run_date), 'MMMM d, yyyy')
  return `Silicon Pulse briefing - ${d}`
}

function dateDisplay(run: RunRow): string {
  return format(parseISO(run.run_date), 'MMMM d, yyyy')
}

async function resolveAuthor(supabase: any, run: RunRow) {
  const list = Array.isArray(run.model_list) ? run.model_list : []
  const authorId = OVERRIDE_AUTHOR || (list[0] as string | undefined)
  if (!authorId) {
    throw new Error('No author model: run.model_list is empty and DIGEST_AUTHOR_MODEL_ID is not set.')
  }
  const { data: reg, error } = await supabase
    .from('model_registry')
    .select('id, display_name')
    .eq('id', authorId)
    .maybeSingle()
  if (error) throw error
  if (reg) {
    const row = reg as { id: string; display_name: string }
    return { id: row.id, display_name: row.display_name }
  }
  // Configured cheap author may not be in the active registry; synthesize a display name rather than fail.
  console.warn(`Author model ${authorId} not in model_registry — using synthesized display name.`)
  return { id: authorId, display_name: authorId.split('/').pop() ?? authorId }
}

/** Count answers and return the plurality + runner-up. */
function pluralityOf(rows: ResponseRow[]): {
  total: number
  top: string
  topPct: number
  second: string | null
  secondPct: number
} {
  const counts: Record<string, number> = {}
  for (const r of rows) {
    if (!r.answer) continue
    counts[r.answer] = (counts[r.answer] ?? 0) + 1
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const top = sorted[0]
  const second = sorted[1]
  return {
    total,
    top: top?.[0] ?? '-',
    topPct: top && total ? Math.round((top[1] / total) * 100) : 0,
    second: second?.[0] ?? null,
    secondPct: second && total ? Math.round((second[1] / total) * 100) : 0,
  }
}

async function collectFacts(
  _supabase: any,
  run: RunRow,
  surveys: SurveyRow[],
  responses: ResponseRow[]
) {
  const baseline = responses.filter(isBaseline).filter(r => r.answer)
  const informed = responses.filter(r => r.condition === 'informed').filter(r => r.answer)

  const closedSummaries: {
    id: string
    topic: string
    plurality: string
    sharePct: number
    runnerUp: string | null
    runnerUpPct: number
  }[] = []
  const newsShifts: { id: string; topic: string; baseline: string; informed: string }[] = []
  const openThemes: Record<string, number> = {}

  for (const s of surveys) {
    if (s.source === 'open' || !s.options?.length) {
      for (const r of baseline.filter(r => r.survey_id === s.id)) {
        const t = normalizePriorityThemeLabel(r.mip_category)
        openThemes[t] = (openThemes[t] ?? 0) + 1
      }
      continue
    }
    const base = pluralityOf(baseline.filter(r => r.survey_id === s.id))
    if (base.total === 0) continue
    closedSummaries.push({
      id: s.question_id,
      topic: s.topic,
      plurality: base.top,
      sharePct: base.topPct,
      runnerUp: base.second,
      runnerUpPct: base.secondPct,
    })

    // News sensitivity: did the informed (news-context) plurality differ from baseline?
    const inf = pluralityOf(informed.filter(r => r.survey_id === s.id))
    if (inf.total > 0 && inf.top !== base.top) {
      newsShifts.push({ id: s.question_id, topic: s.topic, baseline: base.top, informed: inf.top })
    }
  }

  const byShare = [...closedSummaries].sort((a, b) => b.sharePct - a.sharePct)
  const mostUnified = byShare.slice(0, 3)
  const mostDivided = [...byShare].reverse().slice(0, 3)

  const themeTotal = Object.values(openThemes).reduce((a, b) => a + b, 0)
  const priorityThemes =
    themeTotal > 0
      ? Object.entries(openThemes)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}: ${Math.round((v / themeTotal) * 100)}%`)
          .join('; ')
      : '(theme labels pending)'

  return {
    runDate: dateDisplay(run),
    modelCount: Array.isArray(run.model_list) ? run.model_list.length : 0,
    questionCount: surveys.length,
    hadNewsContext: informed.length > 0,
    mostUnified,
    mostDivided,
    closedForm: closedSummaries,
    newsShifts,
    openPrioritiesThemes: priorityThemes,
  }
}

async function generateBody(authorModelId: string, facts: object): Promise<string> {
  const prompt = `You are the in-house writer for Silicon Pulse - a research project that puts the same survey battery to many large language models on a schedule, with and without recent news context, and tracks how the panel answers over time.

Use ONLY the facts in the JSON below. Do not invent statistics, poll numbers, named events, or quotes. If a fact is absent, do not speculate about it.

FACTS (JSON):
${JSON.stringify(facts, null, 2)}

Write a substantial newsletter-style briefing of about 700–1000 words in plain text. Use short ALL-CAPS section labels on their own line (each followed by a blank line). Write in clear, measured prose - analytical, not breathless. Cover, in roughly this order:

OVERVIEW - what this run covered: the date, how many models answered, how many questions, and whether news context was included this run.

WHERE THE PANEL AGREES - discuss 2-3 items from "mostUnified" (highest plurality share). Refer to questions by their topic or id and give the plurality answer and its share. Note what broad agreement here does and does not imply.

WHERE IT DIVIDES - discuss 2-3 items from "mostDivided" (lowest plurality share). Mention the plurality and the runner-up where useful, and frame these as genuinely contested rather than errors.

NEWS SENSITIVITY - if "hadNewsContext" is true, discuss "newsShifts": questions where the news-context plurality differed from the no-news baseline. If there were no shifts, say plainly that news context moved little this run. If there was no news context, omit this section.

PRIORITIES - summarize the "openPrioritiesThemes" mix (the open-ended "most important issue" item), naming the leading themes and their shares.

INTERPRETATION - two to four restrained sentences: these are model completions under one fixed, minimally-worded protocol; aggregate "agreement" reflects how concentrated the model answers are, not human opinion or model "beliefs"; flagship models are sampled several times so their answers carry an internal consistency signal.

Never mention API costs, dollar amounts, token counts, providers' pricing, or internal tooling. Do not include a sign-off or byline. Do not use Markdown # headings or bullet characters; use plain paragraphs and the ALL-CAPS labels only.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://silicon-pulse.local',
    },
    body: JSON.stringify({
      model: authorModelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(180000),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 400)}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = (data.choices?.[0]?.message?.content ?? '').trim()
  if (!raw) throw new Error('Empty completion from digest author model.')
  return raw
}

function makeExcerpt(body: string): string {
  const one = body.replace(/\s+/g, ' ').trim()
  if (one.length <= 240) return one
  return `${one.slice(0, 237)}…`
}

async function processRun(supabase: any, run: RunRow, surveys: SurveyRow[]): Promise<void> {
  // PostgREST caps at 1000 rows/page; a run has a few thousand responses, so page through them all
  // or the digest facts are computed from a truncated slice (and miss ~half the questions).
  const responses: ResponseRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error: re } = await supabase
      .from('responses')
      .select('survey_id, answer, mip_category, feed_type, condition')
      .eq('run_id', run.id)
      .order('id')
      .range(from, from + 999)
    if (re) throw re
    const rows = (data ?? []) as ResponseRow[]
    responses.push(...rows)
    if (rows.length < 1000) break
  }

  const author = await resolveAuthor(supabase, run)
  const facts = await collectFacts(supabase, run, surveys, responses)

  console.log(`  ${dateDisplay(run)} · ${author.display_name} · ${responses.length} responses`)

  const body = await generateBody(author.id, facts)
  const slug = buildSlug(run)

  const row = {
    run_id: run.id,
    slug,
    title: titleForRun(run),
    run_date_display: dateDisplay(run),
    author_model_id: author.id,
    author_display_name: author.display_name,
    body,
    excerpt: makeExcerpt(body),
  }

  const { error: upErr } = await supabase.from('run_digests').upsert(row, { onConflict: 'run_id' })
  if (upErr) throw upErr
  console.log(`  saved: ${slug}`)
}

async function main() {
  console.log('Run digest')
  if (OVERRIDE_AUTHOR) console.log(`Author: ${OVERRIDE_AUTHOR}`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const { data: surveys, error: se } = await supabase
    .from('surveys')
    .select('id, question_id, question_text, topic, options, source')
    .eq('active', true)
  if (se) throw se
  const surveyRows = (surveys ?? []) as SurveyRow[]

  // Pick the runs to write digests for.
  let runs: RunRow[] = []
  if (ALL_RUNS) {
    const { data, error } = await supabase
      .from('runs')
      .select('id, run_date, status, model_list')
      .eq('status', 'complete')
      .order('run_date', { ascending: true })
    if (error) throw error
    runs = (data ?? []) as RunRow[]
  } else if (TARGET_RUN_ID) {
    const { data, error } = await supabase
      .from('runs')
      .select('id, run_date, status, model_list')
      .eq('id', TARGET_RUN_ID)
      .single()
    if (error) throw error
    runs = [data as RunRow]
  } else {
    const { data, error } = await supabase
      .from('runs')
      .select('id, run_date, status, model_list')
      .eq('status', 'complete')
      .order('run_date', { ascending: false })
      .limit(1)
      .single()
    if (error) throw error
    runs = [data as RunRow]
  }

  runs = runs.filter(r => r && r.status === 'complete')
  if (!runs.length) throw new Error('No suitable completed run found.')

  // When generating for all runs, skip ones that already have a digest unless --force.
  let existing = new Set<string>()
  if (ALL_RUNS && !FORCE) {
    const { data } = await supabase.from('run_digests').select('run_id')
    existing = new Set((data ?? []).map((d: { run_id: string }) => d.run_id))
  }

  let done = 0
  let skipped = 0
  for (const run of runs) {
    if (ALL_RUNS && !FORCE && existing.has(run.id)) {
      skipped++
      continue
    }
    try {
      await processRun(supabase, run, surveyRows)
      done++
    } catch (err) {
      console.error(`  FAILED ${dateDisplay(run)}:`, (err as Error).message)
    }
  }
  console.log(`Done. Wrote ${done} digest(s)${skipped ? `, skipped ${skipped} existing` : ''}.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
