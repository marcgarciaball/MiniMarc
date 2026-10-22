/**
 * Logic behind the Agenda (app/(app)/agenda) and its server action (app/actions/events.ts).
 * Pure: Calendar comes in through `deps`, so tests use a fake gateway.
 */
import { calendarErrorKind, type CalendarGateway, type EventInput, type TimedEventInput } from '@/lib/calendar/client';
import type { ItemsRepo } from '@/lib/db/items';
import { toSyncError, type SyncErrorCode } from '@/lib/calendar/taskSync';
import { isValidDate, madridToUtc } from '@/lib/time';
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

/** Lo que se le dice a Marc cuando no se ha podido borrar. */
export const DELETE_ERROR_MESSAGES: Record<SyncErrorCode, string> = {
  calendar_auth: 'Google Calendar necesita que vuelvas a entrar. No se ha borrado nada.',
  calendar_unavailable: 'Google Calendar no responde. No se ha borrado nada; inténtalo de nuevo.',
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

/** Reads the "Nueva cita" form: title, date, start, end (optional), notes (optional), all in Madrid. */
export function parseNewEvent(fd: FormData): TimedEventInput {
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

// ---------- "Añadir avisos" ----------

export type AddRemindersResult = { ok: true } | { ok: false; error: SyncErrorCode };

export const REMINDER_ERROR_MESSAGES: Record<SyncErrorCode, string> = {
  calendar_auth: 'Google Calendar necesita que vuelvas a entrar para añadir los avisos.',
  calendar_unavailable: 'Google Calendar no responde. Los avisos no se han añadido; inténtalo en un rato.',
};

/**
 * Gives an existing cita of the primary calendar the 180/60 popup reminders (and nothing else).
 * Always patches PRIMARY_CALENDAR, so an id from any other calendar cannot be touched.
 * Throws UserError without an id; Calendar failures come back as `{ ok: false, error }`.
 */
export async function addReminders(deps: EventDeps, eventId: string): Promise<AddRemindersResult> {
  const id = eventId.trim();
  if (!id) throw new UserError('Falta la cita.');
  try {
    const gw = await deps.calendar();
    await gw.setRequiredReminders(PRIMARY_CALENDAR, id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toSyncError(err) };
  }
}

/**
 * Borrar desde la Agenda lo que se ve en la Agenda, venga del calendario que venga.
 *
 * El evento de una tarea no se borra solo: la tarea iría a la papelera igualmente en la próxima
 * pasada del cron, o peor, el evento volvería a crearse. Así que la tarea se va con él, a la
 * papelera (recuperable 30 días) y sin su `calendarEventId`, que ya no apunta a nada.
 */
export async function deleteAgendaEvent(
  deps: EventDeps & { items?: ItemsRepo },
  event: { eventId: string; calendarId: string; isTask?: boolean },
): Promise<{ ok: true } | { ok: false; error: SyncErrorCode }> {
  const eventId = event.eventId.trim();
  const calendarId = event.calendarId.trim();
  if (!eventId || !calendarId) throw new UserError('Falta el evento.');
  try {
    const gw = await deps.calendar();
    try {
      await gw.deleteEvent(calendarId, eventId);
    } catch (err) {
      // Ya no estaba: el objetivo se ha cumplido igual.
      if (calendarErrorKind(err) !== 'not_found') throw err;
    }
    if (event.isTask && deps.items) await trashTaskOf(deps.items, eventId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toSyncError(err) };
  }
}

/** La tarea dueña de ese evento, a la papelera y sin el enlace al evento que acaba de irse. */
async function trashTaskOf(items: ItemsRepo, eventId: string): Promise<void> {
  const item = (await items.listCalendarState()).find((i) => i.calendarEventId === eventId && !i.deletedAt);
  if (!item) return;
  await items.updateItem(item.id, { calendarEventId: null, syncError: null });
  await items.softDeleteItem(item.id);
}
