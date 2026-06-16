/**
 * Heuristic open-weights ("open source") classifier for OpenRouter model ids.
 *
 * OpenRouter does not flag whether a model's weights are openly released, so we infer it from the
 * provider prefix plus a few family overrides. We are deliberately CONSERVATIVE: it is better to miss
 * an open model than to mislabel a closed (proprietary) one as open, because the label drives a public
 * dashboard filter. Closed flagships (GPT, Claude, Gemini, Grok) must never be tagged open.
 */

// Providers whose published models are open-weights (downloadable weights, permissive/again-research license).
const OPEN_PROVIDERS = new Set([
  'meta-llama',
  'mistralai',
  'mistral',
  'qwen',
  'deepseek',
  'microsoft', // phi
  'nvidia', // nemotron
  'nousresearch',
  'allenai', // olmo
  '01-ai', // yi
  'moonshotai', // kimi-k2 weights released
  'minimax',
  'z-ai',
  'zhipuai',
  'ibm-granite',
  'stepfun',
  'inclusionai',
  'tiiuae', // falcon
  'databricks', // dbrx
  'baidu', // ernie (open variants)
])

// Closed providers — listed for clarity; anything not in OPEN_PROVIDERS defaults to closed anyway.
const CLOSED_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'x-ai',
  'perplexity',
  'ai21',
  'amazon',
  'inflection',
  'cohere', // recent Command models ship without open weights; treat as closed to be safe
])

// Family-level overrides that beat the provider default (e.g. open lines from otherwise-closed labs).
function familyOverride(id: string): boolean | null {
  if (id.includes('gpt-oss')) return true // OpenAI's open-weights line
  if (id.includes('gemma')) return true // Google's open line (gemini stays closed)
  if (id.includes('olmo')) return true
  return null
}

export function isOpenWeights(modelId: string): boolean {
  const id = modelId.toLowerCase()
  const override = familyOverride(id)
  if (override !== null) return override
  const provider = id.split('/')[0] ?? ''
  if (CLOSED_PROVIDERS.has(provider)) return false
  return OPEN_PROVIDERS.has(provider)
}
