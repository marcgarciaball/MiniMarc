'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { attempt, type ActionResult } from '@/lib/actions/result';
import * as core from '@/lib/photos/actions';
import { sessionPhotoDeps } from '@/lib/photos/server';

/*
 * The browser uploads the image itself to the private `photos` bucket with Marc's session
 * (never the service role); these record or remove it and refresh every screen.
 */

async function run(fn: (deps: core.PhotoActionDeps) => Promise<unknown>, fallback: string): Promise<ActionResult<null>> {
  const result = await attempt(
    async () => {
      await fn(await sessionPhotoDeps());
      return null;
    },
    fallback,
    unstable_rethrow,
  );
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function addPhoto(itemId: string, path: string, width: number | null, height: number | null): Promise<ActionResult<null>> {
  return run((deps) => core.addPhoto(deps, { itemId, path, width, height }), 'No se ha podido guardar la foto.');
}

export async function deletePhoto(id: string): Promise<ActionResult<null>> {
  return run((deps) => core.deletePhoto(deps, id), 'No se ha podido eliminar la foto.');
}
