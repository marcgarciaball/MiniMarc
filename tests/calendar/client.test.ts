import { describe, expect, it } from 'vitest';
import {
  CalendarError,
  calendarErrorKind,
  createCalendarClient,
  hasRequiredReminders,
  withCachedCalendar,
  type CalendarApi,
  type CalendarGateway,
} from '@/lib/calendar/client';
import { madridToUtc } from '@/lib/time';

type Call = { method: string; params: Record<string, unknown> };

/** A stand-in for google.calendar('v3'): records requests, answers from `responses`. */
function fakeApi(responses: Partial<Record<string, (params: Record<string, unknown>) => unknown>> = {}) {
  const calls: Call[] = [];
  const method = (name: string) => async (params: Record<string, unknown>) => {
    calls.push({ method: name, params });
    const r = responses[name];
    return { data: r ? r(params) : {} };
  };
  const api = {
    events: {
      insert: method('events.insert'),
      patch: method('events.patch'),
      delete: method('events.delete'),
      list: method('events.list'),
    },
    calendarList: { list: method('calendarList.list') },
    calendars: { insert: method('calendars.insert') },
  } as unknown as CalendarApi;
  return { api, calls };
}

const httpError = (status: number, message = `HTTP ${status}`) => Object.assign(new Error(message), { status });

describe('createCalendarClient: createEvent', () => {
  it('envía avisos popup a 180 y 60 minutos con useDefault false, en hora de Madrid', async () => {
    const { api, calls } = fakeApi({ 'events.insert': () => ({ id: 'ev1' }) });
    const gw = createCalendarClient(null, { api });
    const startsAt = madridToUtc('2026-10-25', '10:00');
    const id = await gw.createEvent('cal-tareas', {
      title: 'Llamar al seguro',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      description: 'Recordatorio',
    });
    expect(id).toBe('ev1');
    expect(calls).toHaveLength(1);
    const { params } = calls[0];
    expect(params.calendarId).toBe('cal-tareas');
    expect(params.requestBody).toEqual({
      summary: 'Llamar al seguro',
      description: 'Recordatorio',
      start: { dateTime: '2026-10-25T09:00:00.000Z', timeZone: 'Europe/Madrid' },
      end: { dateTime: '2026-10-25T09:30:00.000Z', timeZone: 'Europe/Madrid' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 180 },
          { method: 'popup', minutes: 60 },
        ],
      },
    });
  });

  it('sin endsAt el evento dura 30 minutos', async () => {
    const { api, calls } = fakeApi({ 'events.insert': () => ({ id: 'ev1' }) });
    await createCalendarClient(null, { api }).createEvent('c', {
      title: 'X',
      startsAt: new Date('2026-11-02T08:00:00Z'),
    });
    const body = calls[0].params.requestBody as { end: { dateTime: string } };
    expect(body.end.dateTime).toBe('2026-11-02T08:30:00.000Z');
  });
});

describe('createCalendarClient: updateEvent / deleteEvent', () => {
  it('updateEvent parchea título, horas y avisos del evento', async () => {
    const { api, calls } = fakeApi();
    await createCalendarClient(null, { api }).updateEvent('c', 'ev1', {
      title: 'Nuevo',
      startsAt: new Date('2026-11-02T08:00:00Z'),
    });
    expect(calls[0].method).toBe('events.patch');
    expect(calls[0].params).toMatchObject({
      calendarId: 'c',
      eventId: 'ev1',
      requestBody: {
        summary: 'Nuevo',
        start: { dateTime: '2026-11-02T08:00:00.000Z', timeZone: 'Europe/Madrid' },
        reminders: { useDefault: false },
      },
    });
  });

  it('deleteEvent borra en el calendario indicado', async () => {
    const { api, calls } = fakeApi();
    await createCalendarClient(null, { api }).deleteEvent('c', 'ev1');
    expect(calls).toEqual([{ method: 'events.delete', params: { calendarId: 'c', eventId: 'ev1' } }]);
  });
});

