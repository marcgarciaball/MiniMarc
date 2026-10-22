import { describe, expect, it } from 'vitest';
import * as actions from '@/lib/actions/items';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { CalendarError, type CalendarGateway, type EventInput } from '@/lib/calendar/client';
import { syncTaskEvent, taskSyncHook } from '@/lib/calendar/taskSync';
import type { Item } from '@/lib/db/types';
import { madridToUtc } from '@/lib/time';

type Call =
  | { op: 'ensure'; name: string }
  | { op: 'create'; calendarId: string; e: EventInput }
  | { op: 'update'; calendarId: string; eventId: string; e: EventInput }
  | { op: 'delete'; calendarId: string; eventId: string };

/** Fake gateway: records calls; `fail` makes one operation throw. */
function fakeGateway(fail: Partial<Record<'create' | 'update' | 'delete', unknown>> = {}) {
  const calls: Call[] = [];
  const maybeFail = (op: 'create' | 'update' | 'delete') => {
    if (op in fail) throw fail[op];
  };
  const gw: CalendarGateway = {
    async ensureCalendar(name) {
      calls.push({ op: 'ensure', name });
      return 'tareas-id';
    },
    async createEvent(calendarId, e) {
      calls.push({ op: 'create', calendarId, e });
      maybeFail('create');
      return 'nuevo-ev';
    },
    async updateEvent(calendarId, eventId, e) {
      calls.push({ op: 'update', calendarId, eventId, e });
      maybeFail('update');
    },
    async setRequiredReminders() {},
    async deleteEvent(calendarId, eventId) {
      calls.push({ op: 'delete', calendarId, eventId });
      maybeFail('delete');
    },
    async listEvents() {
      return [];
    },
  };
  const writes = () => calls.filter((c) => c.op !== 'ensure');
  return { gw, calls, writes };
}

