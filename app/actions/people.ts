'use server';

import { createItemActions } from '@/lib/actions/itemActions';
import type { ActionResult } from '@/lib/actions/result';
import { runAction } from '@/lib/actions/server';
import type { PersonDate } from '@/lib/db/types';

/* Thin wrappers over lib/actions/itemActions.ts, like app/actions/items.ts: never throw at the UI. */
const actions = createItemActions(runAction);

export async function addPersonDate(personId: string, formData: FormData): Promise<ActionResult<PersonDate>> {
  return actions.addPersonDate(personId, formData);
}

export async function updatePersonDate(id: string, formData: FormData): Promise<ActionResult<PersonDate>> {
  return actions.updatePersonDate(id, formData);
}

export async function deletePersonDate(id: string): Promise<ActionResult<void>> {
  return actions.deletePersonDate(id);
}
