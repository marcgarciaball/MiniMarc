/**
 * Real Calendar gateway for a user, built from the refresh token saved at login
 * (google_credentials, service role only). Server only.
 */
import { auth } from 'googleapis/build/src/apis/calendar';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/supabase/server';
import { CalendarError, createCalendarClient, withCachedCalendar, type CalendarGateway } from './client';

/**
 * Gateway for `userId`. Throws CalendarError('auth') when no refresh token is stored; the
 * OAuth2 client renews the access token on each request, and a revoked/expired refresh token
 * surfaces as CalendarError('auth') from the gateway call. The "Tareas" calendar id is cached
 * in google_credentials.calendar_tasks_id.
 */
export async function calendarGatewayFor(userId: string): Promise<CalendarGateway> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('google_credentials')
    .select('refresh_token, calendar_tasks_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.refresh_token) throw new CalendarError('auth', 'No refresh token stored');

  const oauth = new auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: data.refresh_token });

  return withCachedCalendar(createCalendarClient(oauth), {
    get: async () => data.calendar_tasks_id ?? null,
    async set(id) {
      const { error } = await db
        .from('google_credentials')
        .update({ calendar_tasks_id: id, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
    },
  });
}

/** Gateway for the signed-in user (redirects to /login without a session). */
export async function getCalendarGateway(): Promise<CalendarGateway> {
  const user = await requireUser();
  return calendarGatewayFor(user.id);
}
