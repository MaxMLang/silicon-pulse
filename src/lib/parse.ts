// ─── Response Parsing ────────────────────────────────────────────────────────

/**
 * Extract "Answer: X" and "Reasoning: Y" from model output.
 * Falls back to fuzzy matching if the model doesn't follow the format.
 */
export function parseSurveyResponse(
  rawResponse: string,
  validOptions: string[]
): { answer: string | null; reasoning: string | null } {
  // Try strict format first
  const answerMatch = rawResponse.match(/^Answer:\s*(.+)$/im)
  const reasoningMatch = rawResponse.match(/^Reasoning:\s*(.+)$/im)

  let answer = answerMatch ? answerMatch[1].trim() : null
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : null

  // If we got an answer, try to match it to a valid option
  if (answer) {
    const matched = matchToOption(answer, validOptions)
    if (matched) return { answer: matched, reasoning }
  }

  // Fallback: scan the full response for any valid option
  const fallback = findOptionInText(rawResponse, validOptions)
  return { answer: fallback, reasoning }
}

/**
 * Match a raw answer string to the closest valid option (case-insensitive, prefix match).
 */
function matchToOption(raw: string, options: string[]): string | null {
  const normalized = raw.toLowerCase().trim()

  // Exact match first
  const exact = options.find(o => o.toLowerCase() === normalized)
  if (exact) return exact

  // Prefix match
  const prefix = options.find(o => normalized.startsWith(o.toLowerCase()))
  if (prefix) return prefix

  // Substring match
  const substr = options.find(o => normalized.includes(o.toLowerCase()))
  if (substr) return substr

  return null
}

/**
 * Scan text for the first occurrence of any valid option.
 */
function findOptionInText(text: string, options: string[]): string | null {
  const lower = text.toLowerCase()
  // Sort by length descending to avoid partial matches on short options
  const sorted = [...options].sort((a, b) => b.length - a.length)
  for (const option of sorted) {
    if (lower.includes(option.toLowerCase())) return option
  }
  return null
}

/**
 * Shuffle an array using Fisher-Yates. Returns new array.
 */
export function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Compute Mean Absolute Error between model distribution and human ground truth.
 * Both are objects mapping option -> percentage (0-100).
 */
export function computeMAE(
  modelDist: Record<string, number>,
  humanDist: Record<string, number>
): number {
  const options = Object.keys(humanDist)
  if (options.length === 0) return 0

  const totalError = options.reduce((sum, option) => {
    const human = humanDist[option] ?? 0
    const model = modelDist[option] ?? 0
    return sum + Math.abs(human - model)
  }, 0)

  return totalError / options.length
}

/**
 * Convert a count map to a percentage distribution.
 */
export function countsToPercents(counts: Record<string, number>): Record<string, number> {
  const total = Object.values(counts).reduce((s, v) => s + v, 0)
  if (total === 0) return {}
  return Object.fromEntries(
    Object.entries(counts).map(([k, v]) => [k, Math.round((v / total) * 100)])
  )
}
