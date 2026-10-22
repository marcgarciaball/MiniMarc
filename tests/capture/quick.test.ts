import { describe, expect, it, vi } from 'vitest';
import type { AiProvider } from '@/lib/ai/provider';
import { createCalendarClient, type CalendarApi, type CalendarGateway } from '@/lib/calendar/client';
import { captureDefaults } from '@/lib/capture/kinds';
import { captureText, type CaptureDeps } from '@/lib/capture/pipeline';
import { quickCapture, type WebCaptureDeps } from '@/lib/capture/web';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { madridToUtc } from '@/lib/time';

const NOW = new Date('2026-10-21T08:00:00.000Z');

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Fails the test if anything reaches the AI. */
function aiForbidden(): AiProvider & { calls: number } {
  const ai = {
    calls: 0,
    async generateJson(): Promise<never> {
      ai.calls += 1;
      throw new Error('AI must not be called');
    },
    async generateText(): Promise<never> {
      ai.calls += 1;
      throw new Error('AI must not be called');
    },
  };
  return ai;
}

function aiReturning(items: unknown[]): AiProvider {
  return {
    async generateJson(_prompt, schema) {
      return schema.parse({ items });
    },
    async generateText() {
      throw new Error('not used');
    },
  };
}

/** A gateway that records what it is asked to create. */
function fakeGateway() {
  const created: { calendarId: string; title: string; startsAt: Date }[] = [];
  const gw: CalendarGateway = {
    async createEvent(calendarId, e) {
      created.push({ calendarId, title: e.title, startsAt: e.startsAt });
      return `ev-${created.length}`;
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
  return { gw, created };
}

function setup(opts: { ai?: AiProvider; calendar?: () => Promise<CalendarGateway> } = {}) {
  const ai = opts.ai ?? aiForbidden();
  const backend = createMemoryBackend({ now: () => NOW });
  const items = createItemsRepo(backend, { now: () => NOW });
  const people = createPeopleRepo(backend);
  const calendar = vi.fn(
    opts.calendar ??
      (async (): Promise<CalendarGateway> => {
        throw new Error('no calendar in this test');
      }),
  );
  const captureDeps: CaptureDeps = { ai, items, people, calendar, now: NOW };
  const deps: WebCaptureDeps = { captureDeps: async () => captureDeps };
  return { items, people, calendar, deps };
}

describe('quickCapture', () => {
  it('Compra crea un item compra sin llamar a la IA', async () => {
    const ai = aiForbidden();
    const { deps, items } = setup({ ai });
    const res = await quickCapture(form({ text: 'Leche de avena', kind: 'compra', area: 'trabajo' }), deps);
    expect(res).toEqual({ ok: true, value: { message: 'Guardado en Compras', href: '/compras' } });
    expect(ai.calls).toBe(0);
    const saved = await items.listItems();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      type: 'compra',
      title: 'Leche de avena',
      area: null,
      needsReview: false,
      origin: 'web',
      sourceText: 'Leche de avena',
    });
  });

  it('Idea crea una idea sin área ni IA', async () => {
    const ai = aiForbidden();
    const { deps, items } = setup({ ai });
    const res = await quickCapture(form({ text: 'App de recetas', kind: 'idea' }), deps);
    expect(res).toEqual({ ok: true, value: { message: 'Guardado en Ideas', href: '/ideas' } });
    expect(ai.calls).toBe(0);
    expect(await items.listItems()).toMatchObject([{ type: 'idea', area: null, sourceText: 'App de recetas' }]);
  });

  it('Regalo con persona nueva crea la persona y la enlaza', async () => {
    const { deps, items, people } = setup();
    const res = await quickCapture(form({ text: 'Bufanda de lana', kind: 'regalo', personName: '  Lucía ' }), deps);
    const [lucia] = await people.listPeople();
    expect(lucia).toMatchObject({ name: 'Lucía' });
    expect(res).toEqual({ ok: true, value: { message: 'Guardado en Regalos', href: `/regalos/${lucia.id}` } });
    expect(await items.listItems()).toMatchObject([
      { type: 'regalo', title: 'Bufanda de lana', personId: lucia.id, area: null, sourceText: 'Bufanda de lana' },
    ]);
  });

  it('Regalo con una persona existente la enlaza sin crear otra', async () => {
    const { deps, items, people } = setup();
    const ana = await people.upsertPersonByName('Ana');
    await quickCapture(form({ text: 'Libro', kind: 'regalo', personId: ana.id }), deps);
    expect(await people.listPeople()).toHaveLength(1);
    expect((await items.listItems())[0]).toMatchObject({ type: 'regalo', personId: ana.id });
  });

  it('Tarea con fecha y hora crea una tarea con hora y la sincroniza con Calendar', async () => {
    const { gw, created } = fakeGateway();
    const ai = aiForbidden();
    const { deps, items, calendar } = setup({ ai, calendar: async () => gw });
    const res = await quickCapture(
      form({ text: 'Llamar al seguro', kind: 'tarea', area: 'trabajo', dueDate: '2026-10-25', dueTime: '10:00' }),
      deps,
    );
    expect(res).toEqual({ ok: true, value: { message: 'Guardado en Tareas · Trabajo', href: '/tareas?area=trabajo' } });
    expect(ai.calls).toBe(0);
    expect(calendar).toHaveBeenCalled();
    expect(created).toEqual([
      { calendarId: 'tareas-id', title: 'Llamar al seguro', startsAt: madridToUtc('2026-10-25', '10:00') },
    ]);
    const [task] = await items.listItems();
    expect(task).toMatchObject({
      type: 'tarea',
      area: 'trabajo',
      hasTime: true,
      dueAt: madridToUtc('2026-10-25', '10:00').toISOString(),
      calendarEventId: 'ev-1',
      syncError: null,
      sourceText: 'Llamar al seguro',
    });
  });

  it('Tarea sin fecha es Personal por defecto y no toca Calendar', async () => {
    const { deps, items, calendar } = setup();
    const res = await quickCapture(form({ text: 'Regar plantas', kind: 'tarea' }), deps);
    expect(res).toEqual({ ok: true, value: { message: 'Guardado en Tareas · Personal', href: '/tareas?area=personal' } });
    expect(calendar).not.toHaveBeenCalled();
    expect(await items.listItems()).toMatchObject([{ type: 'tarea', area: 'personal', dueAt: null, hasTime: false }]);
  });

  it('Tarea con hora pero sin fecha → error y no se guarda nada', async () => {
    const { deps, items } = setup();
    const res = await quickCapture(form({ text: 'Algo', kind: 'tarea', dueTime: '10:00' }), deps);
    expect(res).toEqual({ ok: false, error: 'Indica la fecha.' });
    expect(await items.listItems()).toEqual([]);
  });

  it('Cita crea el evento en el calendario principal con avisos a 180 y 60 minutos', async () => {
    const inserts: Record<string, unknown>[] = [];
    const api = {
      events: {
        insert: async (params: Record<string, unknown>) => {
          inserts.push(params);
          return { data: { id: 'ev-cita' } };
        },
      },
    } as unknown as CalendarApi;
    const ai = aiForbidden();
    const { deps, items } = setup({ ai, calendar: async () => createCalendarClient(null, { api }) });
    const res = await quickCapture(
      form({ text: 'Dentista', kind: 'cita', date: '2026-10-25', start: '10:00', end: '11:00' }),
      deps,
    );
    expect(res).toEqual({ ok: true, value: { message: 'Guardado en Calendar', href: '/agenda' } });
    expect(ai.calls).toBe(0);
    expect(await items.listItems()).toEqual([]);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      calendarId: 'primary',
      requestBody: {
        summary: 'Dentista',
        start: { dateTime: madridToUtc('2026-10-25', '10:00').toISOString() },
        end: { dateTime: madridToUtc('2026-10-25', '11:00').toISOString() },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 180 },
            { method: 'popup', minutes: 60 },
          ],
        },
      },
    });
  });

  it('Cita sin hora de inicio → error y nada se guarda', async () => {
    const { deps, items, calendar } = setup();
    const res = await quickCapture(form({ text: 'Dentista', kind: 'cita', date: '2026-10-25' }), deps);
    expect(res).toEqual({ ok: false, error: 'Indica la hora de inicio.' });
    expect(calendar).not.toHaveBeenCalled();
    expect(await items.listItems()).toEqual([]);
  });

  it('Cita con Calendar caído se guarda en Sin clasificar con el error, sin perder el texto', async () => {
    const { deps, items } = setup();
    const res = await quickCapture(form({ text: 'Dentista', kind: 'cita', date: '2026-10-25', start: '10:00' }), deps);
    expect(res).toEqual({
      ok: true,
      value: { message: 'Calendar no responde: guardado en Sin clasificar', href: '/sin-clasificar' },
    });
    expect(await items.listItems()).toMatchObject([
      {
        type: 'tarea',
        title: 'Dentista',
        needsReview: true,
        syncError: 'calendar_unavailable',
        dueAt: madridToUtc('2026-10-25', '10:00').toISOString(),
        hasTime: true,
        sourceText: 'Dentista',
      },
    ]);
  });

  it('Auto pasa por captureText (la IA clasifica)', async () => {
    const { deps, items } = setup({ ai: aiReturning([{ kind: 'compra', title: 'Leche', confidence: 0.9 }]) });
    const capture = vi.fn(captureText);
    const res = await quickCapture(form({ text: 'comprar leche', kind: 'auto' }), { ...deps, capture });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0]).toEqual({ text: 'comprar leche', origin: 'web' });
    expect(res).toEqual({ ok: true, value: { message: 'Guardado en Compras', href: '/bandeja' } });
    expect((await items.listItems()).map((i) => i.type)).toEqual(['compra']);
  });

  it('sin tipo se comporta como Auto', async () => {
    const { deps } = setup({ ai: aiReturning([{ kind: 'idea', title: 'X', confidence: 0.9 }]) });
    const capture = vi.fn(captureText);
    await quickCapture(form({ text: 'algo' }), { ...deps, capture });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('Auto con Trabajo nunca llama a la IA', async () => {
    const ai = aiForbidden();
    const { deps, items } = setup({ ai });
    const capture = vi.fn(captureText);
    const res = await quickCapture(form({ text: 'Revisar presupuesto', kind: 'auto', area: 'trabajo' }), { ...deps, capture });
    expect(capture.mock.calls[0][0]).toEqual({ text: 'Revisar presupuesto', area: 'trabajo', origin: 'web' });
    expect(ai.calls).toBe(0);
    expect(res).toMatchObject({ ok: true, value: { message: 'Guardado en Tareas · Trabajo' } });
    expect(await items.listItems()).toMatchObject([{ type: 'tarea', area: 'trabajo' }]);
  });

  it.each(['auto', 'tarea', 'idea', 'compra', 'regalo', 'cita'])(
    'texto vacío con %s → error y no se guarda nada',
    async (kind) => {
      const ai = aiForbidden();
      const { deps, items, people, calendar } = setup({ ai });
      const res = await quickCapture(
        form({ text: '   ', kind, personName: 'Lucía', date: '2026-10-25', start: '10:00' }),
        deps,
      );
      expect(res).toEqual({ ok: false, error: 'El texto está vacío' });
      expect(await items.listItems()).toEqual([]);
      expect(await people.listPeople()).toEqual([]);
      expect(calendar).not.toHaveBeenCalled();
      expect(ai.calls).toBe(0);
    },
  );

  it('un tipo desconocido → error y nada se guarda', async () => {
    const { deps, items } = setup();
    const res = await quickCapture(form({ text: 'Algo', kind: 'cita-secreta' }), deps);
    expect(res).toEqual({ ok: false, error: 'Tipo de captura no válido' });
    expect(await items.listItems()).toEqual([]);
  });

  it('un texto largo queda entero en notas y en sourceText', async () => {
    const { deps, items } = setup();
    const long = 'a'.repeat(300);
    await quickCapture(form({ text: long, kind: 'idea' }), deps);
    const [idea] = await items.listItems();
    expect(idea.title.length).toBeLessThanOrEqual(200);
    expect(idea).toMatchObject({ notes: long, sourceText: long });
  });
});

describe('captureDefaults', () => {
  it.each([
    ['/compras', null, { kind: 'compra', personId: null, area: null }],
    ['/ideas', null, { kind: 'idea', personId: null, area: null }],
    ['/regalos', null, { kind: 'regalo', personId: null, area: null }],
    ['/regalos/p-1', null, { kind: 'regalo', personId: 'p-1', area: null }],
    ['/agenda', null, { kind: 'cita', personId: null, area: null }],
    ['/tareas', null, { kind: 'tarea', personId: null, area: 'personal' }],
    ['/tareas', 'trabajo', { kind: 'tarea', personId: null, area: 'trabajo' }],
    ['/hoy', null, { kind: 'auto', personId: null, area: null }],
    ['/bandeja', 'trabajo', { kind: 'auto', personId: null, area: null }],
  ] as const)('%s ?area=%s → %o', (pathname, area, expected) => {
    expect(captureDefaults(pathname, area)).toEqual(expected);
  });
});
