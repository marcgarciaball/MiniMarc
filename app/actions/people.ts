'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import * as core from '@/lib/actions/people';
import { attempt, type ActionResult } from '@/lib/actions/result';
import { getDeps } from '@/lib/actions/server';
import type { PersonDate } from '@/lib/db/types';

/* Thin wrappers over lib/actions/people.ts, like app/actions/items.ts: never throw at the UI. */

const SAVE_FAILED = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

async function run<T>(fn: (deps: Awaited<ReturnType<typeof getDeps>>) => Promise<T>) {
  const result = await attempt(async () => fn(await getDeps()), SAVE_FAILED, unstable_rethrow);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function addPersonDate(personId: string, formData: FormData): Promise<ActionResult<PersonDate>> {
  return run((deps) => core.addPersonDate(deps, personId, formData));
}

export async function updatePersonDate(id: string, formData: FormData): Promise<ActionResult<PersonDate>> {
  return run((deps) => core.updatePersonDate(deps, id, formData));
}

export async function deletePersonDate(id: string): Promise<ActionResult<void>> {
  return run((deps) => core.deletePersonDate(deps, id));
}
