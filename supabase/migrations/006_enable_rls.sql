-- Row Level Security: public READ-ONLY access for the dashboard (anon / publishable key),
-- while all writes remain restricted to the secret / service_role key (which bypasses RLS).
-- New Supabase projects enable RLS by default; without a read policy the publishable key sees
-- zero rows. This grants SELECT to anon + authenticated and grants NO write policies, so the
-- public key cannot insert/update/delete. Idempotent.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'surveys', 'model_registry', 'news_briefs', 'runs', 'responses', 'run_digests'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_public_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true);',
      t || '_public_read', t
    );
  END LOOP;
END $$;
