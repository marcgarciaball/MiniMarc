/** Real wiring of buildDigest, shared by /hoy (session client) and the cron (service role). Server only. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createGeminiProvider } from '@/lib/ai/gemini';
import { calendarGatewayFor } from '@/lib/calendar/server';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import type { Settings, SettingsRepo } from '@/lib/db/settings';
import { buildDigest, type Digest } from './build';
import { withHeadlineCache } from './headlineCache';

export function buildDigestFor(opts: {
  client: SupabaseClient;
  userId: string;
  date: string;
  now: Date;
  settings: Settings;
  settingsRepo: SettingsRepo;
}): Promise<Digest> {
  const { client, userId, date, now, settings, settingsRepo } = opts;
  return buildDigest(date, {
    items: createSupabaseItemsRepo(client, { userId }),
    people: createSupabasePeopleRepo(client, { userId }),
    calendar: () => calendarGatewayFor(userId),
    ai: withHeadlineCache(createGeminiProvider(), date, settingsRepo, settings),
    tz: settings.tz,
    now,
  });
}