function task(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    type: 'tarea',
    title: 'Llamar al seguro',
    notes: null,
    area: 'personal',
    dueAt: '2026-10-22T07:30:00.000Z',
    hasTime: true,
    status: 'pendiente',
    personId: null,
    origin: 'web',
    needsReview: false,
    confidence: null,
    calendarEventId: null,
    syncError: null,
    sourceText: null,
    createdAt: '2026-10-21T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('syncTaskEvent', () => {
  it('una tarea con hora crea un evento de 30 minutos en el calendario "Tareas"', async () => {
    const { gw, calls } = fakeGateway();
    expect(await syncTaskEvent(task(), gw)).toEqual({ eventId: 'nuevo-ev', error: null });
    expect(calls[0]).toEqual({ op: 'ensure', name: 'Tareas' });
    expect(calls[1]).toMatchObject({
      op: 'create',
      calendarId: 'tareas-id',
      e: {
        title: 'Llamar al seguro',
        startsAt: new Date('2026-10-22T07:30:00.000Z'),
        endsAt: new Date('2026-10-22T08:00:00.000Z'),
      },
    });
  });

  it('la descripción dice que es un recordatorio y enlaza a la lista de su área', async () => {
    const { gw, writes } = fakeGateway();
    await syncTaskEvent(task({ area: 'trabajo' }), gw);
    const { e } = writes()[0] as Extract<Call, { op: 'create' }>;
    expect(e.description).toContain('Recordatorio de Agente Personal');
    expect(e.description).toContain('https://mini-marc-personal.vercel.app/tareas?area=trabajo');
  });

  it('el día del cambio de hora, las 10:00 de Madrid son las 09:00 UTC', async () => {
    const { gw, writes } = fakeGateway();
    const dueAt = madridToUtc('2026-10-25', '10:00').toISOString();
    await syncTaskEvent(task({ dueAt }), gw);
    const { e } = writes()[0] as Extract<Call, { op: 'create' }>;
    expect(e.startsAt.toISOString()).toBe('2026-10-25T09:00:00.000Z');
    expect(e.endsAt?.toISOString()).toBe('2026-10-25T09:30:00.000Z');
  });

  it('sin hasTime no crea nada', async () => {
    const { gw, writes } = fakeGateway();
    const r = await syncTaskEvent(task({ hasTime: false, dueAt: '2026-10-21T22:00:00.000Z' }), gw);
    expect(r).toEqual({ eventId: null, error: null });
    expect(writes()).toEqual([]);
  });

  it.each([
    ['sin fecha', { dueAt: null, hasTime: false }],
    ['de otro tipo', { type: 'idea' as const, dueAt: null, hasTime: false }],
    ['sin clasificar', { needsReview: true }],
  ])('una tarea %s no crea evento', async (_, overrides) => {
    const { gw, writes } = fakeGateway();
    expect(await syncTaskEvent(task(overrides), gw)).toEqual({ eventId: null, error: null });
    expect(writes()).toEqual([]);
  });

  it.each([
    ['completarla', { status: 'hecho' as const }],
    ['archivarla', { status: 'archivado' as const }],
    ['borrarla', { deletedAt: '2026-10-21T11:00:00.000Z' }],
    ['quitarle la hora', { hasTime: false, dueAt: '2026-10-21T22:00:00.000Z' }],
    ['cambiarle el tipo', { type: 'idea' as const, dueAt: null, hasTime: false }],
  ])('al %s elimina el evento', async (_, overrides) => {
    const { gw, writes } = fakeGateway();
    const r = await syncTaskEvent(task({ calendarEventId: 'ev1', ...overrides }), gw);
    expect(r).toEqual({ eventId: null, error: null });
    expect(writes()).toEqual([{ op: 'delete', calendarId: 'tareas-id', eventId: 'ev1' }]);
  });

  it('si el evento ya no existe al borrarlo, lo da por borrado', async () => {
    const { gw } = fakeGateway({ delete: new CalendarError('not_found', 'Gone') });
    const r = await syncTaskEvent(task({ calendarEventId: 'ev1', status: 'hecho' }), gw);
    expect(r).toEqual({ eventId: null, error: null });
  });

  it('con evento ya creado, mover la hora lo actualiza', async () => {
    const { gw, writes } = fakeGateway();
    const r = await syncTaskEvent(task({ calendarEventId: 'ev1', dueAt: '2026-10-23T16:00:00.000Z' }), gw);
    expect(r).toEqual({ eventId: 'ev1', error: null });
    expect(writes()).toEqual([
      expect.objectContaining({ op: 'update', calendarId: 'tareas-id', eventId: 'ev1' }),
    ]);
  });

  it('si el evento a actualizar se borró en Google, crea otro', async () => {
    const { gw, writes } = fakeGateway({ update: new CalendarError('not_found', 'Not Found') });
    const r = await syncTaskEvent(task({ calendarEventId: 'ev1' }), gw);
    expect(r).toEqual({ eventId: 'nuevo-ev', error: null });
    expect(writes().map((c) => c.op)).toEqual(['update', 'create']);
  });

  it('si el gateway lanza 401, devuelve calendar_auth sin lanzar', async () => {
    const { gw } = fakeGateway({ create: httpError(401) });
    await expect(syncTaskEvent(task(), gw)).resolves.toEqual({ eventId: null, error: 'calendar_auth' });
  });

  it('si el gateway lanza invalid_grant, devuelve calendar_auth', async () => {
    const { gw } = fakeGateway({ create: new CalendarError('auth', 'invalid_grant') });
    expect(await syncTaskEvent(task(), gw)).toEqual({ eventId: null, error: 'calendar_auth' });
  });

  it.each([500, 503])('si el gateway lanza %i, devuelve calendar_unavailable', async (status) => {
    const { gw } = fakeGateway({ create: httpError(status) });
    expect(await syncTaskEvent(task(), gw)).toEqual({ eventId: null, error: 'calendar_unavailable' });
  });

  it('un error de red devuelve calendar_unavailable', async () => {
    const { gw } = fakeGateway({ create: Object.assign(new Error('fetch failed'), { code: 'ENOTFOUND' }) });
    expect(await syncTaskEvent(task(), gw)).toEqual({ eventId: null, error: 'calendar_unavailable' });
  });

  it('si falla la actualización o el borrado, conserva el eventId para reintentar', async () => {
    const up = fakeGateway({ update: httpError(503) });
    expect(await syncTaskEvent(task({ calendarEventId: 'ev1' }), up.gw)).toEqual({
      eventId: 'ev1',
      error: 'calendar_unavailable',
    });
    const del = fakeGateway({ delete: httpError(401) });
    expect(await syncTaskEvent(task({ calendarEventId: 'ev1', status: 'hecho' }), del.gw)).toEqual({
      eventId: 'ev1',
      error: 'calendar_auth',
    });
  });

  it('si no se puede obtener el calendario, no lanza', async () => {
    const { gw } = fakeGateway();
    gw.ensureCalendar = async () => {
      throw httpError(401);
    };
    expect(await syncTaskEvent(task(), gw)).toEqual({ eventId: null, error: 'calendar_auth' });
  });
});

