import { beforeEach, describe, expect, it } from 'vitest';
import type { ActionDeps } from '@/lib/actions/items';
import * as people from '@/lib/actions/people';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { countdown, dateSummary, dateWithPerson } from '@/lib/people/format';

let deps: ActionDeps;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  const clock = () => new Date('2026-10-22T08:00:00Z');
  const backend = createMemoryBackend({ now: clock });
  deps = { items: createItemsRepo(backend, { now: clock }), people: createPeopleRepo(backend) };
});

describe('person date actions', () => {
  it('add, update and delete a date from the sheet form', async () => {
    const ainhoa = await deps.people.upsertPersonByName('Ainhoa');
    const d = await people.addPersonDate(deps, ainhoa.id, form({ label: ' Aniversario ', date: '2021-11-03', yearly: 'true', notes: ' cena ' }));
    expect(d).toMatchObject({ personId: ainhoa.id, label: 'Aniversario', date: '2021-11-03', yearly: true, notes: 'cena' });

    const up = await people.updatePersonDate(deps, d.id, form({ label: 'Boda', date: '2021-11-04', yearly: 'false', notes: '' }));
    expect(up).toMatchObject({ label: 'Boda', date: '2021-11-04', yearly: false, notes: null });

    await people.deletePersonDate(deps, d.id);
    expect(await deps.people.listDates(ainhoa.id)).toEqual([]);
  });

  it('rejects an empty label or a bad date with a message for Marc', async () => {
    const p = await deps.people.upsertPersonByName('Eva');
    await expect(people.addPersonDate(deps, p.id, form({ label: ' ', date: '2021-11-03' }))).rejects.toThrow('Escribe');
    await expect(people.addPersonDate(deps, p.id, form({ label: 'Santo', date: '' }))).rejects.toThrow('fecha');
    expect(people.dateFormError(form({ label: 'Santo', date: '2021-02-30' }))).toBe('La fecha no es válida.');
    expect(people.dateFormError(form({ label: 'Santo', date: '2021-02-28' }))).toBeNull();
  });

  it('addPerson keeps notes; updatePerson changes name and notes', async () => {
    const { addPerson, updatePerson } = await import('@/lib/actions/items');
    const p = await addPerson(deps, form({ name: 'Luis', notes: 'Le gusta el jazz' }));
    expect(p.notes).toBe('Le gusta el jazz');
    const up = await updatePerson(deps, p.id, form({ name: 'Luis M.', notes: '', birthday: '' }));
    expect(up).toMatchObject({ name: 'Luis M.', notes: null, birthday: null });
  });
});

describe('listPersonas (summary cards)', () => {
  it('sorts by the next date; shows label, countdown, years, first note line and gift/photo counts', async () => {
    const ainhoa = await deps.people.upsertPersonByName('Ainhoa');
    await deps.people.updatePerson(ainhoa.id, { notes: 'Le encanta la cerámica\nTalla M' });
    await deps.people.addDate({ personId: ainhoa.id, label: 'Aniversario', date: '2021-11-03' });
    const ana = await deps.people.upsertPersonByName('Ana');
    await deps.people.updatePerson(ana.id, { birthday: '1990-10-25' });
    await deps.people.upsertPersonByName('Zoe');
    await deps.people.upsertPersonByName('Bea');
    const g1 = await deps.items.createItem({ type: 'regalo', title: 'Taza', personId: ainhoa.id });
    await deps.items.createItem({ type: 'regalo', title: 'Libro', personId: ainhoa.id });
    await deps.items.createItem({ type: 'regalo', title: 'Hecho', personId: ainhoa.id, status: 'hecho' });

    const cards = await people.listPersonas(deps, '2026-10-22', async (ids) => {
      expect(ids).toHaveLength(2);
      return { [g1.id]: 3 };
    });

    expect(cards.map((c) => [c.person.name, c.next ? dateSummary(c.next) : null, c.notesLine, c.giftCount, c.photoCount])).toEqual([
      ['Ana', 'Cumpleaños · en 3 días · 36 años', null, 0, 0],
      ['Ainhoa', 'Aniversario · en 12 días · 5 años', 'Le encanta la cerámica', 2, 3],
      ['Bea', null, null, 0, 0],
      ['Zoe', null, null, 0, 0],
    ]);
  });

  it('a photo count failure leaves counts at 0', async () => {
    await deps.people.upsertPersonByName('Ana');
    const cards = await people.listPersonas(deps, '2026-10-22', async () => {
      throw new Error('no photos table');
    });
    expect(cards[0].photoCount).toBe(0);
  });
});

describe('date words', () => {
  it('countdown and summaries', () => {
    expect([countdown(0), countdown(1), countdown(12)]).toEqual(['hoy', 'mañana', 'en 12 días']);
    const p = { id: 'p', name: 'Ainhoa', birthday: null, notes: null };
    expect(dateSummary({ label: 'Santo', daysUntil: 0 })).toBe('Santo · hoy');
    expect(dateWithPerson({ kind: 'date', label: 'Aniversario', person: p, yearsSince: 5 })).toBe('aniversario con Ainhoa (5 años)');
  });
});

describe('formatPersonDate', () => {
  it('shows the year only when it is known', async () => {
    const { formatPersonDate } = await import('@/lib/people/format');
    expect(formatPersonDate('2021-11-03')).toBe('3 de noviembre de 2021');
    expect(formatPersonDate('1604-02-14')).toBe('14 de febrero');
  });
});

describe('deletePerson: se va con todo lo suyo', () => {
  async function withEverything() {
    const mama = await deps.people.upsertPersonByName('Mama');
    await deps.people.updatePerson(mama.id, { birthday: '1962-01-15' });
    await people.addPersonDate(deps, mama.id, form({ label: 'Santo', date: '2026-07-26', yearly: 'true' }));
    const gift = await deps.items.createItem({ type: 'regalo', title: 'Guantes de piel', personId: mama.id });
    const other = await deps.items.createItem({ type: 'compra', title: 'Pilas AA' });
    return { mama, gift, other };
  }

  it('borra la persona y sus fechas', async () => {
    const { mama } = await withEverything();
    await people.deletePerson(deps, mama.id);
    expect(await deps.people.getPerson(mama.id)).toBeNull();
    expect(await deps.people.listPeople()).toEqual([]);
    expect(await deps.people.listDates(mama.id)).toEqual([]);
  });

  it('sus ideas de regalo van a la papelera, no se evaporan', async () => {
    const { mama, gift } = await withEverything();
    await people.deletePerson(deps, mama.id);
    expect(await deps.items.listItems({ type: 'regalo' })).toEqual([]);
    expect((await deps.items.listDeleted(30)).map((i) => i.id)).toEqual([gift.id]);
  });

  it('no toca lo que no era suyo', async () => {
    const { mama, other } = await withEverything();
    await people.deletePerson(deps, mama.id);
    expect((await deps.items.listItems({ type: 'compra' })).map((i) => i.id)).toEqual([other.id]);
  });

  it('una persona que no existe lanza, y no borra nada', async () => {
    const { other } = await withEverything();
    await expect(people.deletePerson(deps, 'no-existe')).rejects.toThrow();
    expect(await deps.people.listPeople()).toHaveLength(1);
    expect((await deps.items.listItems({ type: 'compra' })).map((i) => i.id)).toEqual([other.id]);
  });
});
