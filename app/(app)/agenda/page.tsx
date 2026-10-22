import type { Metadata } from 'next';
import { unstable_rethrow } from 'next/navigation';
import { Suspense } from 'react';
import { AgendaScreen } from '@/components/agenda/AgendaScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { madridToday } from '@/lib/actions/today';
import { parseDayParam, toAgendaItems, weekRange, type AgendaItem } from '@/lib/agenda/week';
import { toSyncError, type SyncErrorCode } from '@/lib/calendar/taskSync';
import { readEvents } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Agenda' };

type SearchParams = Promise<{ d?: string | string[] }>;

export default function AgendaPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenFallback title="Agenda" />}>
      <Agenda searchParams={searchParams} />
    </Suspense>
  );
}

/** The week of `?d=` (default today), read from Google Calendar Monday 00:00 → Monday 00:00 in Madrid. */
async function Agenda({ searchParams }: { searchParams: SearchParams }) {
  const { d } = await searchParams;
  const today = madridToday();
  const selected = parseDayParam(d, today);
  const week = weekRange(selected);
  let items: AgendaItem[] = [];
  let error: SyncErrorCode | null = null;
  try {
    // Cached per session for a minute (lib/cache/reads.ts); a cita added here invalidates it.
    const read = await readEvents(week.from.toISOString(), week.to.toISOString());
    if (read.error) error = read.error;
    else items = toAgendaItems(read.events, read.tasksCalendarId);
  } catch (err) {
    unstable_rethrow(err);
    error = toSyncError(err);
  }
  // Keyed by week: a new week starts with fresh client state (selected day, opened event).
  return (
    <AgendaScreen
      key={week.start}
      today={today}
      selected={selected}
      days={week.days}
      items={items}
      error={error}
    />
  );
}
