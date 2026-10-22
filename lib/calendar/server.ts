/**
 * Real Calendar gateway for a user, built from the refresh token saved at login
 * (google_credentials, service role only). Server only.
 */
import { auth } from 'googleapis/build/src/apis/calendar';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/supabase/server';
import { CalendarError, createCalendarClient, withCachedCalendar, type CalendarGateway } from './client';
import { createAccessTokenCache } from './tokenCache';

/** Access tokens of this server instance (lib/calendar/tokenCache.ts). */
const accessTokens = createAccessTokenCache();

/**
 * Gateway for `userId`. Throws CalendarError('auth') when no refresh token is stored. The access
 * token is reused from memory until it is about to expire (no refresh round-trip per request);
 * a refused one is renewed once (forceRefreshOnFailure), and a revoked/expired refresh token
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

  const refreshToken: string = data.refresh_token;
  const oauth = new auth.OAuth2({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    forceRefreshOnFailure: true,
  });
  const cached = accessTokens.get(userId, refreshToken);
  oauth.setCredentials({
    refresh_token: refreshToken,
    ...(cached && { access_token: cached.accessToken, expiry_date: cached.expiresAt }),
  });
  oauth.on('tokens', (t) => accessTokens.set(userId, refreshToken, { accessToken: t.access_token, expiresAt: t.expiry_date }));

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
