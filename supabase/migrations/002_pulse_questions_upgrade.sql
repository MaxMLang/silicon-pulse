-- Upgrade path: deactivate legacy Pew/Gallup-style rows and add Silicon Pulse originals.
-- Safe to run once on an existing database that used migration 001 with pew/gallup sources.

ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_source_check;
ALTER TABLE surveys ADD CONSTRAINT surveys_source_check
  CHECK (source IN ('pulse', 'open', 'pew', 'gallup'));

UPDATE surveys SET active = false WHERE source IN ('pew', 'gallup');

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
)
ON CONFLICT (question_id) DO UPDATE SET
  source = EXCLUDED.source,
  topic = EXCLUDED.topic,
  question_text = EXCLUDED.question_text,
  options = EXCLUDED.options,
  source_url = EXCLUDED.source_url,
  usage_disclaimer = EXCLUDED.usage_disclaimer,
  active = true;

UPDATE surveys SET source = 'pulse' WHERE source = 'pew';
UPDATE surveys SET source = 'open' WHERE source = 'gallup';

ALTER TABLE surveys DROP CONSTRAINT surveys_source_check;
ALTER TABLE surveys ADD CONSTRAINT surveys_source_check
  CHECK (source IN ('pulse', 'open'));
