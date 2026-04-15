#!/usr/bin/env npx ts-node
/**
 * update-models.ts
 *
 * Hits OpenRouter's /api/v1/models endpoint, filters to the top 30 eligible
 * models, and upserts them into the model_registry table.
 *
 * Run: npx ts-node scripts/update-models.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MIN_CONTEXT_LENGTH = 8192
const TARGET_MODEL_COUNT = 15

// Models to always skip (base models, moderation, embedding, image-only)
const EXCLUDED_FAMILIES = new Set([
  'embedding',
  'moderation',
  'dall-e',
  'stable-diffusion',
  'midjourney',
  'whisper',
])

// Exclude known base (non-instruct) model patterns
const BASE_MODEL_PATTERNS = [
  /base$/i,
  /base-\d/i,
  /-base$/i,
  /pretrain/i,
  /foundation/i,
]

// Provider → origin mapping (best-effort)
const PROVIDER_ORIGIN: Record<string, string> = {
  openai: 'US',
  anthropic: 'US',
  meta: 'US',
  'meta-llama': 'US',
  google: 'US',
  mistralai: 'France',
  qwen: 'China',
  deepseek: 'China',
  moonshot: 'China',
  '01-ai': 'China',
  cohere: 'Canada',
  ai21: 'Israel',
  nousresearch: 'US',
  microsoft: 'US',
  phind: 'US',
  perplexity: 'US',
  together: 'US',
  allenai: 'US',
}

// Family grouping: deduplicate by stripping version suffixes
function inferFamily(modelId: string): string {
  const id = modelId.toLowerCase()

  // Common patterns
  if (id.includes('gpt-4o')) return 'gpt-4o'
  if (id.includes('gpt-4-turbo') || id.includes('gpt-4-0')) return 'gpt-4-turbo'
  if (id.includes('gpt-4')) return 'gpt-4'
  if (id.includes('gpt-3.5')) return 'gpt-3.5'
  if (id.includes('claude-3-5-sonnet')) return 'claude-3.5-sonnet'
  if (id.includes('claude-3-5-haiku')) return 'claude-3.5-haiku'
  if (id.includes('claude-3-opus')) return 'claude-3-opus'
  if (id.includes('claude-3-sonnet')) return 'claude-3-sonnet'
  if (id.includes('claude-3-haiku')) return 'claude-3-haiku'
  if (id.includes('claude-sonnet-4')) return 'claude-sonnet-4'
  if (id.includes('claude-opus-4')) return 'claude-opus-4'
  if (id.includes('gemini-2')) return 'gemini-2'
  if (id.includes('gemini-1.5-pro')) return 'gemini-1.5-pro'
  if (id.includes('gemini-1.5-flash')) return 'gemini-1.5-flash'
  if (id.includes('llama-4')) return 'llama-4'
  if (id.includes('llama-3.3')) return 'llama-3.3'
  if (id.includes('llama-3.1')) return 'llama-3.1'
  if (id.includes('llama-3')) return 'llama-3'
  if (id.includes('qwen2.5')) return 'qwen-2.5'
  if (id.includes('qwen2')) return 'qwen-2'
  if (id.includes('deepseek-r1')) return 'deepseek-r1'
  if (id.includes('deepseek-v3')) return 'deepseek-v3'
  if (id.includes('deepseek-v2')) return 'deepseek-v2'
  if (id.includes('mixtral')) return 'mixtral'
  if (id.includes('command-r+')) return 'command-r-plus'
  if (id.includes('command-r')) return 'command-r'
  if (id.includes('mistral-large')) return 'mistral-large'
  if (id.includes('mistral-nemo')) return 'mistral-nemo'
  if (id.includes('mistral-7b')) return 'mistral-7b'
  if (id.includes('gemma-2')) return 'gemma-2'
  if (id.includes('phi-4')) return 'phi-4'
  if (id.includes('phi-3.5')) return 'phi-3.5'
  if (id.includes('phi-3')) return 'phi-3'
  if (id.includes('yi-large')) return 'yi-large'
  if (id.includes('kimi')) return 'kimi'

  // Generic fallback: take prefix up to first version number
  return id.split('/').pop()?.replace(/[-_][\d.]+.*$/, '') ?? id
}

function inferProvider(modelId: string): string {
  return modelId.split('/')[0] ?? 'unknown'
}

function inferOrigin(provider: string): string {
  const normalized = provider.toLowerCase().replace(/[-_]/g, '')
  for (const [key, val] of Object.entries(PROVIDER_ORIGIN)) {
    if (normalized.includes(key.replace(/[-_]/g, ''))) return val
  }
  return 'Unknown'
}

function inferParameterCount(modelId: string): string {
  const match = modelId.match(/(\d+)x?(\d+)?b/i)
  if (!match) return 'unknown'
  if (match[2]) return `${match[1]}x${match[2]}B`
  return `${match[1]}B`
}

function isBaseModel(modelId: string, name: string): boolean {
  const text = `${modelId} ${name}`.toLowerCase()
  return BASE_MODEL_PATTERNS.some(p => p.test(text))
}

function isTextModel(model: { architecture?: { modality?: string }; name: string; id: string }): boolean {
  if (!model.architecture?.modality) return true  // assume text if no modality
  const modality = model.architecture.modality.toLowerCase()
  return modality.includes('text')
}

async function main() {
  console.log('🔍 Fetching models from OpenRouter...')

  // OpenRouter returns models pre-sorted by weekly usage when order=top-weekly
  const res = await fetch('https://openrouter.ai/api/v1/models?order=top-weekly', {
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://silicon-pulse.vercel.app',
    },
  })

  if (!res.ok) {
    throw new Error(`OpenRouter API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as { data: any[] }
  const allModels = data.data

  console.log(`📋 Total models available: ${allModels.length}`)

  // Step 1: Filter eligible models (preserve leaderboard order)
  const eligible = allModels.filter((m: any) => {
    // Must be a text model
    if (!isTextModel(m)) return false
    // Skip base (non-instruct) models
    if (isBaseModel(m.id, m.name)) return false
    // Skip free tier (unreliable, rate-limited, not representative)
    if (m.id.endsWith(':free')) return false
    // Must have a real price
    const price = parseFloat(m.pricing?.prompt ?? '0')
    if (price <= 0) return false
    // Must have sufficient context for our prompts
    if ((m.context_length ?? 0) < MIN_CONTEXT_LENGTH) return false
    // Skip excluded provider families (embedding, image, etc.)
    const provider = inferProvider(m.id)
    if (EXCLUDED_FAMILIES.has(provider)) return false

    return true
  })

  console.log(`✅ Eligible paid text models: ${eligible.length}`)

  // Step 2: Deduplicate by family - keep highest-ranked (first) per family
  // since the list is already sorted by weekly usage, first = most popular
  const familyMap = new Map<string, any>()
  for (const model of eligible) {
    const family = inferFamily(model.id)
    if (!familyMap.has(family)) {
      familyMap.set(family, model)
    }
  }

  const deduplicated = Array.from(familyMap.values())
  console.log(`🎯 After deduplication by family: ${deduplicated.length}`)

  // Leaderboard order is already preserved - no re-sort needed
  const top30 = deduplicated.slice(0, TARGET_MODEL_COUNT)
  console.log(`\n🏆 Top ${top30.length} models by weekly usage:`)
  top30.forEach((m: any, i: number) => {
    console.log(`  ${i + 1}. ${m.id} (ctx: ${m.context_length?.toLocaleString()}, $${m.pricing?.prompt}/tok)`)
  })

  // Step 4: Upsert into model_registry
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // Mark all currently active models as inactive first
  await supabase.from('model_registry').update({ active: false }).eq('active', true)

  const today = new Date().toISOString().split('T')[0]

  const upsertRows = top30.map((m: any) => {
    const provider = inferProvider(m.id)
    return {
      id: m.id,
      display_name: m.name ?? m.id,
      provider,
      family: inferFamily(m.id),
      parameter_count: inferParameterCount(m.id),
      origin: inferOrigin(provider),
      last_seen: today,
      active: true,
      context_length: m.context_length ?? null,
      pricing_prompt: parseFloat(m.pricing?.prompt ?? '0') || null,
      pricing_completion: parseFloat(m.pricing?.completion ?? '0') || null,
    }
  })

  const { error } = await supabase.from('model_registry').upsert(upsertRows, {
    onConflict: 'id',
    ignoreDuplicates: false,
  })

  if (error) {
    console.error('❌ Supabase upsert error:', error)
    process.exit(1)
  }

  // Set first_seen only for new models (use a separate update that won't override existing)
  const { data: existingIds } = await supabase.from('model_registry').select('id, first_seen')
  const existingMap = new Map((existingIds ?? []).map((r: any) => [r.id, r.first_seen]))

  const newModelIds = upsertRows.filter(r => !existingMap.has(r.id) || existingMap.get(r.id) === today).map(r => r.id)
  if (newModelIds.length > 0) {
    console.log(`\n🆕 New models added: ${newModelIds.join(', ')}`)
  }

  console.log(`\n✅ model_registry updated with ${top30.length} active models.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
