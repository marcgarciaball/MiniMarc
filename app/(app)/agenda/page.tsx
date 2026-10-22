import type { Metadata } from 'next';
import { unstable_rethrow } from 'next/navigation';
import { Suspense } from 'react';
import { AgendaScreen } from '@/components/agenda/AgendaScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { madridToday } from '@/lib/actions/today';
import { parseDayParam, toAgendaItems, weekRange, type AgendaItem } from '@/lib/agenda/week';
import { calendarGatewayFor } from '@/lib/calendar/server';
import { toSyncError, type SyncErrorCode } from '@/lib/calendar/taskSync';
import { requireUser } from '@/lib/supabase/server';

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
  const user = await requireUser();
  const today = madridToday();
  const selected = parseDayParam((await searchParams).d, today);
  const week = weekRange(selected);
  let items: AgendaItem[] = [];
  let error: SyncErrorCode | null = null;
  try {
    const gw = await calendarGatewayFor(user.id);
    const [events, tasksCalendarId] = await Promise.all([
      gw.listEvents({ from: week.from, to: week.to }),
      // Only to mark tasks; the agenda still shows if this lookup fails.
      gw.ensureCalendar('Tareas').catch(() => null),
    ]);
    items = toAgendaItems(events, tasksCalendarId);
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
