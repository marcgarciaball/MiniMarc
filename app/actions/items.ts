'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import * as core from '@/lib/actions/items';
import type { MovePatch } from '@/lib/actions/items';
import { attempt, type ActionResult } from '@/lib/actions/result';
import { getDeps } from '@/lib/actions/server';
import type { Item, Person } from '@/lib/db/types';

/*
 * Thin wrappers: authenticate, build the real repos, delegate to lib/actions/items.ts,
 * refresh every screen. They return an ActionResult and never throw at the UI (redirects
 * still pass through). Calendar sync (Tarea 7) belongs in getDeps(), not here.
 */

const SAVE_FAILED = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
const ADD_FAILED = 'No se ha podido añadir. Revisa la conexión e inténtalo de nuevo.';

async function run<T>(fn: (deps: Awaited<ReturnType<typeof getDeps>>) => Promise<T>, fallback = SAVE_FAILED) {
  const result = await attempt(async () => fn(await getDeps()), fallback, unstable_rethrow);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function addItem(formData: FormData): Promise<ActionResult<Item>> {
  return run((deps) => core.addItem(deps, formData), ADD_FAILED);
}

export async function toggleDone(id: string): Promise<ActionResult<Item>> {
  return run((deps) => core.toggleDone(deps, id));
}

export async function moveItem(id: string, patch: MovePatch): Promise<ActionResult<Item>> {
  return run((deps) => core.moveItem(deps, id, patch));
}

export async function deleteItem(id: string): Promise<ActionResult<void>> {
  return run((deps) => core.deleteItem(deps, id));
}

export async function undoDelete(id: string): Promise<ActionResult<Item>> {
  return run((deps) => core.undoDelete(deps, id));
}

export async function addPerson(formData: FormData): Promise<ActionResult<Person>> {
  return run((deps) => core.addPerson(deps, formData), ADD_FAILED);
}

export async function updatePerson(id: string, formData: FormData): Promise<ActionResult<Person>> {
  return run((deps) => core.updatePerson(deps, id, formData));
}
