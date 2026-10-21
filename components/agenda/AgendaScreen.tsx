'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PlusIcon } from '@/components/icons';
import { InsetList, LargeTitle, Row } from '@/components/ui';
import type { AgendaDay, AgendaEvent } from '@/lib/actions/events';
import type { SyncErrorCode } from '@/lib/calendar/taskSync';
import { formatDay } from '@/lib/format';
import { RECONNECT_HREF } from '@/lib/nav';
import { EventSheet } from './EventSheet';

export type AgendaScreenProps = {
  /** Madrid "YYYY-MM-DD". */
  today: string;
  /** Null when Calendar could not be read (`error` says why). */
  days: AgendaDay[] | null;
  error: SyncErrorCode | null;
};

const REMINDERS_HINT = 'Sin avisos de 3 h y 1 h';

function subtitle(ev: AgendaEvent): string | undefined {
  const parts = [ev.isTask && 'Tarea', ev.missingReminders && REMINDERS_HINT].filter(Boolean);
  return parts.join(' · ') || undefined;
}

/** Today and the next 7 days from Google Calendar, grouped by day, with "Nueva cita". */
export function AgendaScreen({ today, days, error }: AgendaScreenProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <LargeTitle
        title="Agenda"
        trailing={
          <button type="button" className="ui-bar-button" aria-label="Nueva cita" onClick={() => setSheetOpen(true)}>
            <PlusIcon />
          </button>
        }
      >
        {error ? (
          <div className="app-notice" role="status">
            {error === 'calendar_auth' ? (
              <>
                <p>Google Calendar necesita que vuelvas a entrar para mostrar tu agenda.</p>
                <Link href={RECONNECT_HREF} className="app-notice__action">
                  Volver a entrar con Google
                </Link>
              </>
            ) : (
              <p>Google Calendar no responde ahora mismo. Vuelve a mirar en un rato.</p>
            )}
          </div>
        ) : days && days.length > 0 ? (
          days.map((day) => (
            <InsetList key={day.date} header={formatDay(day.date, today)}>
              {day.events.map((ev) => (
                <Row key={ev.id} title={ev.title} subtitle={subtitle(ev)} detail={ev.time} />
              ))}
            </InsetList>
          ))
        ) : (
          <p className="app-empty">Nada en la agenda para los próximos 7 días.</p>
        )}
      </LargeTitle>

      <EventSheet open={sheetOpen} today={today} onClose={() => setSheetOpen(false)} />
    </>
  );
}
