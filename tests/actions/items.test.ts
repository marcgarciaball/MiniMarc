import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createItemsRepo } from '@/lib/db/items';
import { createPeopleRepo } from '@/lib/db/people';
import * as actions from '@/lib/actions/items';
import type { ActionDeps } from '@/lib/actions/items';

let deps: ActionDeps;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  const clock = () => new Date('2026-10-21T10:00:00Z');
  const backend = createMemoryBackend({ now: clock });
  deps = { items: createItemsRepo(backend, { now: clock }), people: createPeopleRepo(backend) };
});

describe('addItem', () => {
  it.each(['', '   \n\t'])('rechaza un título vacío (%j) y no guarda nada', async (title) => {
    await expect(actions.addItem(deps, form({ type: 'tarea', title }))).rejects.toThrow(/título/i);
    expect(await deps.items.listItems()).toEqual([]);
  });

  it('crea una tarea Personal por defecto, con fecha y hora de Madrid en UTC', async () => {
    const item = await actions.addItem(
      deps,
      form({ type: 'tarea', title: '  Llamar al seguro ', dueDate: '2026-10-22', dueTime: '09:30' }),
    );
    expect(item.title).toBe('Llamar al seguro');
    expect(item.area).toBe('personal');
    expect(item.dueAt).toBe('2026-10-22T07:30:00.000Z');
    expect(item.hasTime).toBe(true);
    expect(item.origin).toBe('web');
  });

  it('rechaza un tipo o un área desconocidos', async () => {
    await expect(actions.addItem(deps, form({ type: 'cita', title: 'X' }))).rejects.toThrow();
    await expect(actions.addItem(deps, form({ type: 'tarea', title: 'X', area: 'casa' }))).rejects.toThrow();
  });
});

describe('deleteItem / undoDelete', () => {
  it('deleteItem seguido de undoDelete restaura el elemento', async () => {
    const item = await actions.addItem(deps, form({ type: 'compra', title: 'Leche' }));
    await actions.deleteItem(deps, item.id);
    expect(await actions.listByType(deps, 'compra')).toEqual([]);
    await actions.undoDelete(deps, item.id);
    const back = await actions.listByType(deps, 'compra');
    expect(back.map((i) => i.id)).toEqual([item.id]);
    expect(back[0].deletedAt).toBeNull();
  });
});

describe('/tareas', () => {
  it('la lista Personal y la de Trabajo son vistas separadas y no comparten elementos', async () => {
    await actions.addItem(deps, form({ type: 'tarea', title: 'Dentista', area: 'personal' }));
    await actions.addItem(deps, form({ type: 'tarea', title: 'Informe', area: 'trabajo' }));
    await actions.addItem(deps, form({ type: 'tarea', title: 'Reunión', area: 'trabajo' }));
    await actions.addItem(deps, form({ type: 'compra', title: 'Leche' }));

    const personal = await actions.listTareas(deps, 'personal');
    const trabajo = await actions.listTareas(deps, 'trabajo');
    expect(personal.map((i) => i.title)).toEqual(['Dentista']);
    expect(trabajo.map((i) => i.title).sort()).toEqual(['Informe', 'Reunión']);
    const shared = personal.filter((p) => trabajo.some((t) => t.id === p.id));
    expect(shared).toEqual([]);
    expect(trabajo.every((i) => i.area === 'trabajo')).toBe(true);
  });

  it('no muestra las tareas sin clasificar ni las hechas', async () => {
    const a = await actions.addItem(deps, form({ type: 'tarea', title: 'Hecha' }));
    await deps.items.createItem({ type: 'tarea', title: 'Dudosa', area: 'personal', needsReview: true });
    await actions.toggleDone(deps, a.id);
    expect(await actions.listTareas(deps, 'personal')).toEqual([]);
  });
});

describe('toggleDone', () => {
  it('alterna entre pendiente y hecho', async () => {
    const item = await actions.addItem(deps, form({ type: 'tarea', title: 'X' }));
    expect((await actions.toggleDone(deps, item.id)).status).toBe('hecho');
    expect((await actions.toggleDone(deps, item.id)).status).toBe('pendiente');
  });

  it('lanza si el elemento no existe', async () => {
    await expect(actions.toggleDone(deps, 'nope')).rejects.toThrow();
  });
});

describe('moveItem', () => {
  it('saca un elemento de Sin clasificar a otra lista', async () => {
    const raw = await deps.items.createItem({ type: 'idea', title: 'Comprar pilas', needsReview: true });
    expect((await actions.listSinClasificar(deps)).map((i) => i.id)).toEqual([raw.id]);
    const moved = await actions.moveItem(deps, raw.id, { type: 'compra', needsReview: false });
    expect(moved.type).toBe('compra');
    expect(await actions.listSinClasificar(deps)).toEqual([]);
    expect((await actions.listByType(deps, 'compra')).map((i) => i.id)).toEqual([raw.id]);
  });

  it('una tarea movida sin área queda en Personal', async () => {
    const idea = await actions.addItem(deps, form({ type: 'idea', title: 'Viaje' }));
    const moved = await actions.moveItem(deps, idea.id, { type: 'tarea' });
    expect(moved.area).toBe('personal');
  });

  it('rechaza campos que no se pueden mover y títulos vacíos', async () => {
    const item = await actions.addItem(deps, form({ type: 'idea', title: 'Viaje' }));
    await expect(actions.moveItem(deps, item.id, { title: '  ' })).rejects.toThrow(/título/i);
    await expect(
      actions.moveItem(deps, item.id, { calendarEventId: 'x' } as never),
    ).rejects.toThrow();
  });
});

describe('sync hook (Tarea 7)', () => {
  it('se llama tras cada escritura y guarda calendarEventId y syncError', async () => {
    const sync = vi.fn(async () => ({ calendarEventId: 'ev1', syncError: null }));
    const withSync = { ...deps, sync };
    const item = await actions.addItem(withSync, form({ type: 'tarea', title: 'Cita', dueDate: '2026-10-22', dueTime: '10:00' }));
    expect(item.calendarEventId).toBe('ev1');
    await actions.toggleDone(withSync, item.id);
    await actions.deleteItem(withSync, item.id);
    expect(sync).toHaveBeenCalledTimes(3);
    const deleted = sync.mock.calls[2] as unknown as [{ deletedAt: string | null }];
    expect(deleted[0].deletedAt).not.toBeNull();
  });
});

describe('regalos', () => {
  it('agrupa los regalos por persona y da de alta personas con cumpleaños', async () => {
    const ana = await actions.addPerson(deps, form({ name: 'Ana', birthday: '1990-11-02' }));
    expect(ana.birthday).toBe('1990-11-02');
    await actions.addItem(deps, form({ type: 'regalo', title: 'Libro', personId: ana.id }));
    await actions.addItem(deps, form({ type: 'regalo', title: 'Sin dueño' }));
    const groups = await actions.listRegalos(deps);
    expect(groups.people.map((g) => [g.person.name, g.items.map((i) => i.title)])).toEqual([['Ana', ['Libro']]]);
    expect(groups.unassigned.map((i) => i.title)).toEqual(['Sin dueño']);
  });

  it('cambia el cumpleaños de una persona y rechaza fechas inválidas', async () => {
    const ana = await actions.addPerson(deps, form({ name: 'Ana' }));
    const up = await actions.updatePerson(deps, ana.id, form({ name: 'Ana', birthday: '1990-11-02' }));
    expect(up.birthday).toBe('1990-11-02');
    await expect(actions.updatePerson(deps, ana.id, form({ name: 'Ana', birthday: '1990-13-40' }))).rejects.toThrow();
  });
});
