import type { Response } from './types'

// ─── Answer distributions + conviction ──────────────────────────────────────────
// Anchors are sampled multiple times per cell (see survey-config.json `anchors.repetitions`), so a
// single (model, question, condition) cell can hold several rows with different `sample_index`. These
// helpers turn that into (a) an aggregate option share and (b) per-model "conviction" - how consistently
// each model picked the same answer across its draws.

export interface OptionShare {
  name: string
  count: number
  pct: number
  color: string
}

export interface ModelConviction {
  modelId: string
  modelName: string
  /** Most frequent answer across this model's draws. */
  topAnswer: string | null
  /** Number of draws (samples) for this model in the cell. */
  draws: number
  /** Fraction of draws that picked the top answer (1 = unanimous). */
  agreement: number
  /** answer -> count across draws, in option order. */
  distribution: { name: string; count: number; color: string }[]
}

/** Aggregate share of each option across ALL draws (every sample counts), preserving option order. */
export function optionShares(
  responses: Response[],
  options: string[],
  colors: Record<string, string>
): { shares: OptionShare[]; total: number } {
  const counts: Record<string, number> = {}
  let total = 0
  for (const r of responses) {
    if (!r.answer) continue
    counts[r.answer] = (counts[r.answer] ?? 0) + 1
    total++
  }
  const denom = total || 1
  const shares = options.map(opt => ({
    name: opt,
    count: counts[opt] ?? 0,
    pct: Math.round(((counts[opt] ?? 0) / denom) * 100),
    color: colors[opt] ?? '#94a3b8',
  }))
  return { shares, total }
}

/**
 * Panel agreement = share of all draws that landed on the single most-popular option. 1.0 means the
 * whole panel agrees; near 1/numOptions means maximally split. A compact "how unified is the panel" stat.
 */
export function panelAgreement(shares: OptionShare[], total: number): number {
  if (total === 0) return 0
  const topCount = Math.max(0, ...shares.map(s => s.count))
  return topCount / total
}

/** Per-model conviction: each model's modal answer + how consistent it was across its repeated draws. */
export function modelConvictions(
  responses: Response[],
  options: string[],
  colors: Record<string, string>
): ModelConviction[] {
  const byModel = new Map<string, { name: string; counts: Record<string, number>; draws: number }>()
  for (const r of responses) {
    if (!r.answer) continue
    let m = byModel.get(r.model_id)
    if (!m) {
      m = { name: r.model_name, counts: {}, draws: 0 }
      byModel.set(r.model_id, m)
    }
    m.counts[r.answer] = (m.counts[r.answer] ?? 0) + 1
    m.draws++
  }

  const out: ModelConviction[] = []
  for (const [modelId, m] of byModel) {
    let topAnswer: string | null = null
    let topCount = 0
    for (const [ans, c] of Object.entries(m.counts)) {
      if (c > topCount) {
        topCount = c
        topAnswer = ans
      }
    }
    const distribution = options
      .filter(opt => (m.counts[opt] ?? 0) > 0)
      .map(opt => ({ name: opt, count: m.counts[opt] ?? 0, color: colors[opt] ?? '#94a3b8' }))
    out.push({
      modelId,
      modelName: m.name,
      topAnswer,
      draws: m.draws,
      agreement: m.draws ? topCount / m.draws : 0,
      distribution,
    })
  }
  return out.sort((a, b) => a.modelName.localeCompare(b.modelName))
}
