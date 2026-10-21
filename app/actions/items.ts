'use server';

import { revalidatePath } from 'next/cache';
import * as core from '@/lib/actions/items';
import type { MovePatch } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import type { Item, Person } from '@/lib/db/types';

/*
 * Thin wrappers: authenticate, build the real repos, delegate to lib/actions/items.ts,
 * refresh every screen. Calendar sync (Tarea 7) belongs in getDeps(), not here.
 */

function refresh() {
  revalidatePath('/', 'layout');
}

export async function addItem(formData: FormData): Promise<Item> {
  const item = await core.addItem(await getDeps(), formData);
  refresh();
  return item;
}

export async function toggleDone(id: string): Promise<Item> {
  const item = await core.toggleDone(await getDeps(), id);
  refresh();
  return item;
}

export async function moveItem(id: string, patch: MovePatch): Promise<Item> {
  const item = await core.moveItem(await getDeps(), id, patch);
  refresh();
  return item;
}

export async function deleteItem(id: string): Promise<void> {
  await core.deleteItem(await getDeps(), id);
  refresh();
}

export async function undoDelete(id: string): Promise<Item> {
  const item = await core.undoDelete(await getDeps(), id);
  refresh();
  return item;
}

export async function addPerson(formData: FormData): Promise<Person> {
  const person = await core.addPerson(await getDeps(), formData);
  refresh();
  return person;
}

export async function updatePerson(id: string, formData: FormData): Promise<Person> {
  const person = await core.updatePerson(await getDeps(), id, formData);
  refresh();
  return person;
}
