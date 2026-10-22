'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { attempt, type ActionResult } from '@/lib/actions/result';
import { sessionCaptureDeps } from '@/lib/capture/session';
import * as core from '@/lib/capture/web';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import type { Person } from '@/lib/db/types';
import { createClient, requireUser } from '@/lib/supabase/server';

/**
 * The CaptureBar: Auto runs the capture pipeline; the other chips save the chosen type
 * directly, without the AI. Signed-in user only (session repos, RLS).
 */
export async function quickCapture(formData: FormData): Promise<ActionResult<core.QuickCapture>> {
  const result = await core.quickCapture(formData, { captureDeps: sessionCaptureDeps, rethrow: unstable_rethrow });
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
