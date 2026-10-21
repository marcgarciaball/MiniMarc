/**
 * Logic behind the Agenda (app/(app)/agenda) and its server action (app/actions/events.ts).
 * Pure: Calendar comes in through `deps`, so tests use a fake gateway.
 */
import type { CalendarEvent, CalendarGateway, EventInput } from '@/lib/calendar/client';
import { toSyncError, type SyncErrorCode } from '@/lib/calendar/taskSync';
import { isValidDate, madridDateTime, madridToUtc } from '@/lib/time';
import { UserError } from './result';

/** Google's alias for the signed-in user's main calendar: citas go there, tasks go to "Tareas". */
export const PRIMARY_CALENDAR = 'primary';

export interface EventDeps {
  /** Loads the gateway (getCalendarGateway on the server). May throw CalendarError('auth'). */
  calendar: () => Promise<CalendarGateway>;
}

/** Validation errors throw a UserError; Calendar failures come back with Tarea 7's codes. */
export type AddEventResult = { ok: true; eventId: string } | { ok: false; error: SyncErrorCode };

/** What the server action hands to the sheet: `error` is shown as is, `code` adds the re-login link. */
export type EventActionResult = { ok: true; value: string } | { ok: false; error: string; code?: SyncErrorCode };

export const EVENT_ERROR_MESSAGES: Record<SyncErrorCode, string> = {
  calendar_auth: 'Google Calendar necesita que vuelvas a entrar. La cita no se ha guardado.',
  calendar_unavailable: 'Google Calendar no responde. La cita no se ha guardado; inténtalo de nuevo.',
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

/** Reads the "Nueva cita" form: title, date, start, end (optional), notes (optional), all in Madrid. */
export function parseNewEvent(fd: FormData): EventInput {
  const title = field(fd, 'title');
  if (!title) throw new UserError('El título no puede estar vacío');
  const date = field(fd, 'date');
  if (!isValidDate(date)) throw new UserError('La fecha no es válida.');
  const start = field(fd, 'start');
  if (!start) throw new UserError('Indica la hora de inicio.');
  const end = field(fd, 'end');
  if (!TIME.test(start) || (end && !TIME.test(end))) throw new UserError('La hora no es válida.');

  const event: EventInput = { title, startsAt: madridToUtc(date, start) };
  if (end) {
    event.endsAt = madridToUtc(date, end);
    if (event.endsAt <= event.startsAt) throw new UserError('La hora de fin debe ser posterior a la de inicio.');
  }
  const notes = field(fd, 'notes');
  if (notes) event.description = notes;
  return event;
}

/**
 * Creates a cita in the primary calendar. The gateway always adds the 180/60 popup reminders.
 * Throws UserError before touching Calendar if the form is invalid.
 */
export async function addEvent(deps: EventDeps, fd: FormData): Promise<AddEventResult> {
  return createCita(deps, parseNewEvent(fd));
}

/**
 * Creates an already-validated cita in the primary calendar (with the 180/60 reminders).
 * Never throws: a Calendar failure comes back as `{ ok: false, error }`. Shared by the
 * "Nueva cita" form and the capture pipeline (lib/capture/pipeline.ts).
 */
export async function createCita(deps: EventDeps, input: EventInput): Promise<AddEventResult> {
  try {
    const gw = await deps.calendar();
    return { ok: true, eventId: await gw.createEvent(PRIMARY_CALENDAR, input) };
  } catch (err) {
    return { ok: false, error: toSyncError(err) };
  }
}

// ---------- Agenda (read side) ----------

export const AGENDA_DAYS = 8;

/** "YYYY-MM-DD" + n days (calendar arithmetic, no time zone involved). */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Today and the next 7 days, from Madrid midnight to Madrid midnight. */
export function agendaRange(today: string): { days: string[]; from: Date; to: Date } {
  const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(today, i));
  return { days, from: madridToUtc(today, '00:00'), to: madridToUtc(addDays(today, AGENDA_DAYS), '00:00') };
}

export interface AgendaEvent {
  id: string;
  title: string;
  /** "10:00 – 11:00", "10:00" (tasks) or "Todo el día". */
  time: string;
  allDay: boolean;
  /** From the "Tareas" calendar (timed tasks synced by the app). */
  isTask: boolean;
  /** A timed event without the 180/60 popup reminders. */
  missingReminders: boolean;
}

export interface AgendaDay {
  date: string;
  events: AgendaEvent[];
}

/** Groups the listed events by Madrid day (anything already running counts as today); empty days are left out. */
export function groupAgenda(
  events: CalendarEvent[],
  opts: { today: string; tasksCalendarId: string | null },
): AgendaDay[] {
  const byDay = new Map<string, AgendaEvent[]>();
  const sorted = [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (const ev of sorted) {
    const start = madridDateTime(ev.startsAt);
    const end = madridDateTime(ev.endsAt);
    const allDay = start.time === '00:00' && end.time === '00:00' && ev.endsAt > ev.startsAt;
    const isTask = ev.calendarId === opts.tasksCalendarId;
    const showEnd = !isTask && ev.endsAt > ev.startsAt;
    const date = start.date < opts.today ? opts.today : start.date;
    const list = byDay.get(date) ?? [];
    list.push({
      id: ev.id,
      title: ev.title || '(Sin título)',
      time: allDay ? 'Todo el día' : showEnd ? `${start.time} – ${end.time}` : start.time,
      allDay,
      isTask,
      missingReminders: !allDay && !ev.hasRequiredReminders,
    });
    byDay.set(date, list);
  }
  return [...byDay.keys()].sort().map((date) => ({ date, events: byDay.get(date)! }));
}
