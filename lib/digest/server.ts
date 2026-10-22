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
import { askOneLine, buildDigest, FALLBACK_HEADLINE, type Digest } from './build';
import { deferHeadline, DEFERRED_HEADLINE } from './deferredHeadline';
import { buildWeekDigest, type WeekDigest } from './week';
import { cachedHeadlineOnly, noHeadline, withHeadlineCache, type HeadlineSlot, type WeekHeadlineMode } from './headlineCache';
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
 * /hoy without waiting on the AI: the digest with today's cached headline, or with
 * `headlinePrompt` set when the line is still to be generated (see generateHeadline).
 */
export async function buildDigestDeferred(opts: {
  client: SupabaseClient;
  userId: string;
  date: string;
  now: Date;
  settings: Settings;
}): Promise<{ digest: Digest; headlinePrompt: string | null }> {
  const { client, userId, date, now, settings } = opts;
  const deferred = deferHeadline(cachedHeadlineOnly(date, settings));
  const digest = await buildDigest(date, {
    items: createSupabaseItemsRepo(client, { userId }),
    people: createSupabasePeopleRepo(client, { userId }),
    calendar: () => calendarGatewayFor(userId),
    ai: deferred.ai,
    tz: settings.tz,
    now,
  });
  return { digest, headlinePrompt: digest.headline === DEFERRED_HEADLINE ? deferred.prompt() : null };
}

/** /semana without waiting on the AI (mode 'generate' only defers; the others never call it). */
export async function buildWeekDigestDeferred(opts: {
  client: SupabaseClient;
  userId: string;
  weekStart: string;
  now: Date;
  settings: Settings;
  headline: WeekHeadlineMode;
}): Promise<{ week: WeekDigest; headlinePrompt: string | null }> {
  const { client, userId, weekStart, now, settings, headline } = opts;
  const deferred = deferHeadline(cachedHeadlineOnly(weekStart, settings, 'week'));
  const week = await buildWeekDigest(weekStart, {
    items: createSupabaseItemsRepo(client, { userId }),
    people: createSupabasePeopleRepo(client, { userId }),
    calendar: () => calendarGatewayFor(userId),
    ai: headline === 'generate' ? deferred.ai : headline === 'cached' ? cachedHeadlineOnly(weekStart, settings, 'week') : noHeadline(),
    tz: settings.tz,
    now,
  });
  if (week.headline !== DEFERRED_HEADLINE) return { week, headlinePrompt: null };
  return { week: { ...week, headline: null }, headlinePrompt: deferred.prompt() };
}

/**
 * The AI line for a deferred prompt, streamed by the page in its own Suspense. Cached per day
 * (or week) in settings, like buildDigestFor, so the morning push and /hoy share one call.
 */
export async function generateHeadline<F extends string | null>(opts: {
  client: SupabaseClient;
  userId: string;
  /** The local date (slot 'day') or the week's Monday (slot 'week'). */
  key: string;
  settings: Settings;
  prompt: string;
  slot: HeadlineSlot;
  fallback: F;
}): Promise<string | F> {
  const repo = createSettingsRepo(opts.client, opts.userId);
  const ai = withHeadlineCache(createGeminiProvider(), opts.key, repo, opts.settings, opts.slot);
  return askOneLine({ ai }, opts.prompt, opts.fallback);
}

export { FALLBACK_HEADLINE };

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
