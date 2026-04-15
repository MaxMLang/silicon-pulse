import type { AnchorModelsFile, AnchorDefinition } from './anchor-models.types'
import anchorModelsJson from '../config/anchor-models.json'

const file = anchorModelsJson as AnchorModelsFile

export type { AnchorSegment, AnchorDefinition, AnchorModelsFile } from './anchor-models.types'

/** Browser / server: bundled config. */
export function getAnchorConfig(): AnchorModelsFile {
  return file
}

export function sortSegmentsByEffectiveFrom(def: AnchorDefinition) {
  return [...def.segments].sort(
    (a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime()
  )
}

/** Current flagship OpenRouter id for a lab (latest segment). */
export function currentModelIdForLab(def: AnchorDefinition): string {
  const sorted = sortSegmentsByEffectiveFrom(def)
  const last = sorted[sorted.length - 1]
  if (!last?.modelId) throw new Error(`anchor-models: no segments for lab ${def.lab}`)
  return last.modelId
}

/** All OpenRouter ids ever used for a lab (for filtering historical responses). */
export function historicalModelIdsForLab(def: AnchorDefinition): string[] {
  return sortSegmentsByEffectiveFrom(def).map(s => s.modelId)
}

/** Ordered current flagship ids (one per lab; labs follow file order). */
export function currentAnchorModelIdsOrdered(config: AnchorModelsFile = file): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const def of config.anchors) {
    const id = currentModelIdForLab(def)
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

/**
 * Handoff markers: one per segment after the first, at effectiveFrom (for chart annotations).
 */
export function handoffDatesForLab(def: AnchorDefinition): { at: string; label: string; modelId: string }[] {
  const sorted = sortSegmentsByEffectiveFrom(def)
  const out: { at: string; label: string; modelId: string }[] = []
  for (let i = 1; i < sorted.length; i++) {
    const seg = sorted[i]!
    out.push({
      at: seg.effectiveFrom,
      label: `→ ${seg.modelId.split('/').pop() ?? seg.modelId}`,
      modelId: seg.modelId,
    })
  }
  return out
}
