#!/usr/bin/env npx ts-node
/**
 * classify-priority-themes.ts
 *
 * Post-processes open-ended national-priorities responses into policy-theme buckets
 * using a small classifier model. Run after run-survey.
 *
 *   npx ts-node scripts/classify-priority-themes.ts
 *   npx ts-node scripts/classify-priority-themes.ts --run-id <uuid>
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { PRIORITY_THEMES } from '../src/lib/types'
dotenv.config({ path: '.env.local' })

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const CLASSIFIER_MODEL = 'anthropic/claude-haiku-4-5'
const BATCH_SIZE = 20
const BATCH_DELAY_MS = 500

const DECLINED = 'Declined to answer or unclear' as const

const args = process.argv.slice(2)
const RUN_ID_IDX = args.indexOf('--run-id')
const TARGET_RUN_ID = RUN_ID_IDX >= 0 ? args[RUN_ID_IDX + 1] : null

async function classifyResponse(answer: string): Promise<string> {
  const t = answer.trim()
  if (!t || t === '-' || t === '—') {
    return DECLINED
  }

  const prompt = `You are a research assistant classifying open-ended survey responses about the most important problem facing the United States.

Classify the following response into exactly ONE of these categories:
${PRIORITY_THEMES.map(c => `- ${c}`).join('\n')}

Use "${DECLINED}" for refusals, empty or nonsensical replies, a lone dash, or when the answer does not support any policy theme above.

Response to classify: "${answer}"

Reply with ONLY the category name, nothing else.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://silicon-pulse.vercel.app',
    },
    body: JSON.stringify({
      model: CLASSIFIER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 20,
    }),
    signal: AbortSignal.timeout(25000),
  })

  if (!res.ok) throw new Error(`Classifier HTTP ${res.status}`)

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = (data.choices?.[0]?.message?.content ?? DECLINED).trim()

  const sorted = [...PRIORITY_THEMES].sort((a, b) => b.length - a.length)
  const matched = sorted.find(c => raw.toLowerCase().includes(c.toLowerCase()))
  return matched ?? DECLINED
}

async function main() {
  console.log('🧩 Open priorities - theme classifier')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const { data: surveys } = await supabase
    .from('surveys')
    .select('id, question_id')
    .eq('source', 'open')

  if (!surveys?.length) {
    console.log('No open-ended surveys found.')
    return
  }

  const openSurveyIds = surveys.map((s: { id: string }) => s.id)

  let query = supabase
    .from('responses')
    .select('id, answer, run_id')
    .in('survey_id', openSurveyIds)
    .is('mip_category', null)
    .not('answer', 'is', null)

  if (TARGET_RUN_ID) {
    query = query.eq('run_id', TARGET_RUN_ID)
  }

  const { data: responses, error } = await query
  if (error) throw error

  if (!responses?.length) {
    console.log('No unclassified open-priorities responses found.')
    return
  }

  console.log(`Found ${responses.length} responses to classify\n`)

  let classified = 0
  let failed = 0

  for (let i = 0; i < responses.length; i += BATCH_SIZE) {
    const batch = responses.slice(i, i + BATCH_SIZE)
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(responses.length / BATCH_SIZE)}...`)

    const results = await Promise.all(
      batch.map(async (r: { id: string; answer: string }) => {
        try {
          const category = await classifyResponse(r.answer)
          return { id: r.id, category, success: true }
        } catch (err) {
          console.warn(`  ⚠️  Failed to classify response ${r.id}: ${(err as Error).message}`)
          return { id: r.id, category: DECLINED, success: false }
        }
      })
    )

    await Promise.all(
      results.map(r =>
        supabase.from('responses').update({ mip_category: r.category }).eq('id', r.id)
      )
    )

    classified += results.filter(r => r.success).length
    failed += results.filter(r => !r.success).length

    if (i + BATCH_SIZE < responses.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  console.log(`\n✅ Classification complete`)
  console.log(`   Classified: ${classified}`)
  console.log(`   Failed (defaulted to ${DECLINED}): ${failed}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
