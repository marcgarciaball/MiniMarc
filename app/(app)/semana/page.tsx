import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { SemanaScreen } from '@/components/semana/SemanaScreen';
import { readSemana } from '@/lib/cache/reads';
import type { Settings } from '@/lib/db/settings';
import { generateHeadline } from '@/lib/digest/server';
import { createClient, requireUser } from '@/lib/supabase/server';

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
 * generates the AI line (streamed in, never holding the page); the other of this/next week
 * reuses the cache; other weeks show counts.
 */
async function Semana({ searchParams }: { searchParams: SearchParams }) {
  const { w } = await searchParams;
  const { week, headlinePrompt, settings, thisWeek } = await readSemana(typeof w === 'string' ? w : undefined);
  const headline = headlinePrompt ? (
    <Suspense fallback={<span className="app-headline-pending" aria-hidden />}>
      <WeekHeadline weekStart={week.weekStart} settings={settings} prompt={headlinePrompt} />
    </Suspense>
  ) : undefined;
  return <SemanaScreen week={week} thisWeek={thisWeek} headline={headline} />;
}

async function WeekHeadline({ weekStart, settings, prompt }: { weekStart: string; settings: Settings; prompt: string }) {
  const [user, client] = await Promise.all([requireUser(), createClient()]);
  return generateHeadline({ client, userId: user.id, key: weekStart, settings, prompt, slot: 'week', fallback: null });
}