describe('taskSyncHook', () => {
  it('no carga el gateway para lo que no tiene ni quiere evento', async () => {
    let loads = 0;
    const sync = taskSyncHook(async () => {
      loads += 1;
      return fakeGateway().gw;
    });
    expect(await sync(task({ type: 'compra', dueAt: null, hasTime: false }))).toEqual({ eventId: null, error: null });
    expect(loads).toBe(0);
    expect(await sync(task())).toEqual({ eventId: 'nuevo-ev', error: null });
    expect(loads).toBe(1);
  });

  it('sin refresh token guardado devuelve calendar_auth sin lanzar', async () => {
    const sync = taskSyncHook(async () => {
      throw new CalendarError('auth', 'No refresh token stored');
    });
    expect(await sync(task({ calendarEventId: 'ev1' }))).toEqual({ eventId: 'ev1', error: 'calendar_auth' });
  });

  it('si falla la lectura de credenciales devuelve calendar_unavailable', async () => {
    const sync = taskSyncHook(async () => {
      throw new Error('fetch failed');
    });
    expect(await sync(task())).toEqual({ eventId: null, error: 'calendar_unavailable' });
  });
});

describe('con las acciones de elementos', () => {
  function setup(fail: Parameters<typeof fakeGateway>[0] = {}) {
    const backend = createMemoryBackend();
    const fake = fakeGateway(fail);
    const deps: actions.ActionDeps = {
      items: createItemsRepo(backend),
      people: createPeopleRepo(backend),
      sync: taskSyncHook(async () => fake.gw),
    };
    return { deps, ...fake };
  }
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const timed = { type: 'tarea', title: 'Dentista', dueDate: '2026-10-25', dueTime: '10:00' };
  const ops = (calls: Call[]) => calls.filter((c) => c.op !== 'ensure').map((c) => c.op);

  it('addItem guarda el id del evento; completar lo borra y desmarcar lo recrea', async () => {
    const { deps, calls } = setup();
    const item = await actions.addItem(deps, form(timed));
    expect(item.calendarEventId).toBe('nuevo-ev');
    const done = await actions.toggleDone(deps, item.id);
    expect(done.calendarEventId).toBeNull();
    const back = await actions.toggleDone(deps, item.id);
    expect(back.calendarEventId).toBe('nuevo-ev');
    expect(ops(calls)).toEqual(['create', 'delete', 'create']);
  });

  it('deleteItem borra el evento y undoDelete lo recrea', async () => {
    const { deps, calls } = setup();
    const item = await actions.addItem(deps, form(timed));
    await actions.deleteItem(deps, item.id);
    const back = await actions.undoDelete(deps, item.id);
    expect(back.calendarEventId).toBe('nuevo-ev');
    expect(ops(calls)).toEqual(['create', 'delete', 'create']);
  });

  it('moveItem: cambiar la hora actualiza; pasar a idea borra', async () => {
    const { deps, calls } = setup();
    const item = await actions.addItem(deps, form(timed));
    await actions.moveItem(deps, item.id, { dueAt: '2026-10-26T15:00:00.000Z', hasTime: true });
    const idea = await actions.moveItem(deps, item.id, { type: 'idea' });
    expect(idea.calendarEventId).toBeNull();
    expect(ops(calls)).toEqual(['create', 'update', 'delete']);
  });

  it('un fallo de Calendar guarda la tarea con syncError, y retrySync lo resuelve', async () => {
    const { deps, gw } = setup({ create: httpError(503) });
    const item = await actions.addItem(deps, form(timed));
    expect(item).toMatchObject({ calendarEventId: null, syncError: 'calendar_unavailable' });
    gw.createEvent = async () => 'ev-reintento';
    const fixed = await actions.retrySync(deps, item.id);
    expect(fixed).toMatchObject({ calendarEventId: 'ev-reintento', syncError: null });
  });
});
