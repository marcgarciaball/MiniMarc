'use server';

import { unstable_rethrow } from 'next/navigation';
import { attempt, type ActionResult } from '@/lib/actions/result';
import { invalidate } from '@/lib/cache/server';
import { WRITES } from '@/lib/cache/tags';
import * as core from '@/lib/photos/actions';
import { sessionPhotoDeps } from '@/lib/photos/server';

/*
 * The browser uploads the image itself to the private `photos` bucket with Marc's session
 * (never the service role); these record or remove it and invalidate the cached lists.
 */

async function run(fn: (deps: core.PhotoActionDeps) => Promise<unknown>, fallback: string): Promise<ActionResult<null>> {
  let userId: string | null = null;
  const result = await attempt(
    async () => {
      const deps = await sessionPhotoDeps();
      userId = deps.userId;
      await fn(deps);
      return null;
    },
    fallback,
    unstable_rethrow,
  );
  if (userId) invalidate(userId, WRITES.photo);
  return result;
}

export async function addPhoto(itemId: string, path: string, width: number | null, height: number | null): Promise<ActionResult<null>> {
  return run((deps) => core.addPhoto(deps, { itemId, path, width, height }), 'No se ha podido guardar la foto.');
}

export async function deletePhoto(id: string): Promise<ActionResult<null>> {
  return run((deps) => core.deletePhoto(deps, id), 'No se ha podido eliminar la foto.');
}
