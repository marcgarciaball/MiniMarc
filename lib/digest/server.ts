/** Real wiring of buildDigest, shared by /hoy (session client), the cron and GET /api/hoy (service role). Server only. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createGeminiProvider } from '@/lib/ai/gemini';
import { verifyApiToken } from '@/lib/auth/tokens';
import { calendarGatewayFor } from '@/lib/calendar/server';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import { createSettingsRepo, loadSettingsOrDefaults, type Settings, type SettingsRepo } from '@/lib/db/settings';
import { createAdminClient } from '@/lib/supabase/admin';
import { toMadrid } from '@/lib/time';
import { buildDigest, type Digest } from './build';
import { buildWeekDigest, type WeekDigest } from './week';
import { cachedHeadlineOnly, noHeadline, withHeadlineCache, type WeekHeadlineMode } from './headlineCache';
import type { HoyRouteDeps } from './hoyApi';

export function buildDigestFor(opts: {
  client: SupabaseClient;
  userId: string;
  date: string;
  now: Date;
  settings: Settings;
  settingsRepo: SettingsRepo;
  /** Only the cached headline, never a new AI call (GET /api/hoy). */
  cachedHeadlineOnly?: boolean;
}): Promise<Digest> {
  const { client, userId, date, now, settings, settingsRepo } = opts;
  return buildDigest(date, {
    items: createSupabaseItemsRepo(client, { userId }),
    people: createSupabasePeopleRepo(client, { userId }),
    calendar: () => calendarGatewayFor(userId),
    ai: opts.cachedHeadlineOnly
      ? cachedHeadlineOnly(date, settings)
      : withHeadlineCache(createGeminiProvider(), date, settingsRepo, settings),
    tz: settings.tz,
    now,
  });
}

/**
 * Real wiring of buildWeekDigest (/semana and the weekly push). The AI line is cached per week
 * (last_week_headline / _week); see `headline` for reuse-only and counts-only.
 */
export function buildWeekDigestFor(opts: {
  client: SupabaseClient;
  userId: string;
  weekStart: string;
  now: Date;
  settings: Settings;
  settingsRepo: SettingsRepo;
  /** 'generate' (default; cached per week), 'cached' (reuse only) or 'none' (counts only). */
  headline?: WeekHeadlineMode;
}): Promise<WeekDigest> {
  const { client, userId, weekStart, now, settings, settingsRepo } = opts;
  const mode = opts.headline ?? 'generate';
  return buildWeekDigest(weekStart, {
    items: createSupabaseItemsRepo(client, { userId }),
    people: createSupabasePeopleRepo(client, { userId }),
    calendar: () => calendarGatewayFor(userId),
    ai:
      mode === 'none'
        ? noHeadline()
        : mode === 'cached'
          ? cachedHeadlineOnly(weekStart, settings, 'week')
          : withHeadlineCache(createGeminiProvider(), weekStart, settingsRepo, settings, 'week'),
    tz: settings.tz,
    now,
  });
}

/** Real wiring for GET /api/hoy: service-role client scoped to the token's owner, cached headline only. */
export const hoyRouteDeps: HoyRouteDeps = {
  verify: (authHeader) => verifyApiToken(authHeader),
  async digest(userId) {
    const client = createAdminClient();
    const { settings, repo: settingsRepo } = await loadSettingsOrDefaults(createSettingsRepo(client, userId));
    const now = new Date();
    const date = toMadrid(now, settings.tz).date;
    return buildDigestFor({ client, userId, date, now, settings, settingsRepo, cachedHeadlineOnly: true });
  },
};
