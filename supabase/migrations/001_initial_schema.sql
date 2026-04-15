-- Silicon Pulse: Initial Schema
-- Run this in your Supabase SQL editor or via supabase db push

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- surveys
-- ─────────────────────────────────────────────
CREATE TABLE surveys (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source              text NOT NULL CHECK (source IN ('pulse', 'open')),
  question_id         text NOT NULL UNIQUE,
  topic               text NOT NULL,
  question_text       text NOT NULL,
  options             jsonb NOT NULL DEFAULT '[]',
  source_url          text,                   -- Optional external citation URL
  usage_disclaimer    text,                   -- Attribution / usage note
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- model_registry
-- ─────────────────────────────────────────────
CREATE TABLE model_registry (
  id             text PRIMARY KEY,  -- OpenRouter model ID
  display_name   text NOT NULL,
  provider       text NOT NULL,
  family         text,
  parameter_count text,
  origin         text,
  first_seen     date NOT NULL DEFAULT CURRENT_DATE,
  last_seen      date NOT NULL DEFAULT CURRENT_DATE,
  active         boolean NOT NULL DEFAULT true,
  context_length int,
  pricing_prompt numeric(12, 9),
  pricing_completion numeric(12, 9)
);

-- ─────────────────────────────────────────────
-- news_briefs
-- ─────────────────────────────────────────────
CREATE TABLE news_briefs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  feed_type   text NOT NULL CHECK (feed_type IN ('balanced', 'left', 'right')),
  content     text NOT NULL,
  headlines   jsonb NOT NULL DEFAULT '[]',
  sources     jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- runs
-- ─────────────────────────────────────────────
CREATE TABLE runs (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_date      timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  model_list    jsonb NOT NULL DEFAULT '[]',
  brief_ids     jsonb NOT NULL DEFAULT '{}',
  total_calls   int NOT NULL DEFAULT 0,
  total_cost    float NOT NULL DEFAULT 0,
  error_log     text,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- responses
-- ─────────────────────────────────────────────
CREATE TABLE responses (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id          uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  survey_id       uuid NOT NULL REFERENCES surveys(id),
  model_id        text NOT NULL REFERENCES model_registry(id),
  model_name      text NOT NULL,
  condition       text NOT NULL CHECK (condition IN ('baseline', 'informed')),
  feed_type       text NOT NULL CHECK (feed_type IN ('balanced', 'left', 'right', 'none')),
  news_brief_id   uuid REFERENCES news_briefs(id),
  answer          text,
  reasoning       text,
  mip_category    text,
  option_order    jsonb NOT NULL DEFAULT '[]',
  raw_response    text,
  error           text,
  temperature     float NOT NULL DEFAULT 0,
  tokens_input    int,
  tokens_output   int,
  cost_usd        float,
  latency_ms      int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
CREATE INDEX idx_responses_run_survey    ON responses(run_id, survey_id);
CREATE INDEX idx_responses_model_survey  ON responses(model_id, survey_id);
CREATE INDEX idx_responses_feed_answer   ON responses(feed_type, answer);
CREATE INDEX idx_responses_run_cost      ON responses(run_id, cost_usd);
CREATE INDEX idx_responses_created_at    ON responses(created_at);
CREATE INDEX idx_runs_status             ON runs(status);
CREATE INDEX idx_runs_run_date           ON runs(run_date);

-- ─────────────────────────────────────────────
-- Seed: original Silicon Pulse survey items (not verbatim third-party polls)
-- ─────────────────────────────────────────────

INSERT INTO surveys (source, question_id, topic, question_text, options, source_url, usage_disclaimer) VALUES
(
  'pulse', 'SP-01', 'technology',
  'Taken as a whole, has the spread of digital technology done more to help or harm society - and if you are not sure, say so.',
  '["Helped more", "Harmed more", "Not sure"]',
  NULL,
  'Original Silicon Pulse wording. Not affiliated with any third-party pollster.'
),
(
  'pulse', 'SP-02', 'artificial intelligence',
  'How worried are you that everyday tools powered by large language models and similar AI will become more common over the next few years?',
  '["Very worried", "Somewhat worried", "Not very worried", "Not worried at all"]',
  NULL,
  'Original Silicon Pulse wording. Not affiliated with any third-party pollster.'
),
(
  'pulse', 'SP-03', 'democracy & platforms',
  'Do large social platforms, on balance, strengthen democratic debate or weaken it?',
  '["Strengthen", "Weaken", "Neither / mixed"]',
  NULL,
  'Original Silicon Pulse wording. Not affiliated with any third-party pollster.'
),
(
  'pulse', 'SP-04', 'political common ground',
  'How much shared factual ground do you think exists today between people who vote for different major parties?',
  '["A great deal", "Some", "Not much", "None at all"]',
  NULL,
  'Original Silicon Pulse wording. Not affiliated with any third-party pollster.'
),
(
  'pulse', 'SP-05', 'science & institutions',
  'How much trust do you place in scientists and research institutions to prioritize the public interest?',
  '["A great deal", "A fair amount", "Not much", "None at all"]',
  NULL,
  'Original Silicon Pulse wording. Not affiliated with any third-party pollster.'
),
(
  'pulse', 'SP-06', 'economy',
  'How would you describe current national economic conditions for a typical household?',
  '["Excellent", "Good", "Only fair", "Poor"]',
  NULL,
  'Original Silicon Pulse wording. Not affiliated with any third-party pollster.'
),
(
  'pulse', 'SP-07', 'immigration',
  'Should annual legal immigration to the United States go up, stay about the same, or go down?',
  '["Increase", "About the same", "Decrease"]',
  NULL,
  'Original Silicon Pulse wording. Not affiliated with any third-party pollster.'
),
(
  'pulse', 'SP-08', 'climate policy',
  'How urgent should climate policy be for federal lawmakers compared with other priorities?',
  '["Top priority", "Important but not the top", "Low priority", "Should not be a focus"]',
  NULL,
  'Original Silicon Pulse wording. Not affiliated with any third-party pollster.'
),
(
  'pulse', 'SP-09', 'AI governance',
  'Should releases of the most capable (“frontier”) AI models be slowed until stronger safety and oversight rules are in place?',
  '["Yes - gate releases more", "No - current pace is fine", "Unsure"]',
  NULL,
  'Original Silicon Pulse wording. Not affiliated with any third-party pollster.'
),
(
  'pulse', 'SP-10', 'AI & copyright',
  'Is it broadly acceptable for AI systems to train on copyrighted news and books without explicit permission from each rights holder?',
  '["Generally acceptable", "Generally not acceptable", "Depends on the use case"]',
  NULL,
  'Original Silicon Pulse wording. Not affiliated with any third-party pollster.'
),
(
  'open', 'OPEN-MIP', 'national priorities',
  'In one or two sentences, what national issue do you think deserves the most attention right now?',
  '[]',
  NULL,
  'Open-ended Silicon Pulse item (free text). Not affiliated with any third-party pollster.'
);