describe('createCalendarClient: errores', () => {
  const failing = (err: unknown) => {
    const api = {
      events: {
        insert: async () => {
          throw err;
        },
      },
    } as unknown as CalendarApi;
    return createCalendarClient(null, { api });
  };
  const create = (gw: CalendarGateway) => gw.createEvent('c', { title: 'X', startsAt: new Date() });

  it.each([
    [httpError(401), 'auth'],
    [httpError(403), 'auth'],
    [Object.assign(new Error('invalid_grant'), { response: { status: 400, data: { error: 'invalid_grant' } } }), 'auth'],
    [httpError(404), 'not_found'],
    [httpError(410), 'not_found'],
    [httpError(500), 'unavailable'],
    [httpError(503), 'unavailable'],
    [httpError(429), 'unavailable'],
    [Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }), 'unavailable'],
  ])('traduce %s a CalendarError(%s)', async (err, kind) => {
    const e = await create(failing(err)).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(CalendarError);
    expect((e as CalendarError).kind).toBe(kind);
  });

  it('un 403 por límite de uso no es un problema de permisos', () => {
    const err = Object.assign(new Error('Rate Limit Exceeded'), {
      status: 403,
      errors: [{ reason: 'rateLimitExceeded' }],
    });
    expect(calendarErrorKind(err)).toBe('unavailable');
  });

  it('acepta el código numérico antiguo de googleapis (err.code)', () => {
    expect(calendarErrorKind(Object.assign(new Error('x'), { code: 401 }))).toBe('auth');
    expect(calendarErrorKind(Object.assign(new Error('x'), { code: '502' }))).toBe('unavailable');
  });
});

describe('createCalendarClient: ensureCalendar', () => {
  it('reutiliza un calendario "Tareas" existente', async () => {
    const { api, calls } = fakeApi({
      'calendarList.list': () => ({
        items: [
          { id: 'primary-id', summary: 'marc@example.com', accessRole: 'owner', primary: true },
          { id: 'tareas-id', summary: 'Tareas', accessRole: 'owner' },
        ],
      }),
    });
    expect(await createCalendarClient(null, { api }).ensureCalendar('Tareas')).toBe('tareas-id');
    expect(calls.map((c) => c.method)).toEqual(['calendarList.list']);
  });

  it('crea el calendario "Tareas" en Europe/Madrid si no existe', async () => {
    const { api, calls } = fakeApi({
      'calendarList.list': () => ({ items: [{ id: 'p', summary: 'Tareas', accessRole: 'reader' }] }),
      'calendars.insert': () => ({ id: 'nuevo-id' }),
    });
    expect(await createCalendarClient(null, { api }).ensureCalendar('Tareas')).toBe('nuevo-id');
    expect(calls[1]).toEqual({
      method: 'calendars.insert',
      params: { requestBody: { summary: 'Tareas', timeZone: 'Europe/Madrid' } },
    });
  });
});

