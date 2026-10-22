'use server';

import { unstable_rethrow } from 'next/navigation';
import * as core from '@/lib/actions/events';
import { sessionDeps } from '@/lib/actions/server';
import { DELETE_ERROR_MESSAGES, EVENT_ERROR_MESSAGES, REMINDER_ERROR_MESSAGES, type EventActionResult } from '@/lib/actions/events';
import type { SyncErrorCode } from '@/lib/calendar/taskSync';
import { UserError } from '@/lib/actions/result';
import { calendarGatewayFor } from '@/lib/calendar/server';
import { invalidate } from '@/lib/cache/server';
import { WRITES } from '@/lib/cache/tags';
import { requireUser } from '@/lib/supabase/server';

/**
 * "Nueva cita" in the Agenda: creates the event in Marc's primary calendar (180/60 popups).
 * Never throws at the UI: invalid fields and Calendar failures come back as `{ ok: false }`
 * so the sheet keeps what was typed. `code` tells the sheet to offer "Volver a entrar con Google".
 */
export async function addEvent(formData: FormData): Promise<EventActionResult> {
  try {
    // Outside core.addEvent: its Calendar catch must not swallow the redirect to /login.
    const user = await requireUser();
    const result = await core.addEvent({ calendar: () => calendarGatewayFor(user.id) }, formData);
    invalidate(user.id, WRITES.event);
    if (!result.ok) return { ok: false, error: EVENT_ERROR_MESSAGES[result.error], code: result.error };
    return { ok: true, value: result.eventId };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { ok: false, error: e.message };
    return { ok: false, error: EVENT_ERROR_MESSAGES.calendar_unavailable, code: 'calendar_unavailable' };
  }
}

/**
 * "Añadir avisos" on a cita of the primary calendar: sets its 180/60 popups. Like addEvent,
 * never throws at the UI; `code` lets the screen offer "Volver a entrar con Google".
 */
export async function addReminders(eventId: string): Promise<{ ok: true } | { ok: false; error: string; code?: SyncErrorCode }> {
  try {
    const user = await requireUser();
    const result = await core.addReminders({ calendar: () => calendarGatewayFor(user.id) }, String(eventId ?? ''));
    invalidate(user.id, WRITES.event);
    if (!result.ok) return { ok: false, error: REMINDER_ERROR_MESSAGES[result.error], code: result.error };
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { ok: false, error: e.message };
    return { ok: false, error: REMINDER_ERROR_MESSAGES.calendar_unavailable, code: 'calendar_unavailable' };
  }
}

/**
 * "Eliminar" en la hoja de un evento de la Agenda: lo borra del calendario donde esté, incluidos
 * los que no gestiona la app. Si era el evento de una tarea, la tarea se va con él a la papelera,
 * así que invalida también los items.
 */
export async function deleteAgendaEvent(
  event: { eventId: string; calendarId: string; isTask?: boolean },
): Promise<{ ok: true } | { ok: false; error: string; code?: SyncErrorCode }> {
  try {
    // sessionDeps ya exige la sesión: no hace falta pedirla dos veces.
    const { userId, deps } = await sessionDeps();
    const result = await core.deleteAgendaEvent({ calendar: () => calendarGatewayFor(userId), items: deps.items }, event);
    invalidate(userId, WRITES.item);
    if (!result.ok) return { ok: false, error: DELETE_ERROR_MESSAGES[result.error], code: result.error };
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { ok: false, error: e.message };
    return { ok: false, error: DELETE_ERROR_MESSAGES.calendar_unavailable, code: 'calendar_unavailable' };
  }
}
