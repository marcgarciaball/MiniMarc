import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import type { AiProvider } from '@/lib/ai/provider';
import { CalendarError, createCalendarClient, type CalendarApi, type CalendarGateway, type EventInput } from '@/lib/calendar/client';
import {
  captureText,
  createCaptureDedup,
  EmptyCaptureError,
  TITLE_MAX,
  type CaptureDeps,
} from '@/lib/capture/pipeline';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';

type ModelItem = {
  kind: 'tarea' | 'idea' | 'compra' | 'regalo' | 'cita';
  title: string;
  notes?: string | null;
  personName?: string | null;
  date?: string | null;
  time?: string | null;
  confidence: number;
};

/** 21 Oct 2026, 10:00 in Madrid (CEST, +2). */
const NOW = new Date('2026-10-21T08:00:00.000Z');

function aiReturning(items: ModelItem[]) {
  const prompts: string[] = [];
  const ai: AiProvider = {
    async generateJson<T>(prompt: string, schema: ZodType<T>) {
      prompts.push(prompt);
      return schema.parse({ items });
    },
    async generateText() {
      throw new Error('not used');
    },
  };
  return { ai, prompts };
}

function aiThrowing(err: unknown = new Error('timeout')): AiProvider {
  return {
    async generateJson() {
      throw err;
    },
    async generateText() {
      throw err;
    },
  };
}

/** Fails the test if the pipeline ever calls it (Trabajo must never reach the AI). */
function aiForbidden() {
  const calls: string[] = [];
  const ai: AiProvider = {
    async generateJson(prompt: string) {
      calls.push(prompt);
      throw new Error('AI must not be called');
    },
    async generateText(prompt: string) {
      calls.push(prompt);
      throw new Error('AI must not be called');
    },
  };
  return { ai, calls };
}

