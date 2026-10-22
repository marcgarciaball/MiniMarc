'use client';

import { InsetList, Row, Sheet } from '@/components/ui';
import { formatLongDate } from '@/lib/time';
import type { AgendaItem } from '@/lib/agenda/week';
import { canAddReminders, needsReminders, timeRange } from './DayTimeline';

export type EventDetailSheetProps = {
  /** Null keeps the sheet closed. */
  item: AgendaItem | null;
  /** The day it was opened from (a multi-day event shows that day). */
  date: string;
  saving: boolean;
  onAddReminders: (id: string) => void;
  onClose: () => void;
};

function calendarLabel(item: AgendaItem): string {
  if (item.isTask) return 'Tareas';
  return item.isPrimary ? 'Principal' : 'Otro calendario';
}

function remindersLabel(item: AgendaItem): string {
  if (item.allDay) return 'Sin avisos de hora';
  return item.hasRequiredReminders ? '3 h y 1 h antes' : 'Sin avisos de 3 h y 1 h';
}

/** Details of one event, read only, with "Añadir avisos" for citas of the primary calendar. */
export function EventDetailSheet({ item, date, saving, onAddReminders, onClose }: EventDetailSheetProps) {
  const footer =
    item && needsReminders(item) && !canAddReminders(item)
      ? item.isTask
        ? 'Los avisos de las tareas se ponen al guardarlas con hora en la app.'
        : 'Este evento es de otro calendario: sus avisos se cambian en Google Calendar.'
      : undefined;

  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      title={item?.isTask ? 'Tarea' : 'Cita'}
      trailing={
        <button type="button" className="ui-bar-button ui-bar-button--strong" onClick={onClose}>
          OK
        </button>
      }
    >
      {item && (
        <div className="app-form">
          <h3 className="app-event-detail__title">{item.title}</h3>
          <InsetList>
            <Row title="Fecha" detail={capitalize(formatLongDate(new Date(`${date}T12:00:00Z`)))} />
            <Row title="Hora" detail={timeRange(item)} />
            {item.location && <Row title="Lugar" subtitle={item.location} />}
            <Row title="Calendario" detail={calendarLabel(item)} />
          </InsetList>
          <InsetList footer={footer}>
            <Row title="Avisos" detail={remindersLabel(item)} />
            {canAddReminders(item) && (
              <button
                type="button"
                className="ui-row app-event-detail__action"
                disabled={saving}
                onClick={() => onAddReminders(item.id)}
              >
                {saving ? 'Añadiendo avisos…' : 'Añadir avisos de 3 h y 1 h'}
              </button>
            )}
          </InsetList>
        </div>
      )}
    </Sheet>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