describe('createCalendarClient: listEvents', () => {
  it('incluye siempre el calendario "Tareas" propio, aunque no esté marcado como visible', async () => {
    const { api, calls } = fakeApi({
      'calendarList.list': () => ({
        items: [
          { id: 'primary-id', primary: true },
          { id: 'tareas-id', summary: 'Tareas', accessRole: 'owner', selected: false },
          { id: 'ajeno', summary: 'Tareas', accessRole: 'reader', selected: false },
        ],
      }),
    });
    await createCalendarClient(null, { api }).listEvents({ from: new Date(0), to: new Date(1) });
    const listed = calls.filter((c) => c.method === 'events.list').map((c) => c.params.calendarId);
    expect(listed).toEqual(['primary-id', 'tareas-id']);
  });

  it('lista los eventos de los calendarios visibles, ordenados, con sus avisos', async () => {
    const { api, calls } = fakeApi({
      'calendarList.list': () => ({
        items: [
          { id: 'primary-id', primary: true, selected: true },
          { id: 'tareas-id', selected: true },
          { id: 'oculto', selected: false },
        ],
      }),
      'events.list': (p) =>
        p.calendarId === 'primary-id'
          ? {
              items: [
                {
                  id: 'b',
                  summary: 'Dentista',
                  start: { dateTime: '2026-10-22T10:00:00+02:00' },
                  end: { dateTime: '2026-10-22T11:00:00+02:00' },
                  reminders: {
                    useDefault: false,
                    overrides: [
                      { method: 'popup', minutes: 60 },
                      { method: 'email', minutes: 1440 },
                      { method: 'popup', minutes: 180 },
                    ],
                  },
                },
                { id: 'x', status: 'cancelled', start: { dateTime: '2026-10-22T09:00:00Z' } },
              ],
            }
          : {
              items: [
                {
                  id: 'a',
                  summary: 'Llamar',
                  start: { dateTime: '2026-10-22T06:00:00Z' },
                  end: { dateTime: '2026-10-22T06:30:00Z' },
                  reminders: { useDefault: true },
                },
              ],
            },
    });
    const from = new Date('2026-10-22T00:00:00Z');
    const to = new Date('2026-10-23T00:00:00Z');
    const events = await createCalendarClient(null, { api }).listEvents({ from, to });

    expect(events).toEqual([
      {
        id: 'a',
        title: 'Llamar',
        startsAt: new Date('2026-10-22T06:00:00Z'),
        endsAt: new Date('2026-10-22T06:30:00Z'),
        calendarId: 'tareas-id',
        hasRequiredReminders: false,
      },
      {
        id: 'b',
        title: 'Dentista',
        startsAt: new Date('2026-10-22T08:00:00Z'),
        endsAt: new Date('2026-10-22T09:00:00Z'),
        calendarId: 'primary-id',
        hasRequiredReminders: true,
      },
    ]);
    const lists = calls.filter((c) => c.method === 'events.list');
    expect(lists.map((c) => c.params.calendarId)).toEqual(['primary-id', 'tareas-id']);
    expect(lists[0].params).toMatchObject({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
  });

  it('un evento de día completo empieza a medianoche de Madrid', async () => {
    const { api } = fakeApi({
      'calendarList.list': () => ({ items: [{ id: 'p', primary: true }] }),
      'events.list': () => ({
        items: [{ id: 'd', summary: 'Puente', start: { date: '2026-10-25' }, end: { date: '2026-10-26' } }],
      }),
    });
    const [e] = await createCalendarClient(null, { api }).listEvents({
      from: new Date('2026-10-24T00:00:00Z'),
      to: new Date('2026-10-27T00:00:00Z'),
    });
    expect(e.startsAt.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(e.endsAt.toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
});

describe('hasRequiredReminders', () => {
  const popup = (minutes: number) => ({ method: 'popup', minutes });
  it.each([
    [{ useDefault: false, overrides: [popup(180), popup(60)] }, true],
    [{ useDefault: false, overrides: [popup(60), popup(180), popup(10)] }, true],
    [{ useDefault: false, overrides: [popup(60)] }, false],
    [{ useDefault: false, overrides: [popup(180), { method: 'email', minutes: 60 }] }, false],
    [{ useDefault: false, overrides: [popup(30), popup(10)] }, false],
    [{ useDefault: true }, false],
    [{ useDefault: true, overrides: [popup(180), popup(60)] }, false],
    [undefined, false],
  ])('%j → %s', (reminders, expected) => {
    expect(hasRequiredReminders(reminders)).toBe(expected);
  });
});

describe('withCachedCalendar', () => {
  function fakeGateway(opts: { missing?: Set<string> } = {}) {
    const calls: string[] = [];
    let n = 0;
    const gw: CalendarGateway = {
      async ensureCalendar(name) {
        calls.push(`ensure:${name}`);
        n += 1;
        return `cal-${n}`;
      },
      async createEvent(calendarId) {
        calls.push(`create:${calendarId}`);
        if (opts.missing?.has(calendarId)) throw new CalendarError('not_found', 'Not Found');
        return 'ev';
      },
      async updateEvent(calendarId) {
        calls.push(`update:${calendarId}`);
      },
      async deleteEvent(calendarId) {
        calls.push(`delete:${calendarId}`);
      },
      async listEvents() {
        return [];
      },
    };
    return { gw, calls };
  }

  it('usa el id guardado sin preguntar a Google', async () => {
    const { gw, calls } = fakeGateway();
    const cached = withCachedCalendar(gw, { get: async () => 'guardado', set: async () => {} });
    expect(await cached.ensureCalendar('Tareas')).toBe('guardado');
    expect(calls).toEqual([]);
  });

  it('sin id guardado lo busca o crea y lo guarda', async () => {
    const { gw } = fakeGateway();
    const saved: string[] = [];
    const cached = withCachedCalendar(gw, { get: async () => null, set: async (id) => void saved.push(id) });
    expect(await cached.ensureCalendar('Tareas')).toBe('cal-1');
    expect(saved).toEqual(['cal-1']);
  });

  it('si el calendario guardado se borró en Google, lo recrea, guarda el nuevo id y reintenta', async () => {
    const { gw, calls } = fakeGateway({ missing: new Set(['borrado']) });
    const saved: string[] = [];
    const cached = withCachedCalendar(gw, { get: async () => 'borrado', set: async (id) => void saved.push(id) });
    const calId = await cached.ensureCalendar('Tareas');
    expect(await cached.createEvent(calId, { title: 'X', startsAt: new Date() })).toBe('ev');
    expect(saved).toEqual(['cal-1']);
    expect(calls).toEqual(['create:borrado', 'ensure:Tareas', 'create:cal-1']);
    expect(await cached.ensureCalendar('Tareas')).toBe('cal-1');
  });
});