function fakeCalendar(opts: { createError?: unknown; loadError?: unknown } = {}) {
  const created: { calendarId: string; e: EventInput }[] = [];
  let n = 0;
  const gw: CalendarGateway = {
    async createEvent(calendarId, e) {
      if (opts.createError) throw opts.createError;
      created.push({ calendarId, e });
      return `ev-${++n}`;
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
  const calendar = async () => {
    if (opts.loadError) throw opts.loadError;
    return gw;
  };
  return { calendar, created };
}

function setup(ai: AiProvider, cal = fakeCalendar(), now = NOW) {
  const db = createMemoryBackend({ now: () => now });
  const items = createItemsRepo(db);
  const people = createPeopleRepo(db);
  const deps: CaptureDeps = {
    ai,
    items,
    people,
    calendar: cal.calendar,
    now,
    tz: 'Europe/Madrid',
    dedup: createCaptureDedup(),
    userId: 'user-marc',
  };
  return { db, items, people, deps, created: cal.created };
}

describe('captureText: entrada vacía', () => {
  it('texto vacío o solo espacios lanza EmptyCaptureError y no guarda nada', async () => {
    const { ai, calls } = aiForbidden();
    const { db, deps } = setup(ai);
    for (const text of ['', '   ', '\n\t ']) {
      await expect(captureText({ text, origin: 'siri' }, deps)).rejects.toThrow(EmptyCaptureError);
      await expect(captureText({ text, area: 'trabajo', origin: 'siri' }, deps)).rejects.toThrow(EmptyCaptureError);
    }
    expect(db.tables.items).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

describe('captureText: Trabajo', () => {
  it("area:'trabajo' crea una tarea de trabajo sin llamar a la IA", async () => {
    const { ai, calls } = aiForbidden();
    const { deps, created } = setup(ai);
    const res = await captureText({ text: '  Revisar el contrato de Acme mañana a las 9  ', area: 'trabajo', origin: 'siri' }, deps);
    expect(calls).toHaveLength(0);
    expect(created).toHaveLength(0);
    expect(res.eventIds).toEqual([]);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      type: 'tarea',
      area: 'trabajo',
      title: 'Revisar el contrato de Acme mañana a las 9',
      notes: null,
      needsReview: false,
      confidence: null,
      dueAt: null,
      hasTime: false,
      origin: 'siri',
    });
    expect(await deps.items.listItems()).toHaveLength(1);
  });

  it('un texto de más de 200 caracteres se recorta en el título y se guarda entero en notas', async () => {
    const { ai } = aiForbidden();
    const { deps } = setup(ai);
    const text = 'palabra '.repeat(60).trim();
    const [item] = (await captureText({ text, area: 'trabajo', origin: 'extension' }, deps)).items;
    expect(item.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(text.startsWith(item.title.replace(/…$/, ''))).toBe(true);
    expect(item.notes).toBe(text);
  });
});

describe('captureText: fallo de la IA → Sin clasificar', () => {
  it.each([
    ['timeout', new Error('timeout')],
    ['tope diario', new Error('Daily cap reached')],
    ['red', new TypeError('fetch failed')],
  ])('%s: guarda el texto original con needsReview', async (_name, err) => {
    const { db, deps } = setup(aiThrowing(err));
    const res = await captureText({ text: 'llamar al fontanero', origin: 'siri' }, deps);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      type: 'tarea',
      title: 'llamar al fontanero',
      area: null,
      needsReview: true,
      origin: 'siri',
    });
    expect(db.tables.items).toHaveLength(1);
  });

  it('JSON inválido del modelo (ClassifyError) → Sin clasificar', async () => {
    const ai: AiProvider = {
      async generateJson<T>(_p: string, schema: ZodType<T>) {
        return schema.parse({ nope: true });
      },
      async generateText() {
        return '';
      },
    };
    const { deps } = setup(ai);
    const res = await captureText({ text: 'algo raro', origin: 'web' }, deps);
    expect(res.items[0]).toMatchObject({ title: 'algo raro', needsReview: true, area: null, type: 'tarea' });
  });

  it('la IA no devuelve nada útil → Sin clasificar (nunca se pierde)', async () => {
    const { deps } = setup(aiReturning([{ kind: 'idea', title: '   ', confidence: 0.9 }]).ai);
    const res = await captureText({ text: 'mmm', origin: 'siri' }, deps);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ title: 'mmm', needsReview: true });
  });
});

describe('captureText: clasificación', () => {
  it('pasa a la IA las personas conocidas, la hora y la zona', async () => {
    const { ai, prompts } = aiReturning([{ kind: 'idea', title: 'Algo', confidence: 0.9 }]);
    const { deps, people } = setup(ai);
    await people.upsertPersonByName('Ainhoa');
    await captureText({ text: 'algo', origin: 'siri' }, deps);
    expect(prompts[0]).toContain('Ainhoa');
    expect(prompts[0]).toContain('2026-10-21 10:00');
  });

  it('confianza < 0.6 → needsReview, conservando el tipo y los campos que propuso la IA', async () => {
    const { deps } = setup(aiReturning([{ kind: 'compra', title: 'Pilas', notes: 'AA', confidence: 0.4 }]).ai);
    const [item] = (await captureText({ text: 'pilas AA', origin: 'siri' }, deps)).items;
    expect(item).toMatchObject({ type: 'compra', title: 'Pilas', notes: 'AA', needsReview: true, confidence: 0.4 });
  });

  it('confianza ≥ 0.6 → clasificado; una tarea sin área va a Personal', async () => {
    const { deps } = setup(
      aiReturning([
        { kind: 'tarea', title: 'Llamar a mamá', confidence: 0.9 },
        { kind: 'compra', title: 'Leche', confidence: 0.95 },
        { kind: 'idea', title: 'App de recetas', confidence: 0.6 },
      ]).ai,
    );
    const res = await captureText({ text: 'llamar a mamá, comprar leche y idea: app de recetas', origin: 'siri' }, deps);
    expect(res.items.map((i) => [i.type, i.title, i.area, i.needsReview])).toEqual([
      ['tarea', 'Llamar a mamá', 'personal', false],
      ['compra', 'Leche', null, false],
      ['idea', 'App de recetas', null, false],
    ]);
    expect(res.eventIds).toEqual([]);
  });

  it('una tarea con fecha sin hora guarda la fecha y no crea evento', async () => {
    const cal = fakeCalendar();
    const { deps } = setup(aiReturning([{ kind: 'tarea', title: 'Pagar IBI', date: '2026-10-23', confidence: 0.9 }]).ai, cal);
    const [item] = (await captureText({ text: 'pagar el IBI el viernes', origin: 'siri' }, deps)).items;
    expect(item).toMatchObject({ dueAt: '2026-10-22T22:00:00.000Z', hasTime: false, calendarEventId: null });
    expect(cal.created).toHaveLength(0);
  });

  it('"regalo para mamá: pañuelo" crea la persona "mamá" y la enlaza', async () => {
    const { deps, people } = setup(
      aiReturning([{ kind: 'regalo', title: 'Pañuelo', personName: 'mamá', confidence: 0.9 }]).ai,
    );
    const [item] = (await captureText({ text: 'regalo para mamá: pañuelo', origin: 'siri' }, deps)).items;
    const all = await people.listPeople();
    expect(all.map((p) => p.name)).toEqual(['mamá']);
    expect(item).toMatchObject({ type: 'regalo', title: 'Pañuelo', personId: all[0].id });
  });

  it('un regalo para una persona existente la reutiliza', async () => {
    const { deps, people } = setup(
      aiReturning([{ kind: 'regalo', title: 'Libro', personName: 'Mamá', confidence: 0.9 }]).ai,
    );
    const mama = await people.upsertPersonByName('mamá');
    const [item] = (await captureText({ text: 'regalo para mamá: libro', origin: 'siri' }, deps)).items;
    expect(await people.listPeople()).toHaveLength(1);
    expect(item.personId).toBe(mama.id);
  });
});

describe('captureText: citas', () => {
  const cita: ModelItem = { kind: 'cita', title: 'Dentista', date: '2026-10-22', time: '17:00', confidence: 0.9 };

  it('crea el evento en el calendario principal y no crea fila en items', async () => {
    const cal = fakeCalendar();
    const { db, deps } = setup(aiReturning([cita]).ai, cal);
    const res = await captureText({ text: 'dentista mañana a las 5 de la tarde', origin: 'siri' }, deps);
    expect(res).toEqual({ items: [], eventIds: ['ev-1'] });
    expect(cal.created).toEqual([
      { calendarId: 'primary', e: { title: 'Dentista', startsAt: new Date('2026-10-22T15:00:00.000Z') } },
    ]);
    expect(db.tables.items).toHaveLength(0);
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
    const { deps } = setup(aiReturning([cita]).ai);
    deps.calendar = async () => createCalendarClient(null, { api });
    expect((await captureText({ text: 'dentista mañana a las 5', origin: 'siri' }, deps)).eventIds).toEqual(['g-1']);
    expect(inserts[0].calendarId).toBe('primary');
    expect((inserts[0].requestBody as { reminders: unknown }).reminders).toEqual({
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 180 },
        { method: 'popup', minutes: 60 },
      ],
    });
  });

  it.each([
    ['401 en la llamada', { createError: Object.assign(new Error('Unauthorized'), { status: 401 }) }, 'calendar_auth'],
    ['sin refresh token', { loadError: new CalendarError('auth', 'No refresh token stored') }, 'calendar_auth'],
    ['Calendar caído', { createError: Object.assign(new Error('Backend Error'), { status: 503 }) }, 'calendar_unavailable'],
  ])('%s → guarda el elemento con syncError y no pierde el texto', async (_n, opts, code) => {
    const { db, deps } = setup(aiReturning([{ ...cita, notes: 'Llevar informe' }]).ai, fakeCalendar(opts));
    const res = await captureText({ text: 'dentista mañana a las 5', origin: 'siri' }, deps);
    expect(res.eventIds).toEqual([]);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      type: 'tarea',
      title: 'Dentista',
      notes: 'Llevar informe',
      needsReview: true,
      dueAt: '2026-10-22T15:00:00.000Z',
      hasTime: true,
      syncError: code,
    });
    expect(db.tables.items).toHaveLength(1);
  });

  it('una cita con confianza baja no va a Calendar: queda en Sin clasificar con su fecha', async () => {
    const cal = fakeCalendar();
    const { deps } = setup(aiReturning([{ ...cita, confidence: 0.5 }]).ai, cal);
    const res = await captureText({ text: 'dentista mañana a las 5?', origin: 'siri' }, deps);
    expect(cal.created).toHaveLength(0);
    expect(res.eventIds).toEqual([]);
    expect(res.items[0]).toMatchObject({
      type: 'tarea',
      title: 'Dentista',
      needsReview: true,
      dueAt: '2026-10-22T15:00:00.000Z',
      hasTime: true,
      syncError: null,
    });
  });

  it('cambio de hora: "mañana a las 9" dicho el sábado 24 de octubre → 09:00 CET (UTC+1)', async () => {
    const cal = fakeCalendar();
    const sat = new Date('2026-10-24T08:00:00.000Z');
    const { deps } = setup(
      aiReturning([{ kind: 'cita', title: 'Pádel', date: '2026-10-25', time: '09:00', confidence: 0.9 }]).ai,
      cal,
      sat,
    );
    await captureText({ text: 'pádel mañana a las 9', origin: 'siri' }, deps);
    expect(cal.created[0].e.startsAt).toEqual(new Date('2026-10-25T08:00:00.000Z'));
  });

  it('cambio de hora: "hoy a las 9" dicho a las 10 del domingo 25 → confianza 0 → Sin clasificar', async () => {
    const cal = fakeCalendar();
    const sun10 = new Date('2026-10-25T09:00:00.000Z'); // 10:00 CET
    const { deps } = setup(
      aiReturning([{ kind: 'cita', title: 'Pádel', date: '2026-10-25', time: '09:00', confidence: 0.95 }]).ai,
      cal,
      sun10,
    );
    const res = await captureText({ text: 'pádel hoy a las 9', origin: 'siri' }, deps);
    expect(cal.created).toHaveLength(0);
    expect(res.items[0]).toMatchObject({ needsReview: true, confidence: 0, dueAt: '2026-10-25T08:00:00.000Z' });
  });
});

