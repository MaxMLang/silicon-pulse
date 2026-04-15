#!/usr/bin/env npx ts-node
import { createClient } from '@supabase/supabase-js'
import { format, parseISO } from 'date-fns'
import * as dotenv from 'dotenv'
import { normalizePriorityThemeLabel } from '../src/lib/priority-theme-display'
dotenv.config({ path: '.env.local' })

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OVERRIDE_AUTHOR = process.env.DIGEST_AUTHOR_MODEL_ID?.trim() || null

const args = process.argv.slice(2)
const RUN_IDX = args.indexOf('--run-id')
const TARGET_RUN_ID = RUN_IDX >= 0 ? args[RUN_IDX + 1] : null

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
  if (!reg) throw new Error(`Author model ${authorId} not found in model_registry.`)
  const row = reg as { id: string; display_name: string }
  return { id: row.id, display_name: row.display_name }
}

async function collectFacts(
  supabase: any,
  run: RunRow,
  surveys: SurveyRow[],
  responses: ResponseRow[]
) {
  const baseline = responses.filter(isBaseline).filter(r => r.answer)

  const closedSummaries: { id: string; topic: string; plurality: string; sharePct: number }[] = []
  const openThemes: Record<string, number> = {}

  for (const s of surveys) {
    const rows = baseline.filter(r => r.survey_id === s.id)
    if (s.source === 'open' || !s.options?.length) {
      for (const r of rows) {
        const t = normalizePriorityThemeLabel(r.mip_category)
        openThemes[t] = (openThemes[t] ?? 0) + 1
      }
      continue
    }
    const counts: Record<string, number> = {}
    for (const r of rows) {
      if (!r.answer) continue
      counts[r.answer] = (counts[r.answer] ?? 0) + 1
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    if (total === 0) continue
    let top = ''
    let topN = 0
    for (const [k, v] of Object.entries(counts)) {
      if (v > topN) {
        topN = v
        top = k
      }
    }
    const sharePct = Math.round((topN / total) * 100)
    closedSummaries.push({
      id: s.question_id,
      topic: s.topic,
      plurality: top || '-',
      sharePct,
    })
  }

  const themeTotal = Object.values(openThemes).reduce((a, b) => a + b, 0)
  const themeLines =
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
    closedForm: closedSummaries,
    openPrioritiesThemes: themeLines,
  }
}

async function generateBody(authorModelId: string, facts: object): Promise<string> {
  const prompt = `You are writing a short editorial briefing for the Silicon Pulse research project - a longitudinal survey of many large language models on policy and technology questions, with and without news context.

Use ONLY the facts below. Do not invent statistics, poll numbers, or external events.

FACTS (JSON):
${JSON.stringify(facts, null, 2)}

Write a concise newsletter-style briefing (about 400–650 words). Use plain text only. You may use short ALL CAPS section labels on their own lines (e.g. "SNAPSHOT") followed by a blank line. Include:
- What this run covered (date, rough scope)
- 2–3 patterns in the closed-form plurality summaries (refer by topic or question id, not long quotes)
- The open-priorities theme mix if present
- One restrained sentence on interpretation: these are model completions under a fixed protocol, not human beliefs.

Never mention API costs, dollar amounts, token counts, or internal tooling.

Do not include a sign-off or byline inside the text - authorship is stored separately.
Do not use Markdown # headings; avoid bullet characters if possible or use simple dashes.`

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
      temperature: 0.45,
      max_tokens: 2200,
    }),
    signal: AbortSignal.timeout(120000),
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

async function main() {
  console.log('Run digest')
  if (OVERRIDE_AUTHOR) console.log(`Author override: ${OVERRIDE_AUTHOR}`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  let run: RunRow | null = null
  if (TARGET_RUN_ID) {
    const { data, error } = await supabase
      .from('runs')
      .select('id, run_date, status, model_list')
      .eq('id', TARGET_RUN_ID)
      .single()
    if (error) throw error
    run = data as RunRow
  } else {
    const { data, error } = await supabase
      .from('runs')
      .select('id, run_date, status, model_list')
      .eq('status', 'complete')
      .order('run_date', { ascending: false })
      .limit(1)
      .single()
    if (error) throw error
    run = data as RunRow
  }

  if (!run || run.status !== 'complete') {
    throw new Error('No suitable completed run found.')
  }

  const { data: surveys, error: se } = await supabase
    .from('surveys')
    .select('id, question_id, question_text, topic, options, source')
    .eq('active', true)
  if (se) throw se

  const { data: responses, error: re } = await supabase
    .from('responses')
    .select('survey_id, answer, mip_category, feed_type, condition')
    .eq('run_id', run.id)
  if (re) throw re

  const author = await resolveAuthor(supabase, run)
  const facts = await collectFacts(supabase, run, (surveys ?? []) as SurveyRow[], (responses ?? []) as ResponseRow[])

  console.log(`${dateDisplay(run)} · ${author.display_name}`)

  const body = await generateBody(author.id, facts)
  const slug = buildSlug(run)
  const title = titleForRun(run)
  const excerpt = makeExcerpt(body)

  const row = {
    run_id: run.id,
    slug,
    title,
    run_date_display: dateDisplay(run),
    author_model_id: author.id,
    author_display_name: author.display_name,
    body,
    excerpt,
  }

  const { error: upErr } = await supabase.from('run_digests').upsert(row, { onConflict: 'run_id' })
  if (upErr) throw upErr

  console.log(`Saved: ${slug}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
