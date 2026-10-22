'use server';

import type { MovePatch } from '@/lib/actions/items';
import { createItemActions } from '@/lib/actions/itemActions';
import type { ActionResult } from '@/lib/actions/result';
import { runAction } from '@/lib/actions/server';
import type { Item, Person } from '@/lib/db/types';

/*
 * Thin wrappers over lib/actions/itemActions.ts: authenticate, build the real repos, delegate,
 * then invalidate the cached data the write may change (lib/actions/run.ts). They return an
 * ActionResult and never throw at the UI (redirects still pass through).
 */
const actions = createItemActions(runAction);

export async function addItem(formData: FormData): Promise<ActionResult<Item>> {
  return actions.addItem(formData);
}

export async function toggleDone(id: string): Promise<ActionResult<Item>> {
  return actions.toggleDone(id);
}

export async function moveItem(id: string, patch: MovePatch): Promise<ActionResult<Item>> {
  return actions.moveItem(id, patch);
}

export async function deleteItem(id: string): Promise<ActionResult<void>> {
  return actions.deleteItem(id);
}

export async function undoDelete(id: string): Promise<ActionResult<Item>> {
  return actions.undoDelete(id);
}

export async function retrySync(id: string): Promise<ActionResult<Item>> {
  return actions.retrySync(id);
}

export async function addPerson(formData: FormData): Promise<ActionResult<Person>> {
  return actions.addPerson(formData);
}

export async function updatePerson(id: string, formData: FormData): Promise<ActionResult<Person>> {
  return actions.updatePerson(id, formData);
}
