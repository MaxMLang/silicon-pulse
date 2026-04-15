-- Run briefing digests: LLM-authored newsletter-style summaries per completed run.
-- Title/date labels are set by the app; body is generated offline (see scripts/generate-run-digest.ts).

CREATE TABLE run_digests (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id              uuid NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  slug                text NOT NULL UNIQUE,
  title               text NOT NULL,
  run_date_display    text NOT NULL,
  author_model_id     text NOT NULL,
  author_display_name text NOT NULL,
  body                text NOT NULL,
  excerpt             text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_run_digests_created ON run_digests(created_at DESC);
