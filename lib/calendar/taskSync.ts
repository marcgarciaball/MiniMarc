/**
 * Keeps one Calendar event (in the "Tareas" calendar) per pending, timed task.
 * Plugged into the item actions as their `sync` hook (lib/actions/server.ts).
 */
import type { ItemSync, SyncResult } from '@/lib/actions/items';
import type { Item } from '@/lib/db/types';
import { calendarErrorKind, type CalendarGateway, type EventInput } from './client';

export const APP_URL = 'https://mini-marc-personal.vercel.app';
export const TASKS_CALENDAR = 'Tareas';
const DURATION_MS = 30 * 60_000;

/** `syncError` values stored on the item. */
export type SyncErrorCode = 'calendar_auth' | 'calendar_unavailable';

/**
 * A task gets an event only while it is a classified, pending, undeleted task with a time.
 * A date without time (Madrid midnight, hasTime=false) never gets one.
 */
export function wantsEvent(item: Item): boolean {
  return (
    item.type === 'tarea' &&
    item.hasTime &&
    item.dueAt !== null &&
    item.status === 'pendiente' &&
    !item.needsReview &&
    !item.deletedAt
  );
}

function eventFor(item: Item): EventInput {
  const startsAt = new Date(item.dueAt!);
  const area = item.area ?? 'personal';
  return {
    title: item.title,
    startsAt,
    endsAt: new Date(startsAt.getTime() + DURATION_MS),
    description: `Recordatorio de Agente Personal\n${APP_URL}/tareas?area=${area}`,
  };
}

/**
 * Creates, updates or deletes the task's event so Calendar matches the item. Never throws:
 * a failure comes back as `error` (calendar_auth / calendar_unavailable) with the current
 * `eventId` kept, so a retry still finds the event.
 */
export async function syncTaskEvent(item: Item, gw: CalendarGateway): Promise<SyncResult> {
  const want = wantsEvent(item);
  if (!want && !item.calendarEventId) return { eventId: null, error: null };
  try {
    const calendarId = await gw.ensureCalendar(TASKS_CALENDAR);
    if (!want) {
      await ignoreNotFound(gw.deleteEvent(calendarId, item.calendarEventId!));
      return { eventId: null, error: null };
    }
    const event = eventFor(item);
    if (item.calendarEventId) {
      try {
        await gw.updateEvent(calendarId, item.calendarEventId, event);
        return { eventId: item.calendarEventId, error: null };
      } catch (err) {
        // Deleted by hand in Google: make a new one.
        if (calendarErrorKind(err) !== 'not_found') throw err;
      }
    }
    return { eventId: await gw.createEvent(calendarId, event), error: null };
  } catch (err) {
    return { eventId: item.calendarEventId, error: toSyncError(err) };
  }
}

/**
 * The `sync` hook for the item actions. Loads the gateway only when Calendar has something to do,
 * so ideas, purchases and untimed tasks cost no credentials read. A failure to load it (no refresh
 * token → calendar_auth, database down → calendar_unavailable) is reported, not thrown.
 */
export function taskSyncHook(loadGateway: () => Promise<CalendarGateway>): ItemSync {
  return async (item) => {
    if (!wantsEvent(item) && !item.calendarEventId) return { eventId: null, error: null };
    let gw: CalendarGateway;
    try {
      gw = await loadGateway();
    } catch (err) {
      return { eventId: item.calendarEventId, error: toSyncError(err) };
    }
    return syncTaskEvent(item, gw);
  };
}

async function ignoreNotFound(p: Promise<void>): Promise<void> {
  try {
    await p;
  } catch (err) {
    if (calendarErrorKind(err) !== 'not_found') throw err;
  }
}

export function toSyncError(err: unknown): SyncErrorCode {
  return calendarErrorKind(err) === 'auth' ? 'calendar_auth' : 'calendar_unavailable';
}
