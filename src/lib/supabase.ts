import { createClient } from '@supabase/supabase-js'

// Public read key: supports both the legacy "anon" key and the newer "publishable" (sb_publishable_…) key.
const PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  'placeholder-key'

// Use empty placeholder strings so the module loads without throwing during build.
// The client will error at runtime when env vars are missing - which is fine since
// the dashboard won't serve useful data without a real Supabase connection anyway.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  PUBLIC_KEY
)

// Server-side client using the secret key (for scripts / cron jobs). Supports both the legacy
// "service_role" key and the newer "secret" (sb_secret_…) key. This key bypasses RLS.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY or NEXT_PUBLIC_SUPABASE_URL')
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}
