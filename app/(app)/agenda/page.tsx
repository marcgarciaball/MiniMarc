import type { Metadata } from 'next';
import { unstable_rethrow } from 'next/navigation';
import { Suspense } from 'react';
import { AgendaScreen } from '@/components/agenda/AgendaScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { agendaRange, groupAgenda, type AgendaDay } from '@/lib/actions/events';
import { madridToday } from '@/lib/actions/today';
import { calendarGatewayFor } from '@/lib/calendar/server';
import { toSyncError, type SyncErrorCode } from '@/lib/calendar/taskSync';
import { requireUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Agenda' };

export default function AgendaPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Agenda" />}>
      <Agenda />
    </Suspense>
  );
}

async function Agenda() {
  const user = await requireUser();
  const today = madridToday();
  let days: AgendaDay[] | null = null;
  let error: SyncErrorCode | null = null;
  try {
    const gw = await calendarGatewayFor(user.id);
    const [events, tasksCalendarId] = await Promise.all([
      gw.listEvents(agendaRange(today)),
      // Only to mark tasks; the agenda still shows if this lookup fails.
      gw.ensureCalendar('Tareas').catch(() => null),
    ]);
    days = groupAgenda(events, { today, tasksCalendarId });
  } catch (err) {
    unstable_rethrow(err);
    error = toSyncError(err);
  }
  return <AgendaScreen today={today} days={days} error={error} />;
}
