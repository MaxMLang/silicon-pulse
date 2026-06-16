-- Open-weights ("open source") classification for the stackable dashboard panel filter
-- (anchors / open-source / usage-ranked). Populated by scripts/update-models.ts via
-- src/lib/open-weights.ts. Conservative: closed flagships (GPT, Claude, Gemini, Grok) stay false.
ALTER TABLE model_registry
  ADD COLUMN IF NOT EXISTS open_weights boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN model_registry.open_weights IS
  'True when the model''s weights are openly released (Llama, Qwen, DeepSeek, Mistral, gpt-oss, Gemma, etc.). Drives the open-source dashboard panel.';

CREATE INDEX IF NOT EXISTS idx_model_registry_open_weights ON model_registry (open_weights)
  WHERE open_weights = true;
