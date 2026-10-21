'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { createGeminiProvider } from '@/lib/ai/gemini';
import type { ActionResult } from '@/lib/actions/result';
import { getCalendarGateway } from '@/lib/calendar/server';
import * as core from '@/lib/capture/web';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import { createClient, requireUser } from '@/lib/supabase/server';
import { DEFAULT_TZ } from '@/lib/time';

/** The CaptureBar: runs the capture pipeline for the signed-in user (session repos, RLS). */
export async function captureFromWeb(formData: FormData): Promise<ActionResult<core.WebCapture>> {
  const result = await core.captureFromWeb(formData, {
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
