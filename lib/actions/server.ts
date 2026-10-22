import { unstable_rethrow } from 'next/navigation';
import { calendarGatewayFor } from '@/lib/calendar/server';
import { taskSyncHook } from '@/lib/calendar/taskSync';
import { invalidate } from '@/lib/cache/server';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import { withServerPreviews } from '@/lib/links/server';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionDeps } from './items';
import { createActionRunner } from './run';

/**
 * The signed-in user and repos bound to their session (RLS scopes every query to Marc).
 * Redirects to /login without an allowed session. The session check and the client are
 * shared by the whole request (React cache), so pages pay for them once.
 */
export async function sessionDeps(): Promise<{ userId: string; deps: ActionDeps }> {
  const [user, client] = await Promise.all([requireUser(), createClient()]);
  return {
    userId: user.id,
    deps: {
      // A save that sets a link fetches its preview after the response.
      items: withServerPreviews(createSupabaseItemsRepo(client), user.id),
      people: createSupabasePeopleRepo(client),
      // Timed tasks ↔ "Tareas" calendar. Reads the Google credentials only when there is an
      // event to create, change or delete; never throws (errors are stored as syncError).
      sync: taskSyncHook(() => calendarGatewayFor(user.id)),
    },
  };
}

/** Repos for the signed-in user (pages). */
export async function getDeps(): Promise<ActionDeps> {
  return (await sessionDeps()).deps;
}

/** Runs a write action for the signed-in user and invalidates what it may change. */
export const runAction = createActionRunner({ session: sessionDeps, invalidate, rethrow: unstable_rethrow });
