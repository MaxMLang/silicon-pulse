export interface AnchorSegment {
  modelId: string
  /** ISO 8601 — first run at or after this counts as this segment (previous segment ended). */
  effectiveFrom: string
}

export interface AnchorDefinition {
  lab: string
  displayLabel: string
  segments: AnchorSegment[]
}

export interface AnchorModelsFile {
  anchors: AnchorDefinition[]
}
