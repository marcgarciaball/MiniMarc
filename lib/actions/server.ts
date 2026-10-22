import { calendarGatewayFor } from '@/lib/calendar/server';
import { taskSyncHook } from '@/lib/calendar/taskSync';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import { withServerPreviews } from '@/lib/links/server';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionDeps } from './items';

/**
 * Repos bound to the signed-in user's session (RLS scopes every query to Marc).
 * Redirects to /login without an allowed session. Used by pages and server actions.
 */
export async function getDeps(): Promise<ActionDeps> {
  const user = await requireUser();
  const client = await createClient();
  return {
    // A save that sets a link fetches its preview after the response.
    items: withServerPreviews(createSupabaseItemsRepo(client), user.id),
    people: createSupabasePeopleRepo(client),
    // Timed tasks ↔ "Tareas" calendar. Reads the Google credentials only when there is an
    // event to create, change or delete; never throws (errors are stored as syncError).
    sync: taskSyncHook(() => calendarGatewayFor(user.id)),
  };
}
