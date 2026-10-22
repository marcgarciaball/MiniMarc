import { describe, expect, it } from 'vitest';
import type { AiProvider } from '@/lib/ai/provider';
import { CalendarError, type CalendarEvent, type CalendarGateway } from '@/lib/calendar/client';
import { buildDigest, CALM_HEADLINE, FALLBACK_HEADLINE, MAX_TASKS_PER_AREA, type DigestDeps } from '@/lib/digest/build';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import type { NewItem } from '@/lib/db/types';
import { madridToUtc } from '@/lib/time';

const TZ = 'Europe/Madrid';
/** Thursday 22 Oct 2026, 08:00 in Madrid. */
const DATE = '2026-10-22';
const NOW = madridToUtc(DATE, '08:00', TZ);

const due = (date: string, time?: string) => ({
  dueAt: madridToUtc(date, time ?? '00:00', TZ).toISOString(),
  hasTime: Boolean(time),
});

function fakeAi(reply: string | Error = 'Hoy tienes 1 tarea personal.') {
  const prompts: string[] = [];
  const ai: AiProvider = {
    async generateJson() {
      throw new Error('not used');
    },
    async generateText(prompt) {
      prompts.push(prompt);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { ai, prompts };
}

function fakeCalendar(events: CalendarEvent[] | Error) {
  const ranges: { from: Date; to: Date }[] = [];
  const gw: CalendarGateway = {
    async createEvent() {
      throw new Error('not used');
    },
    async updateEvent() {},
    async deleteEvent() {},
    async listEvents(range) {
      ranges.push(range);
      if (events instanceof Error) throw events;
      return events;
    },
    async ensureCalendar() {
      return 'tareas';
    },
  };
  return { gw, ranges };
}

function ev(id: string, title: string, time: string): CalendarEvent {
  const startsAt = madridToUtc(DATE, time, TZ);
  return {
    id,
    title,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 60_000),
    calendarId: 'primary',
    hasRequiredReminders: true,
  };
}

function setup(opts: { ai?: AiProvider; events?: CalendarEvent[] | Error } = {}) {
  const db = createMemoryBackend({ now: () => NOW });
  const items = createItemsRepo(db, { now: () => NOW });
  const people = createPeopleRepo(db);
  const ai = opts.ai ?? fakeAi().ai;
  const cal = fakeCalendar(opts.events ?? []);
  const deps: DigestDeps = { items, people, calendar: async () => cal.gw, ai, tz: TZ, now: NOW };
  const add = (i: NewItem) => items.createItem(i);
  return { deps, items, people, add, ranges: cal.ranges };
}

describe('buildDigest', () => {
  it('never sends Trabajo items, event titles or notes to the AI (sentinels)', async () => {
    const { ai, prompts } = fakeAi();
    const s = setup({ ai, events: [ev('e1', 'Reunión SENTINELA_CITA', '10:00')] });
    await s.add({ type: 'tarea', title: 'Informe SENTINELA_TRABAJO', area: 'trabajo', ...due(DATE, '09:00') });
    await s.add({
      type: 'tarea',
      title: 'Comprar pan',
      area: 'personal',
      notes: 'SENTINELA_NOTA',
      sourceText: 'texto SENTINELA_FUENTE',
      ...due(DATE),
    });

    const d = await buildDigest(DATE, s.deps);

    expect(prompts).toHaveLength(1);
    const p = prompts[0];
    expect(p).toContain('Comprar pan');
    for (const sentinel of ['SENTINELA_TRABAJO', 'SENTINELA_CITA', 'SENTINELA_NOTA', 'SENTINELA_FUENTE']) {
      expect(p).not.toContain(sentinel);
    }
    // The digest itself still shows them.
    expect(d.events.map((e) => e.title)).toEqual(['Reunión SENTINELA_CITA']);
    expect(d.tasks.trabajo.items.map((t) => t.item.title)).toEqual(['Informe SENTINELA_TRABAJO']);
    expect(d.headline).toBe('Hoy tienes 1 tarea personal.');
  });

  it('asks Calendar for the whole Madrid day', async () => {
    const s = setup();
    await buildDigest(DATE, s.deps);
    expect(s.ranges).toEqual([{ from: new Date('2026-10-21T22:00:00.000Z'), to: new Date('2026-10-22T22:00:00.000Z') }]);
  });

  it('with the AI down, the headline is "Buenos días" and the digest is complete', async () => {
    const s = setup({ ai: fakeAi(new Error('quota')).ai, events: [ev('e1', 'Dentista', '17:00')] });
    await s.add({ type: 'tarea', title: 'Llamar a mamá', area: 'personal', ...due(DATE) });
    await s.add({ type: 'tarea', title: 'Revisar PR', area: 'trabajo', ...due(DATE) });

    const d = await buildDigest(DATE, s.deps);

    expect(FALLBACK_HEADLINE).toBe('Buenos días');
    expect(d.headline).toBe('Buenos días');
    expect(d.events).toHaveLength(1);
    expect(d.tasks.personal.items).toHaveLength(1);
    expect(d.tasks.trabajo.items).toHaveLength(1);
  });

  it('a Calendar failure leaves events empty with a flag', async () => {
    const auth = setup({ events: new CalendarError('auth', 'revoked') });
    const a = await buildDigest(DATE, auth.deps);
    expect(a.events).toEqual([]);
    expect(a.calendarError).toBe('calendar_auth');

    const down = setup({ events: new Error('503') });
    const b = await buildDigest(DATE, down.deps);
    expect(b.calendarError).toBe('calendar_unavailable');

    const ok = await buildDigest(DATE, setup().deps);
    expect(ok.calendarError).toBeNull();
  });

  it('a birthday in 10 days includes that person\'s gift ideas; one in 20 days is left out', async () => {
    const { ai, prompts } = fakeAi();
    const s = setup({ ai });
    const ana = await s.people.upsertPersonByName('Ana');
    await s.people.updatePerson(ana.id, { birthday: '1990-11-01' });
    const luis = await s.people.upsertPersonByName('Luis');
    await s.people.updatePerson(luis.id, { birthday: '1985-11-11' });
    await s.add({ type: 'regalo', title: 'Libro de cocina', personId: ana.id });
    await s.add({ type: 'regalo', title: 'Ya regalado', personId: ana.id, status: 'hecho' });
    await s.add({ type: 'regalo', title: 'Bufanda', personId: luis.id });

    const d = await buildDigest(DATE, s.deps);

    expect(d.birthdays).toHaveLength(1);
    expect(d.birthdays[0].person.name).toBe('Ana');
    expect(d.birthdays[0].daysLeft).toBe(10);
    expect(d.birthdays[0].date).toBe('2026-11-01');
    expect(d.birthdays[0].giftIdeas.map((g) => g.title)).toEqual(['Libro de cocina']);
    expect(prompts[0]).toContain('Ana');
    expect(prompts[0]).toContain('10');
    expect(prompts[0]).not.toContain('Luis');
  });

  it('birthdays cross the year end', async () => {
    const s = setup();
    const p = await s.people.upsertPersonByName('Eva');
    await s.people.updatePerson(p.id, { birthday: '2000-01-03' });
    const d = await buildDigest('2026-12-25', s.deps);
    expect(d.birthdays.map((b) => [b.person.name, b.daysLeft, b.date])).toEqual([['Eva', 9, '2027-01-03']]);
  });

  it('splits overdue and today tasks by area, overdue first, then timed, then untimed', async () => {
    const s = setup();
    await s.add({ type: 'tarea', title: 'Sin hora', area: 'personal', ...due(DATE) });
    await s.add({ type: 'tarea', title: 'A las 18', area: 'personal', ...due(DATE, '18:00') });
    await s.add({ type: 'tarea', title: 'A las 9', area: 'personal', ...due(DATE, '09:00') });
    await s.add({ type: 'tarea', title: 'Vencida', area: 'personal', ...due('2026-10-20') });
    await s.add({ type: 'tarea', title: 'Sin área', ...due(DATE, '12:00') });
    await s.add({ type: 'tarea', title: 'Mañana', area: 'personal', ...due('2026-10-23') });
    await s.add({ type: 'tarea', title: 'Sin fecha', area: 'personal' });
    await s.add({ type: 'tarea', title: 'Hecha', area: 'personal', status: 'hecho', ...due(DATE) });
    await s.add({ type: 'compra', title: 'Leche', area: 'personal', ...due(DATE) });
    await s.add({ type: 'tarea', title: 'Vencida trabajo', area: 'trabajo', ...due('2026-10-21', '23:30') });

    const d = await buildDigest(DATE, s.deps);

    expect(d.tasks.personal.items.map((t) => [t.item.title, t.overdue])).toEqual([
      ['Vencida', true],
      ['A las 9', false],
      ['Sin área', false],
      ['A las 18', false],
      ['Sin hora', false],
    ]);
    expect(d.tasks.trabajo.items.map((t) => [t.item.title, t.overdue])).toEqual([['Vencida trabajo', true]]);
  });

  it('fits one screen: at most 5 tasks per area, the rest as "more"', async () => {
    const s = setup();
    for (let h = 9; h < 17; h++) {
      await s.add({ type: 'tarea', title: `T${h}`, area: 'trabajo', ...due(DATE, `${h}:00`) });
    }
    const d = await buildDigest(DATE, s.deps);
    expect(MAX_TASKS_PER_AREA).toBe(5);
    expect(d.tasks.trabajo.items.map((t) => t.item.title)).toEqual(['T9', 'T10', 'T11', 'T12', 'T13']);
    expect(d.tasks.trabajo.more).toBe(3);
    expect(d.tasks.personal).toEqual({ items: [], more: 0 });
  });

  it('counts items to review apart and leaves them out of the lists', async () => {
    const { ai, prompts } = fakeAi();
    const s = setup({ ai });
    await s.add({ type: 'tarea', title: 'Dudosa', area: 'personal', needsReview: true, ...due(DATE) });
    await s.add({ type: 'idea', title: 'Otra', needsReview: true });

    const d = await buildDigest(DATE, s.deps);

    expect(d.unclassified).toBe(2);
    expect(d.tasks.personal.items).toEqual([]);
    expect(prompts).toEqual([]);
  });

  it('skips the AI when there is nothing personal to say', async () => {
    const { ai, prompts } = fakeAi();
    const s = setup({ ai, events: [ev('e1', 'Reunión', '10:00')] });
    await s.add({ type: 'tarea', title: 'Revisar PR', area: 'trabajo', ...due(DATE) });

    const d = await buildDigest(DATE, s.deps);

    expect(prompts).toEqual([]);
    expect(d.headline).toBe(FALLBACK_HEADLINE);

    const empty = await buildDigest(DATE, setup({ ai }).deps);
    expect(empty.headline).toBe(CALM_HEADLINE);
    expect(prompts).toEqual([]);
  });

  it('the prompt names the weekday and date and forbids fluff and emojis', async () => {
    const { ai, prompts } = fakeAi();
    const s = setup({ ai });
    await s.add({ type: 'tarea', title: 'Comprar pan', area: 'personal', ...due(DATE) });
    await buildDigest(DATE, s.deps);
    expect(prompts[0]).toContain('jueves, 22 de octubre');
    expect(prompts[0]).toMatch(/emojis/i);
    expect(prompts[0]).toMatch(/motivaci/i);
  });

  it('cleans the AI reply and falls back when it is empty or too long', async () => {
    const run = async (reply: string) => {
      const s = setup({ ai: fakeAi(reply).ai });
      await s.add({ type: 'tarea', title: 'Comprar pan', area: 'personal', ...due(DATE) });
      return (await buildDigest(DATE, s.deps)).headline;
    };
    expect(await run('  "Hoy toca comprar pan."\n')).toBe('Hoy toca comprar pan.');
    expect(await run('   ')).toBe('Buenos días');
    expect(await run('x'.repeat(200))).toBe('Buenos días');
  });

  it('gives up on a slow AI after the timeout', async () => {
    const ai: AiProvider = {
      async generateJson() {
        throw new Error('not used');
      },
      generateText: () => new Promise<string>(() => {}),
    };
    const s = setup({ ai });
    await s.add({ type: 'tarea', title: 'Comprar pan', area: 'personal', ...due(DATE) });
    const d = await buildDigest(DATE, { ...s.deps, aiTimeoutMs: 20 });
    expect(d.headline).toBe('Buenos días');
  });
});