describe('captureText: tareas con hora', () => {
  it('crea el evento en "Tareas" y guarda su id', async () => {
    const cal = fakeCalendar();
    const { deps, items } = setup(
      aiReturning([{ kind: 'tarea', title: 'Llamar al gestor', date: '2026-10-22', time: '17:00', confidence: 0.9 }]).ai,
      cal,
    );
    const res = await captureText({ text: 'llamar al gestor mañana a las 5', origin: 'siri' }, deps);
    expect(cal.created).toEqual([
      expect.objectContaining({ calendarId: 'tareas-id', e: expect.objectContaining({ title: 'Llamar al gestor' }) }),
    ]);
    expect(res.items[0]).toMatchObject({ area: 'personal', hasTime: true, calendarEventId: 'ev-1', syncError: null });
    expect((await items.listItems())[0].calendarEventId).toBe('ev-1');
    expect(res.eventIds).toEqual([]);
  });

  it('si Calendar falla, la tarea se guarda con syncError', async () => {
    const cal = fakeCalendar({ createError: Object.assign(new Error('Unauthorized'), { status: 401 }) });
    const { deps } = setup(
      aiReturning([{ kind: 'tarea', title: 'Llamar al gestor', date: '2026-10-22', time: '17:00', confidence: 0.9 }]).ai,
      cal,
    );
    const res = await captureText({ text: 'llamar al gestor mañana a las 5', origin: 'siri' }, deps);
    expect(res.items[0]).toMatchObject({ needsReview: false, calendarEventId: null, syncError: 'calendar_auth' });
  });
});

