import { describe, expect, it } from 'vitest';
import { applyListOps, draftItem, fitsNewList, isDraft, staysInList } from '@/lib/actions/optimistic';
import type { Item } from '@/lib/db/types';

const now = new Date('2026-10-22T08:00:00Z');

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const item = (id: string, over: Partial<Item> = {}): Item => ({ ...draftItem(form({ type: 'tarea', title: id }), 0, now)!, id, ...over });

describe('optimistic list updates', () => {
  const a = item('a');
  const b = item('b');

  it('removes, patches and adds in order', () => {
    const draft = draftItem(form({ type: 'tarea', title: 'Nueva' }), 1, now)!;
    const out = applyListOps([a, b], [
      { kind: 'remove', id: 'a' },
      { kind: 'patch', id: 'b', patch: { title: 'B2' } },
      { kind: 'add', item: draft },
    ]);
    expect(out.map((i) => [i.id, i.title])).toEqual([
      ['b', 'B2'],
      [draft.id, 'Nueva'],
    ]);
    // Other sections skip the adds.
    expect(applyListOps([a], [{ kind: 'add', item: draft }], false)).toEqual([a]);
  });

  it('a draft comes from the add form and is marked as not saved', () => {
    const d = draftItem(form({ type: 'tarea', title: ' Llamar ', area: 'trabajo', dueDate: '2026-10-23', dueTime: '09:00' }), 7, now)!;
    expect(d).toMatchObject({ title: 'Llamar', type: 'tarea', area: 'trabajo', status: 'pendiente', hasTime: true });
    expect(isDraft(d)).toBe(true);
    expect(isDraft(a)).toBe(false);
    expect(draftItem(form({ type: 'tarea', title: '  ' }), 8, now)).toBeNull();
  });

  it('a draft shows only in a list it belongs to', () => {
    const tarea = draftItem(form({ type: 'tarea', title: 'X', area: 'trabajo' }), 1, now)!;
    expect(fitsNewList(tarea, { type: 'tarea', area: 'trabajo' })).toBe(true);
    expect(fitsNewList(tarea, { type: 'tarea', area: 'personal' })).toBe(false);
    const regalo = draftItem(form({ type: 'regalo', title: 'Libro', personId: 'p1' }), 2, now)!;
    expect(fitsNewList(regalo, { type: 'regalo', personId: 'p1' })).toBe(true);
    expect(fitsNewList(regalo, { type: 'regalo' })).toBe(false);
  });

  it('an edit that moves the item elsewhere removes the row', () => {
    expect(staysInList(a, { title: 'Otro' })).toBe(true);
    expect(staysInList(a, { type: 'idea' })).toBe(false);
    expect(staysInList(a, { area: 'trabajo' })).toBe(false);
    expect(staysInList(a, { status: 'archivado' })).toBe(false);
    expect(staysInList(a, { title: 'Otro' }, { reviewMode: true })).toBe(false);
    const gift = item('g', { type: 'regalo', personId: 'p1' });
    expect(staysInList(gift, { personId: 'p2' }, { personId: 'p1' })).toBe(false);
  });
});
