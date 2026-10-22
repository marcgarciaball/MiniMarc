import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { SemanaScreen } from '@/components/semana/SemanaScreen';
import { parseWeekParam, weekRange } from '@/lib/agenda/week';
import { createSettingsRepo, loadSettingsOrDefaults } from '@/lib/db/settings';
import { weekHeadlineMode } from '@/lib/digest/headlineCache';
import { buildWeekDigestFor } from '@/lib/digest/server';
import { createClient, requireUser } from '@/lib/supabase/server';
import { toMadrid } from '@/lib/time';

export const metadata: Metadata = { title: 'Semana' };

type SearchParams = Promise<{ w?: string | string[] }>;

export default function SemanaPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenFallback title="Semana" />}>
      <Semana searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * The week of `?w=` (any day of it; default this week). Only the week the weekly push targets
 * generates the AI line; the other of this/next week reuses the cache; other weeks show counts.
 */
async function Semana({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const client = await createClient();
  const { settings, repo } = await loadSettingsOrDefaults(createSettingsRepo(client, user.id));
  const now = new Date();
  const today = toMadrid(now, settings.tz).date;
  const weekStart = parseWeekParam((await searchParams).w, today);
  const thisWeek = weekRange(today).start;
  const week = await buildWeekDigestFor({
    client,
    userId: user.id,
    weekStart,
    now,
    settings,
    settingsRepo: repo,
    headline: weekHeadlineMode(weekStart, today, settings.weeklyDigest),
  });
  return <SemanaScreen week={week} thisWeek={thisWeek} />;
}
