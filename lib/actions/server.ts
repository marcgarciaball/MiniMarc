import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionDeps } from './items';

/**
 * Repos bound to the signed-in user's session (RLS scopes every query to Marc).
 * Redirects to /login without an allowed session. Used by pages and server actions.
 */
export async function getDeps(): Promise<ActionDeps> {
  await requireUser();
  const client = await createClient();
  return {
    items: createSupabaseItemsRepo(client),
    people: createSupabasePeopleRepo(client),
    // Tarea 7: `sync: (item) => syncTaskEvent(item, gw)`. Its `{ eventId, error }` is the
    // `SyncResult` that afterWrite stores; if it throws, afterWrite stores SYNC_UNAVAILABLE
    // and the action still succeeds, so no adapter or try/catch is needed here.
  };
}
