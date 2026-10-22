'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { createGeminiProvider } from '@/lib/ai/gemini';
import { attempt, type ActionResult } from '@/lib/actions/result';
import { getCalendarGateway } from '@/lib/calendar/server';
import * as core from '@/lib/capture/web';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import type { Person } from '@/lib/db/types';
import { createClient, requireUser } from '@/lib/supabase/server';
import { DEFAULT_TZ } from '@/lib/time';

/**
 * The CaptureBar: Auto runs the capture pipeline; the other chips save the chosen type
 * directly, without the AI. Signed-in user only (session repos, RLS).
 */
export async function quickCapture(formData: FormData): Promise<ActionResult<core.QuickCapture>> {
  const result = await core.quickCapture(formData, {
    async captureDeps() {
      await requireUser();
      const client = await createClient();
      return {
        ai: createGeminiProvider(),
        items: createSupabaseItemsRepo(client),
        people: createSupabasePeopleRepo(client),
        calendar: () => getCalendarGateway(),
        now: new Date(),
        tz: process.env.APP_TZ || DEFAULT_TZ,
      };
    },
    rethrow: unstable_rethrow,
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** People for the bar's Regalo picker (loaded when the chip is chosen). */
export async function listCapturePeople(): Promise<ActionResult<Person[]>> {
  return attempt(
    async () => {
      await requireUser();
      return createSupabasePeopleRepo(await createClient()).listPeople();
    },
    'No se han podido cargar las personas.',
    unstable_rethrow,
  );
}
