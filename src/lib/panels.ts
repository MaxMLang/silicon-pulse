import type { ModelRegistry } from './types'

/**
 * Stackable model "panels" for the dashboard. The survey roster is built from three tiers
 * (see survey-config.json + scripts/run-survey.ts); these let a viewer slice the charts to any
 * union of those tiers. Selecting none = show every model.
 */
export type PanelId = 'anchors' | 'open' | 'usage'

export const PANEL_OPTIONS: { id: PanelId; label: string; help: string }[] = [
  { id: 'anchors', label: 'Flagship anchors', help: 'Curated frontier model from each major lab' },
  { id: 'open', label: 'Open source', help: 'Open-weights models (Llama, Qwen, DeepSeek, Mistral, gpt-oss, …)' },
  { id: 'usage', label: 'Usage-ranked', help: 'Most-used models on OpenRouter this week' },
]

export interface PanelMeta {
  anchor: boolean
  open: boolean
  usage: boolean
}

type RegistryLike = Pick<ModelRegistry, 'id'> &
  Partial<Pick<ModelRegistry, 'anchor_lab' | 'usage_rank' | 'open_weights'>>

export function buildPanelMap(rows: RegistryLike[]): Map<string, PanelMeta> {
  const m = new Map<string, PanelMeta>()
  for (const r of rows) {
    m.set(r.id, {
      anchor: r.anchor_lab != null,
      open: r.open_weights === true,
      usage: r.usage_rank != null,
    })
  }
  return m
}

/**
 * Returns the set of model ids that belong to ANY selected panel (union/stacking), or null when no
 * panel is selected (meaning "no filter — include everything"). Models missing from the registry map
 * are kept when no filter is active and dropped when a filter is active.
 */
export function allowedModelIds(
  panelMap: Map<string, PanelMeta>,
  selected: Set<PanelId>
): Set<string> | null {
  if (selected.size === 0) return null
  const out = new Set<string>()
  for (const [id, meta] of panelMap) {
    if (
      (selected.has('anchors') && meta.anchor) ||
      (selected.has('open') && meta.open) ||
      (selected.has('usage') && meta.usage)
    ) {
      out.add(id)
    }
  }
  return out
}
