import { describe, expect, it } from 'vitest';
import { addEvent, addReminders, PRIMARY_CALENDAR, type EventDeps } from '@/lib/actions/events';
import { UserError } from '@/lib/actions/result';
import { CalendarError, createCalendarClient, type CalendarApi, type CalendarGateway, type EventInput } from '@/lib/calendar/client';

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
    async setRequiredReminders() {},
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

describe('addReminders', () => {
  function gateway(error?: unknown) {
    const patched: { calendarId: string; eventId: string }[] = [];
    const { deps } = fakeGateway();
    const withPatch: EventDeps = {
      calendar: async () => ({
        ...(await deps.calendar()),
        async setRequiredReminders(calendarId: string, eventId: string) {
          patched.push({ calendarId, eventId });
          if (error) throw error;
        },
      }),
    };
    return { deps: withPatch, patched };
  }

  it('pone los avisos de 3 h y 1 h al evento, solo en el calendario principal', async () => {
    const { deps, patched } = gateway();
    expect(await addReminders(deps, 'ev-9')).toEqual({ ok: true });
    expect(patched).toEqual([{ calendarId: PRIMARY_CALENDAR, eventId: 'ev-9' }]);
  });

  it('sin id de evento → no llama a Calendar', async () => {
    const { deps, patched } = gateway();
    await expect(addReminders(deps, '  ')).rejects.toThrow(UserError);
    expect(patched).toHaveLength(0);
  });

  it('Calendar sin acceso o caído → código de error, sin lanzar', async () => {
    expect(await addReminders(gateway(Object.assign(new Error('x'), { status: 401 })).deps, 'ev')).toEqual({
      ok: false,
      error: 'calendar_auth',
    });
    expect(await addReminders(gateway(Object.assign(new Error('x'), { status: 503 })).deps, 'ev')).toEqual({
      ok: false,
      error: 'calendar_unavailable',
    });
    const noToken: EventDeps = {
      calendar: async () => {
        throw new CalendarError('auth', 'No refresh token stored');
      },
    };
    expect(await addReminders(noToken, 'ev')).toEqual({ ok: false, error: 'calendar_auth' });
  });

  it('llega a Google como un parche solo de avisos, en el calendario principal', async () => {
    const patches: Record<string, unknown>[] = [];
    const api = {
      events: {
        patch: async (params: Record<string, unknown>) => {
          patches.push(params);
          return { data: {} };
        },
      },
    } as unknown as CalendarApi;
    const deps: EventDeps = { calendar: async () => createCalendarClient(null, { api }) };
    expect(await addReminders(deps, 'g-7')).toEqual({ ok: true });
    expect(patches).toEqual([
      {
        calendarId: 'primary',
        eventId: 'g-7',
        requestBody: {
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 180 },
              { method: 'popup', minutes: 60 },
            ],
          },
        },
      },
    ]);
  });
});
