import { describe, expect, it } from 'vitest';
import { addEvent, agendaRange, groupAgenda, PRIMARY_CALENDAR, type EventDeps } from '@/lib/actions/events';
import { UserError } from '@/lib/actions/result';
import { CalendarError, createCalendarClient, type CalendarApi, type CalendarEvent, type CalendarGateway, type EventInput } from '@/lib/calendar/client';

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const valid = { title: 'Dentista', date: '2026-10-25', start: '10:00', end: '11:15', notes: 'Llevar informe' };

function fakeGateway(createError?: unknown) {
  const created: { calendarId: string; e: EventInput }[] = [];
  const gw: CalendarGateway = {
    async createEvent(calendarId, e) {
      created.push({ calendarId, e });
      if (createError) throw createError;
      return 'ev-1';
    },
    async updateEvent() {},
    async deleteEvent() {},
    async listEvents() {
      return [];
    },
    async ensureCalendar() {
      return 'tareas-id';
    },
  };
  const deps: EventDeps = { calendar: async () => gw };
  return { deps, created };
}

describe('addEvent', () => {
  it('título vacío o solo espacios → error y no se llama a Calendar', async () => {
    const { deps, created } = fakeGateway();
    await expect(addEvent(deps, form({ ...valid, title: '   ' }))).rejects.toThrow(UserError);
    await expect(addEvent(deps, form({ ...valid, title: '' }))).rejects.toThrow('El título no puede estar vacío');
    expect(created).toHaveLength(0);
  });

  it('fin anterior (o igual) al inicio → error y no se llama a Calendar', async () => {
    const { deps, created } = fakeGateway();
    await expect(addEvent(deps, form({ ...valid, end: '09:30' }))).rejects.toThrow(
      'La hora de fin debe ser posterior a la de inicio.',
    );
    await expect(addEvent(deps, form({ ...valid, end: '10:00' }))).rejects.toThrow(UserError);
    expect(created).toHaveLength(0);
  });

  it('sin fecha u hora de inicio válidas → error', async () => {
    const { deps } = fakeGateway();
    await expect(addEvent(deps, form({ ...valid, date: '' }))).rejects.toThrow('La fecha no es válida.');
    await expect(addEvent(deps, form({ ...valid, date: '2026-02-30' }))).rejects.toThrow('La fecha no es válida.');
    await expect(addEvent(deps, form({ ...valid, start: '' }))).rejects.toThrow('Indica la hora de inicio.');
    await expect(addEvent(deps, form({ ...valid, start: '25:00' }))).rejects.toThrow('La hora no es válida.');
  });

  it('crea el evento en el calendario principal, en hora de Madrid', async () => {
    const { deps, created } = fakeGateway();
    expect(await addEvent(deps, form(valid))).toEqual({ ok: true, eventId: 'ev-1' });
    expect(created).toEqual([
      {
        calendarId: PRIMARY_CALENDAR,
        e: {
          title: 'Dentista',
          // 25 Oct 2026 is the DST change: 10:00 in Madrid is already CET (+1).
          startsAt: new Date('2026-10-25T09:00:00.000Z'),
          endsAt: new Date('2026-10-25T10:15:00.000Z'),
          description: 'Llevar informe',
        },
      },
    ]);
    expect(PRIMARY_CALENDAR).toBe('primary');
  });

  it('sin hora de fin ni notas → deja la duración por defecto y sin descripción', async () => {
    const { deps, created } = fakeGateway();
    await addEvent(deps, form({ title: 'Llamada', date: '2026-10-22', start: '18:00' }));
    expect(created[0].e).toEqual({ title: 'Llamada', startsAt: new Date('2026-10-22T16:00:00.000Z') });
  });

  it('llega a Google con avisos popup de 180 y 60 minutos', async () => {
    const inserts: Record<string, unknown>[] = [];
    const api = {
      events: {
        insert: async (params: Record<string, unknown>) => {
          inserts.push(params);
          return { data: { id: 'g-1' } };
        },
      },
    } as unknown as CalendarApi;
    const deps: EventDeps = { calendar: async () => createCalendarClient(null, { api }) };
    expect(await addEvent(deps, form(valid))).toEqual({ ok: true, eventId: 'g-1' });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].calendarId).toBe('primary');
    expect((inserts[0].requestBody as { reminders: unknown }).reminders).toEqual({
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 180 },
        { method: 'popup', minutes: 60 },
      ],
    });
  });

  it('Calendar rechaza el acceso (401/403/sin token) → { ok: false, error: calendar_auth }', async () => {
    const { deps } = fakeGateway(Object.assign(new Error('Unauthorized'), { status: 401 }));
    expect(await addEvent(deps, form(valid))).toEqual({ ok: false, error: 'calendar_auth' });
    const noToken: EventDeps = {
      calendar: async () => {
        throw new CalendarError('auth', 'No refresh token stored');
      },
    };
    expect(await addEvent(noToken, form(valid))).toEqual({ ok: false, error: 'calendar_auth' });
  });

  it('Calendar caído o sin red → { ok: false, error: calendar_unavailable }', async () => {
    const { deps } = fakeGateway(Object.assign(new Error('Backend Error'), { status: 503 }));
    expect(await addEvent(deps, form(valid))).toEqual({ ok: false, error: 'calendar_unavailable' });
    const { deps: offline } = fakeGateway(new TypeError('fetch failed'));
    expect(await addEvent(offline, form(valid))).toEqual({ ok: false, error: 'calendar_unavailable' });
  });
});

