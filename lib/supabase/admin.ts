import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client: bypasses RLS. Server only (route handlers, server actions, cron),
 * and every query must be scoped to the allowed user's id.
 * Since 0002_single_user.sql it is the only way to reach `google_credentials`.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') throw new Error('createAdminClient solo se usa en el servidor');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