describe('captureText: duplicados', () => {
  it('el mismo texto dos veces en < 30 s no se duplica y devuelve el resultado anterior', async () => {
    const { ai } = aiReturning([{ kind: 'compra', title: 'Leche', confidence: 0.9 }]);
    const { db, deps } = setup(ai);
    const first = await captureText({ text: 'Comprar leche', origin: 'siri' }, deps);
    const again = await captureText(
      { text: '  comprar   LECHE ', origin: 'siri' },
      { ...deps, now: new Date(NOW.getTime() + 29_000) },
    );
    expect(again).toEqual(first);
    expect(db.tables.items).toHaveLength(1);
  });

  it('dos peticiones simultáneas iguales comparten un único guardado', async () => {
    const { db, deps } = setup(aiReturning([{ kind: 'compra', title: 'Leche', confidence: 0.9 }]).ai);
    const [a, b] = await Promise.all([
      captureText({ text: 'comprar leche', origin: 'siri' }, deps),
      captureText({ text: 'comprar leche', origin: 'siri' }, deps),
    ]);
    expect(a).toEqual(b);
    expect(db.tables.items).toHaveLength(1);
  });

  it('pasados 30 s, el mismo texto se guarda otra vez', async () => {
    const { db, deps } = setup(aiReturning([{ kind: 'compra', title: 'Leche', confidence: 0.9 }]).ai);
    await captureText({ text: 'comprar leche', origin: 'siri' }, deps);
    await captureText({ text: 'comprar leche', origin: 'siri' }, { ...deps, now: new Date(NOW.getTime() + 30_000) });
    expect(db.tables.items).toHaveLength(2);
  });

  it('el mismo texto con otra área, u otro usuario, no es un duplicado', async () => {
    const { db, deps } = setup(aiReturning([{ kind: 'tarea', title: 'Informe', confidence: 0.9 }]).ai);
    await captureText({ text: 'informe', origin: 'siri' }, deps);
    await captureText({ text: 'informe', area: 'trabajo', origin: 'siri' }, deps);
    await captureText({ text: 'informe', origin: 'siri' }, { ...deps, userId: 'otro' });
    expect(db.tables.items).toHaveLength(3);
  });

  it('si el guardado falla, un reintento inmediato no se descarta como duplicado', async () => {
    const { db, deps } = setup(aiThrowing());
    const broken = { ...deps, items: { ...deps.items, createItem: async () => Promise.reject(new Error('db down')) } };
    await expect(captureText({ text: 'comprar leche', origin: 'siri' }, broken)).rejects.toThrow('db down');
    await captureText({ text: 'comprar leche', origin: 'siri' }, deps);
    expect(db.tables.items).toHaveLength(1);
  });
});