describe('agendaRange', () => {
  it('hoy y los 7 días siguientes, de medianoche a medianoche en Madrid (con cambio de hora)', () => {
    const r = agendaRange('2026-10-21');
    expect(r.days).toEqual([
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
    ]);
    expect(r.from).toEqual(new Date('2026-10-20T22:00:00.000Z'));
    expect(r.to).toEqual(new Date('2026-10-28T23:00:00.000Z'));
  });

  it('cruza fin de mes y de año', () => {
    expect(agendaRange('2026-12-28').days.slice(-2)).toEqual(['2027-01-03', '2027-01-04']);
  });
});

describe('groupAgenda', () => {
  const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
    id: 'e',
    title: 'Cita',
    startsAt: new Date('2026-10-21T08:00:00.000Z'),
    endsAt: new Date('2026-10-21T09:00:00.000Z'),
    calendarId: 'marc@gmail.com',
    hasRequiredReminders: true,
    ...over,
  });

  it('agrupa por día de Madrid, en orden, y omite los días vacíos', () => {
    const days = groupAgenda(
      [
        ev({ id: 'a', startsAt: new Date('2026-10-21T08:00:00Z'), endsAt: new Date('2026-10-21T09:00:00Z') }),
        // 23:30 UTC on the 22nd is 01:30 on the 23rd in Madrid.
        ev({ id: 'b', startsAt: new Date('2026-10-22T23:30:00Z'), endsAt: new Date('2026-10-23T00:30:00Z') }),
        ev({ id: 'c', startsAt: new Date('2026-10-21T16:00:00Z'), endsAt: new Date('2026-10-21T17:00:00Z') }),
      ],
      { today: '2026-10-21', tasksCalendarId: 'tareas-id' },
    );
    expect(days.map((d) => [d.date, d.events.map((e) => e.id)])).toEqual([
      ['2026-10-21', ['a', 'c']],
      ['2026-10-23', ['b']],
    ]);
    expect(days[0].events[0]).toMatchObject({ time: '10:00 – 11:00', allDay: false, isTask: false });
  });

  it('un evento empezado antes de hoy aparece en Hoy', () => {
    const [day] = groupAgenda(
      [ev({ startsAt: new Date('2026-10-19T08:00:00Z'), endsAt: new Date('2026-10-22T08:00:00Z') })],
      { today: '2026-10-21', tasksCalendarId: null },
    );
    expect(day.date).toBe('2026-10-21');
  });

  it('marca las tareas y los eventos de día completo', () => {
    const [day] = groupAgenda(
      [
        ev({ id: 'fiesta', startsAt: new Date('2026-10-20T22:00:00Z'), endsAt: new Date('2026-10-21T22:00:00Z') }),
        ev({ id: 'tarea', calendarId: 'tareas-id', endsAt: new Date('2026-10-21T08:30:00Z') }),
      ],
      { today: '2026-10-21', tasksCalendarId: 'tareas-id' },
    );
    expect(day.events).toMatchObject([
      { id: 'fiesta', allDay: true, time: 'Todo el día', isTask: false },
      { id: 'tarea', allDay: false, time: '10:00', isTask: true },
    ]);
  });

  it('avisa (discretamente) solo de eventos con hora sin los avisos de 3 h y 1 h', () => {
    const [day] = groupAgenda(
      [
        ev({ id: 'sin', hasRequiredReminders: false }),
        ev({ id: 'con', hasRequiredReminders: true }),
        ev({
          id: 'diaCompleto',
          hasRequiredReminders: false,
          startsAt: new Date('2026-10-20T22:00:00Z'),
          endsAt: new Date('2026-10-21T22:00:00Z'),
        }),
      ],
      { today: '2026-10-21', tasksCalendarId: null },
    );
    const missing = Object.fromEntries(day.events.map((e) => [e.id, e.missingReminders]));
    expect(missing).toEqual({ sin: true, con: false, diaCompleto: false });
  });
});
