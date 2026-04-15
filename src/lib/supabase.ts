import { createClient } from '@supabase/supabase-js'

// Use empty placeholder strings so the module loads without throwing during build.
// The client will error at runtime when env vars are missing - which is fine since
// the dashboard won't serve useful data without a real Supabase connection anyway.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key'
)

// Server-side client using service role key (for scripts / cron jobs)
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}
