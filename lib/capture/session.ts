/** Capture pipeline deps for the signed-in user (session repos, RLS). Server only. */
import { createGeminiProvider } from '@/lib/ai/gemini';
import { getCalendarGateway } from '@/lib/calendar/server';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import { withServerPreviews } from '@/lib/links/server';
import { createClient, requireUser } from '@/lib/supabase/server';
import { DEFAULT_TZ } from '@/lib/time';
import type { CaptureDeps } from './pipeline';

/** Redirects to /login without an allowed session. Used by the CaptureBar and /compartir. */
export async function sessionCaptureDeps(): Promise<CaptureDeps> {
  const user = await requireUser();
  const client = await createClient();
  return {
    ai: createGeminiProvider(),
    items: withServerPreviews(createSupabaseItemsRepo(client), user.id),
    people: createSupabasePeopleRepo(client),
    calendar: () => getCalendarGateway(),
    now: new Date(),
    tz: process.env.APP_TZ || DEFAULT_TZ,
  };
}
