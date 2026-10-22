'use server';

import { unstable_rethrow } from 'next/navigation';
import type { ActionResult } from '@/lib/actions/result';
import { getDeps } from '@/lib/actions/server';
import { invalidate } from '@/lib/cache/server';
import { WRITES } from '@/lib/cache/tags';
import { requireUser } from '@/lib/supabase/server';
import { sessionCaptureDeps } from '@/lib/capture/session';
import { quickCapture } from '@/lib/capture/web';
import * as core from '@/lib/share/handler';

/*
 * «Guardar» on /compartir (I-1). Server actions, so Next rejects a cross-site Origin; every call
 * needs Marc's session (getDeps / sessionCaptureDeps redirect to /login) and runs with the
 * session client (RLS), never the service role. The photos are uploaded by the browser.
 */
const shareDeps: core.ShareDepsFactory = async () => {
  const deps = await getDeps();
  return {
    quickCapture: (fd) => quickCapture(fd, { captureDeps: sessionCaptureDeps, rethrow: unstable_rethrow }),
    createItem: (input) => deps.items.createItem(input),
  };
};

export async function saveSharedText(text: string): Promise<ActionResult<{ message: string }>> {
  const user = await requireUser();
  const result = await core.saveSharedText(text, shareDeps, unstable_rethrow);
  invalidate(user.id, WRITES.capture);
  return result;
}

export async function createSharedIdea(text: string): Promise<ActionResult<{ itemId: string }>> {
  const user = await requireUser();
  const result = await core.createSharedIdea(text, shareDeps, unstable_rethrow);
  invalidate(user.id, WRITES.capture);
  return result;
}
