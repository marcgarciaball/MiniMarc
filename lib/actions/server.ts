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
    // Tarea 7: add `sync` here (Google Calendar via syncTaskEvent) so every item action stays in step.
  };
}
