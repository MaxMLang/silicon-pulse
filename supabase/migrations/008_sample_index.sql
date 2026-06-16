-- Anchor repetition: each anchor cell is sampled multiple times (at a nonzero temperature) to estimate
-- an answer DISTRIBUTION rather than a single point. Each draw is its own row; sample_index distinguishes
-- them. Fill models / open-ended items keep a single draw (sample_index = 0). Idempotent.

ALTER TABLE responses ADD COLUMN IF NOT EXISTS sample_index int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_responses_cell
  ON responses(run_id, survey_id, model_id, condition, feed_type);
