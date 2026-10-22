/** Real wiring for /api/cron/morning: service-role client scoped to Marc. Server only. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAllowedEmail } from '@/lib/auth/allowlist';
import { calendarGatewayFor } from '@/lib/calendar/server';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createPushSubscriptionsRepo } from '@/lib/db/push';
import { createSettingsRepo } from '@/lib/db/settings';
import { buildDigestFor } from '@/lib/digest/server';
import { sendPush } from '@/lib/push/send';
import { createAdminClient } from '@/lib/supabase/admin';
import { runMorning, type MorningResult } from './morning';

/**
 * The single user: the auth user whose email is ALLOWED_EMAIL (same rule as the login). Robust
 * even if a stray user row ever existed, and fails closed: no ALLOWED_EMAIL → no user. The
 * 0002 trigger only lets that email sign up, so the first page holds it.
 */
export async function resolveUserId(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  return data.users.find((u) => isAllowedEmail(u.email))?.id ?? null;
}

export async function morningRun(now = new Date()): Promise<MorningResult | { skipped: 'no_user' }> {
  const admin = createAdminClient();
  const userId = await resolveUserId(admin);
  if (!userId) return { skipped: 'no_user' };
  const settingsRepo = createSettingsRepo(admin, userId);
  return runMorning({
    now,
    settings: settingsRepo,
    items: createSupabaseItemsRepo(admin, { userId }),
    calendar: () => calendarGatewayFor(userId),
    buildDigest: (date, settings) => buildDigestFor({ client: admin, userId, date, now, settings, settingsRepo }),
    subscriptions: () => createPushSubscriptionsRepo(admin, { userId }).list(),
    sendPush: (sub, payload) => sendPush(sub, payload),
  });
}
