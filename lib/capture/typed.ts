/**
 * A capture with its type already chosen (a CaptureBar chip, or `type` in POST /api/capture):
 * saved straight away, never through the AI. Tarea syncs to Calendar like any timed task.
 */
import { parseNewItem, saveNewItem, type ActionDeps } from '@/lib/actions/items';
import { UserError } from '@/lib/actions/result';
import { taskSyncHook } from '@/lib/calendar/taskSync';
import type { Item, ItemType, Origin } from '@/lib/db/types';
import { textFields, type CaptureDeps } from './pipeline';

export type TypedFields = {
  /** 'trabajo' or anything else = Personal; only Tarea uses it. */
  area?: string;
  dueDate?: string;
  dueTime?: string;
  /** Regalo: an existing person, or `personName` to create (or reuse) one. */
  personId?: string;
  personName?: string;
};

export async function saveTypedItem(
  type: ItemType,
  text: string,
  fields: TypedFields,
  deps: CaptureDeps,
  origin: Origin,
): Promise<Item> {
  const { title, notes } = textFields(text.trim());
  const form = new FormData();
  form.set('type', type);
  form.set('title', title);
  if (type === 'tarea') {
    form.set('area', fields.area === 'trabajo' ? 'trabajo' : 'personal');
    const dueDate = (fields.dueDate ?? '').trim();
    const dueTime = (fields.dueTime ?? '').trim();
    if (dueTime && !dueDate) throw new UserError('Indica la fecha.');
    form.set('dueDate', dueDate);
    form.set('dueTime', dueTime);
  }
  const actionDeps: ActionDeps = { items: deps.items, people: deps.people, sync: taskSyncHook(deps.calendar) };
  if (type === 'regalo') {
    const newName = (fields.personName ?? '').trim();
    const personId = newName ? (await deps.people.upsertPersonByName(newName)).id : (fields.personId ?? '').trim();
    form.set('personId', personId);
  }
  return saveNewItem(actionDeps, { ...parseNewItem(form), notes, sourceText: text, origin });
}
