import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createItemsRepo, type ItemsRepo } from '@/lib/db/items';
import { createPeopleRepo, type PeopleRepo } from '@/lib/db/people';

const DAY = 24 * 60 * 60 * 1000;

let now: Date;
let items: ItemsRepo;
let people: PeopleRepo;

beforeEach(() => {
  now = new Date('2026-10-21T10:00:00Z');
  const clock = () => now;
  const backend = createMemoryBackend({ now: clock });
  items = createItemsRepo(backend, { now: clock });
  people = createPeopleRepo(backend);
});

describe('items repo', () => {
  it('crea un regalo enlazado a una persona con valores por defecto', async () => {
    const ana = await people.upsertPersonByName('Ana');
    const item = await items.createItem({ type: 'regalo', title: 'Libro de cocina', personId: ana.id });
    expect(item.id).toBeTruthy();
    expect(item.type).toBe('regalo');
    expect(item.personId).toBe(ana.id);
    expect(item.status).toBe('pendiente');
    expect(item.origin).toBe('web');
    expect(item.needsReview).toBe(false);
    expect(item.hasTime).toBe(false);
    expect(item.deletedAt).toBeNull();
    expect(item.createdAt).toBe(now.toISOString());
    const listed = await items.listItems({ type: 'regalo' });
    expect(listed.map((i) => i.id)).toEqual([item.id]);
  });

  it('listItems({area:"trabajo"}) no devuelve tareas personales', async () => {
    await items.createItem({ type: 'tarea', title: 'Informe', area: 'trabajo' });
    await items.createItem({ type: 'tarea', title: 'Dentista', area: 'personal' });
    const work = await items.listItems({ area: 'trabajo' });
    expect(work.map((i) => i.title)).toEqual(['Informe']);
  });

  it('filtra por status y needsReview', async () => {
    const a = await items.createItem({ type: 'idea', title: 'A', needsReview: true });
    await items.createItem({ type: 'idea', title: 'B' });
    await items.updateItem(a.id, { status: 'hecho' });
    expect((await items.listItems({ needsReview: true })).map((i) => i.title)).toEqual(['A']);
    expect((await items.listItems({ status: 'hecho' })).map((i) => i.title)).toEqual(['A']);
    expect((await items.listItems({ status: 'pendiente' })).map((i) => i.title)).toEqual(['B']);
  });

  it('updateItem aplica el parche en camelCase', async () => {
    const it1 = await items.createItem({ type: 'tarea', title: 'X' });
    const up = await items.updateItem(it1.id, {
      dueAt: '2026-10-22T07:00:00.000Z',
      hasTime: true,
      calendarEventId: 'ev1',
      syncError: null,
    });
    expect(up.dueAt).toBe('2026-10-22T07:00:00.000Z');
    expect(up.hasTime).toBe(true);
    expect(up.calendarEventId).toBe('ev1');
    expect(up.title).toBe('X');
  });

  it('softDeleteItem lo excluye de listItems y restoreItem lo recupera', async () => {
    const it1 = await items.createItem({ type: 'compra', title: 'Leche' });
    await items.softDeleteItem(it1.id);
    expect(await items.listItems({})).toEqual([]);
    await items.restoreItem(it1.id);
    const back = await items.listItems({});
    expect(back.map((i) => i.id)).toEqual([it1.id]);
    expect(back[0].deletedAt).toBeNull();
  });

  it('purgeDeletedOlderThan(30) solo borra los eliminados hace más de 30 días', async () => {
    const old = await items.createItem({ type: 'idea', title: 'vieja' });
    const recent = await items.createItem({ type: 'idea', title: 'reciente' });
    const alive = await items.createItem({ type: 'idea', title: 'viva' });
    const start = now;
    now = new Date(start.getTime() - 31 * DAY);
    await items.softDeleteItem(old.id);
    now = new Date(start.getTime() - 29 * DAY);
    await items.softDeleteItem(recent.id);
    now = start;

    const n = await items.purgeDeletedOlderThan(30);
    expect(n).toBe(1);
    await items.restoreItem(recent.id);
    await expect(items.restoreItem(old.id)).rejects.toThrow();
    const ids = (await items.listItems({})).map((i) => i.id).sort();
    expect(ids).toEqual([recent.id, alive.id].sort());
  });
});

describe('people repo', () => {
  it('upsertPersonByName no duplica (insensible a mayúsculas y espacios)', async () => {
    const a = await people.upsertPersonByName('Ana');
    const b = await people.upsertPersonByName('  ana ');
    expect(b.id).toBe(a.id);
    expect(await people.listPeople()).toHaveLength(1);
  });

  it('upcomingBirthdays incluye 14 días hacia delante y cruza fin de año', async () => {
    const backend = createMemoryBackend();
    const repo = createPeopleRepo(backend);
    await backend.insert('people', { name: 'Hoy', birthday: '1990-12-25' });
    await backend.insert('people', { name: 'FinDeAño', birthday: '1985-12-31' });
    await backend.insert('people', { name: 'Enero', birthday: '2000-01-08' });
    await backend.insert('people', { name: 'Fuera', birthday: '2000-01-09' });
    await backend.insert('people', { name: 'Ayer', birthday: '2000-12-24' });
    await backend.insert('people', { name: 'SinFecha', birthday: null });
    const res = await repo.upcomingBirthdays('2026-12-25', 14);
    expect(res.map((p) => p.name)).toEqual(['Hoy', 'FinDeAño', 'Enero']);
  });
});

describe('people repo · updatePerson', () => {
  it('cambia nombre, cumpleaños y notas, y lanza si no existe', async () => {
    const ana = await people.upsertPersonByName('Ana');
    const up = await people.updatePerson(ana.id, { birthday: '1990-11-02', notes: 'Le gusta leer' });
    expect(up).toEqual({ id: ana.id, name: 'Ana', birthday: '1990-11-02', notes: 'Le gusta leer' });
    const cleared = await people.updatePerson(ana.id, { name: ' Ana María ', birthday: null });
    expect(cleared.name).toBe('Ana María');
    expect(cleared.birthday).toBeNull();
    await expect(people.updatePerson('nope', { name: 'X' })).rejects.toThrow();
    await expect(people.updatePerson(ana.id, { name: '  ' })).rejects.toThrow();
  });
});
