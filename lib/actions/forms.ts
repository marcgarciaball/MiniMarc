/**
 * Client-side reading of the add/edit sheets. Pure, so the rules are tested without a DOM.
 * Validation errors come back as results: the sheet shows them and keeps the typed text.
 */
import type { Area, ItemType } from '@/lib/db/types';
import { toDue } from '@/lib/time';
import type { MovePatch } from './items';
import { fail, ok, type ActionResult } from './result';

const text = (fd: FormData, name: string) => String(fd.get(name) ?? '').trim();

export function newItemFormError(fd: FormData): string | null {
  return text(fd, 'title') ? null : 'Escribe un título.';
}

export function personFormError(fd: FormData): string | null {
  return text(fd, 'name') ? null : 'Escribe un nombre.';
}

/** The edit sheet's fields → the patch for moveItem. `type`/`area` come from the sheet's controls. */
export function editPatchFromForm(
  fd: FormData,
  opts: { type: ItemType; area: Area; reviewMode?: boolean },
): ActionResult<MovePatch> {
  const titleError = newItemFormError(fd);
  if (titleError) return fail(titleError);
  const patch: MovePatch = { title: text(fd, 'title'), notes: text(fd, 'notes') || null, type: opts.type };
  if (opts.type === 'tarea') {
    patch.area = opts.area;
    try {
      Object.assign(patch, toDue(text(fd, 'dueDate'), text(fd, 'dueTime')));
    } catch {
      return fail('La fecha no es válida.');
    }
  }
  patch.personId = opts.type === 'regalo' ? text(fd, 'personId') || null : null;
  if (opts.reviewMode) patch.needsReview = false;
  return ok(patch);
}
