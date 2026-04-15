-- Flagship anchors vs usage-pool leaderboard rows
ALTER TABLE model_registry
  ADD COLUMN IF NOT EXISTS anchor_lab text NULL,
  ADD COLUMN IF NOT EXISTS usage_rank smallint NULL;

COMMENT ON COLUMN model_registry.anchor_lab IS
  'Stable lab key (e.g. openai) when this model is the current flagship anchor; NULL for usage-pool-only rows.';
COMMENT ON COLUMN model_registry.usage_rank IS
  '1–15 order from OpenRouter weekly usage after family dedupe; NULL for anchor-only rows not in that top list.';

CREATE INDEX IF NOT EXISTS idx_model_registry_anchor_lab ON model_registry (anchor_lab)
  WHERE anchor_lab IS NOT NULL;
