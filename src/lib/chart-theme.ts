// ─── Shared chart theme ────────────────────────────────────────────────────────
// One source of truth for chart colors + Recharts styling so every visualization across the app
// (home questions, longitudinal, priorities, digest) looks consistent. Tuned for the zinc-950 dark UI.

/**
 * Categorical palette for answer options / themes, tuned for the dark UI.
 * Ordered so the first entries are maximally separated in hue (most questions have 3-5 options),
 * with only one color per hue family so nothing reads as a near-duplicate.
 */
export const SERIES_COLORS = [
  '#4f9dff', // blue
  '#ff7a1a', // orange
  '#2dd36f', // green
  '#f0529c', // pink / magenta
  '#b06bff', // purple
  '#f5c518', // gold
  '#ff5d5d', // red
  '#18c7cf', // teal
  '#a3e635', // lime
  '#94a3b8', // slate (overflow / "other")
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
export const ACCENT = '#4f9dff'

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
