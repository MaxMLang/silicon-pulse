// ─── Shared chart theme ────────────────────────────────────────────────────────
// One source of truth for chart colors + Recharts styling so every visualization across the app
// (home questions, longitudinal, priorities, digest) looks consistent. Tuned for the zinc-950 dark UI.

/** Categorical palette for answer options / themes. Bright-but-soft so it reads on a dark background. */
export const SERIES_COLORS = [
  '#60a5fa', // blue-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f87171', // red-400
  '#a78bfa', // violet-400
  '#22d3ee', // cyan-400
  '#fb923c', // orange-400
  '#f472b6', // pink-400
  '#a3e635', // lime-400
  '#94a3b8', // slate-400 (overflow / "other")
]

/** Stable color for the option at a given index (wraps around if there are more options than colors). */
export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]
}

/** Map an ordered list of option labels to colors so the same option keeps its color across charts. */
export function colorMap(labels: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  labels.forEach((label, i) => {
    out[label] = seriesColor(i)
  })
  return out
}

/** Accent used for single-series "share" bars and primary highlights. */
export const ACCENT = '#60a5fa'

// Recharts shared styling --------------------------------------------------------

export const AXIS_TICK = { fill: '#71717a', fontSize: 11 } as const
export const AXIS_TICK_SM = { fill: '#71717a', fontSize: 10 } as const
export const AXIS_LINE = { stroke: '#3f3f46' } as const
export const GRID_STROKE = '#27272a'

export const TOOLTIP_STYLE = {
  background: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: 8,
  fontSize: 12,
  color: '#e4e4e7',
} as const

export const TOOLTIP_LABEL_STYLE = { color: '#a1a1aa' } as const
