'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import * as core from '@/lib/actions/events';
import { EVENT_ERROR_MESSAGES, type EventActionResult } from '@/lib/actions/events';
import { UserError } from '@/lib/actions/result';
import { calendarGatewayFor } from '@/lib/calendar/server';
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
    if (!result.ok) return { ok: false, error: EVENT_ERROR_MESSAGES[result.error], code: result.error };
    revalidatePath('/agenda');
    return { ok: true, value: result.eventId };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { ok: false, error: e.message };
    return { ok: false, error: EVENT_ERROR_MESSAGES.calendar_unavailable, code: 'calendar_unavailable' };
  }
}
