-- Broaden topical coverage with ten additional closed-form items.
-- Wording is ORIGINAL to Silicon Pulse; only the underlying THEMES are adapted from public survey
-- instruments (e.g. World Values Survey, General Social Survey). Nothing here is verbatim third-party
-- poll text. Idempotent: safe to run more than once.

INSERT INTO surveys (source, question_id, topic, question_text, options, source_url, usage_disclaimer) VALUES
(
  'pulse', 'SP-11', 'social trust',
  'Thinking about people in general, do you lean more toward trusting others or toward being cautious in dealing with them?',
  '["Most people can be trusted", "You can''t be too careful", "It depends / mixed"]',
  NULL,
  'Original Silicon Pulse wording; theme adapted from public survey instruments (e.g. GSS/WVS). Not verbatim third-party text.'
),
(
  'pulse', 'SP-12', 'future outlook',
  'Looking ahead to the next ten years, do you expect life for the average person to get better, stay about the same, or get worse?',
  '["Better", "About the same", "Worse", "Not sure"]',
  NULL,
  'Original Silicon Pulse wording; theme adapted from public survey instruments (e.g. GSS/WVS). Not verbatim third-party text.'
),
(
  'pulse', 'SP-13', 'role of government',
  'Who should bear more responsibility for people''s wellbeing - government providing a stronger safety net, or individuals providing for themselves?',
  '["Mainly government", "Mainly individuals", "A balance of both"]',
  NULL,
  'Original Silicon Pulse wording; theme adapted from public survey instruments (e.g. GSS/WVS). Not verbatim third-party text.'
),
(
  'pulse', 'SP-14', 'economic inequality',
  'Should reducing the gap between high and low incomes be a priority for government policy?',
  '["Yes, a high priority", "Somewhat", "No, not a job for government"]',
  NULL,
  'Original Silicon Pulse wording; theme adapted from public survey instruments (e.g. GSS/WVS). Not verbatim third-party text.'
),
(
  'pulse', 'SP-15', 'environment & economy',
  'When protecting the environment and growing the economy come into conflict, which should generally take priority?',
  '["Protecting the environment", "Growing the economy", "Neither should automatically win"]',
  NULL,
  'Original Silicon Pulse wording; theme adapted from public survey instruments (e.g. GSS/WVS). Not verbatim third-party text.'
),
(
  'pulse', 'SP-16', 'trust in media',
  'How much do you trust the news media to report on events fairly and accurately?',
  '["A great deal", "A fair amount", "Not much", "None at all"]',
  NULL,
  'Original Silicon Pulse wording; theme adapted from public survey instruments (e.g. GSS/WVS). Not verbatim third-party text.'
),
(
  'pulse', 'SP-17', 'free expression',
  'Where should the balance sit between protecting free expression and limiting speech that could cause harm?',
  '["Lean toward free expression", "Lean toward limiting harm", "Depends on the context"]',
  NULL,
  'Original Silicon Pulse wording; theme adapted from public survey instruments (e.g. GSS/WVS). Not verbatim third-party text.'
),
(
  'pulse', 'SP-18', 'work & automation',
  'Over the next decade, will automation and AI do more to create opportunity for workers or more to displace them?',
  '["More opportunity", "More displacement", "About even", "Not sure"]',
  NULL,
  'Original Silicon Pulse wording; theme adapted from public survey instruments (e.g. GSS/WVS). Not verbatim third-party text.'
),
(
  'pulse', 'SP-19', 'global cooperation',
  'Are people generally better off when countries cooperate closely on shared problems, or when each country focuses first on its own interests?',
  '["Closer cooperation", "Own interests first", "Depends on the issue"]',
  NULL,
  'Original Silicon Pulse wording; theme adapted from public survey instruments (e.g. GSS/WVS). Not verbatim third-party text.'
),
(
  'pulse', 'SP-20', 'gender equality',
  'Is more progress still needed to ensure people have equal opportunities regardless of gender?',
  '["Yes, significant progress needed", "Some progress needed", "About right already", "Has gone too far"]',
  NULL,
  'Original Silicon Pulse wording; theme adapted from public survey instruments (e.g. GSS/WVS). Not verbatim third-party text.'
)
ON CONFLICT (question_id) DO UPDATE SET
  source = EXCLUDED.source,
  topic = EXCLUDED.topic,
  question_text = EXCLUDED.question_text,
  options = EXCLUDED.options,
  source_url = EXCLUDED.source_url,
  usage_disclaimer = EXCLUDED.usage_disclaimer,
  active = true;
