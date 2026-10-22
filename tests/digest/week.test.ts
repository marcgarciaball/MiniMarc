import { describe, expect, it } from 'vitest';
import type { AiProvider } from '@/lib/ai/provider';
import { CalendarError, type CalendarEvent, type CalendarGateway } from '@/lib/calendar/client';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import type { NewItem } from '@/lib/db/types';
import type { DigestDeps } from '@/lib/digest/build';
import { buildWeekDigest, CALM_WEEK, MAX_WEEK_TASKS_PER_AREA, weekCounts, weekSummaryLine } from '@/lib/digest/week';
import { madridToUtc } from '@/lib/time';

const TZ = 'Europe/Madrid';
/** Monday 19 Oct 2026; the week ends on Sunday 25 Oct, the day clocks go back (CEST → CET). */
const WEEK = '2026-10-19';
/** Thursday 22 Oct 2026, 08:00 in Madrid. */
const NOW = madridToUtc('2026-10-22', '08:00', TZ);

const due = (date: string, time?: string) => ({
  dueAt: madridToUtc(date, time ?? '00:00', TZ).toISOString(),
  hasTime: Boolean(time),
});

function fakeAi(reply: string | Error = 'Semana con pan y un cumpleaños.') {
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
    async setRequiredReminders() {},
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

function ev(id: string, title: string, date: string, time: string, minutes = 30): CalendarEvent {
  const startsAt = madridToUtc(date, time, TZ);
  return {
    id,
    title,
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * 60_000),
    calendarId: 'primary',
    hasRequiredReminders: true,
  };
}

function setup(opts: { ai?: AiProvider; events?: CalendarEvent[] | Error; now?: Date } = {}) {
  const now = opts.now ?? NOW;
  const db = createMemoryBackend({ now: () => now });
  const items = createItemsRepo(db, { now: () => now });
  const people = createPeopleRepo(db);
  const ai = opts.ai ?? fakeAi().ai;
  const cal = fakeCalendar(opts.events ?? []);
  const deps: DigestDeps = { items, people, calendar: async () => cal.gw, ai, tz: TZ, now };
  const add = (i: NewItem) => items.createItem(i);
  return { deps, items, people, add, ranges: cal.ranges };
}

describe('buildWeekDigest', () => {
  it('never sends Trabajo, event titles, notes or gift ideas to the AI (sentinels)', async () => {
    const { ai, prompts } = fakeAi();
    const s = setup({ ai, events: [ev('e1', 'Reunión SENTINELA_CITA', '2026-10-20', '10:00')] });
    await s.add({ type: 'tarea', title: 'Informe SENTINELA_TRABAJO', area: 'trabajo', ...due('2026-10-21', '09:00') });
    await s.add({
      type: 'tarea',
      title: 'Comprar pan',
      area: 'personal',
      notes: 'SENTINELA_NOTA',
      sourceText: 'texto SENTINELA_FUENTE',
      ...due('2026-10-23'),
    });
    const ana = await s.people.upsertPersonByName('Ana');
    await s.people.updatePerson(ana.id, { birthday: '1990-10-24', notes: 'SENTINELA_PERSONA' });
    await s.people.addDate({ personId: ana.id, label: 'Santo', date: '2000-10-20', notes: 'SENTINELA_FECHA' });
    await s.add({ type: 'regalo', title: 'SENTINELA_REGALO', notes: 'SENTINELA_NOTA_REGALO', personId: ana.id });

    const w = await buildWeekDigest(WEEK, s.deps);

    expect(prompts).toHaveLength(1);
    const p = prompts[0];
    expect(p).toContain('Comprar pan');
    expect(p).toContain('Ana');
    expect(p).toContain('Cumpleaños');
    for (const sentinel of [
      'SENTINELA_TRABAJO',
      'SENTINELA_CITA',
      'SENTINELA_NOTA',
      'SENTINELA_FUENTE',
      'SENTINELA_PERSONA',
      'SENTINELA_FECHA',
      'SENTINELA_REGALO',
    ]) {
      expect(p).not.toContain(sentinel);
    }
    expect(p).toMatch(/emojis/i);
    expect(p).toContain('19 de octubre');
    // The digest itself still shows everything.
    expect(w.headline).toBe('Semana con pan y un cumpleaños.');
    expect(w.tasks.trabajo.items.map((t) => t.item.title)).toEqual(['Informe SENTINELA_TRABAJO']);
    expect(w.days[1].events.map((e) => e.title)).toEqual(['Reunión SENTINELA_CITA']);
  });

  it('asks Calendar for the 7 Madrid days, across the October DST change', async () => {
    const s = setup();
    const w = await buildWeekDigest(WEEK, s.deps);
    expect(s.ranges).toEqual([{ from: new Date('2026-10-18T22:00:00.000Z'), to: new Date('2026-10-25T23:00:00.000Z') }]);
    expect(w.weekStart).toBe(WEEK);
    expect(w.today).toBe('2026-10-22');
    expect(w.days.map((d) => d.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });

  it('a date that is not a Monday is taken as its week', async () => {
    const s = setup();
    const w = await buildWeekDigest('2026-10-22', s.deps);
    expect(w.weekStart).toBe(WEEK);
  });

  it('puts each event and task on its Madrid day (late Sunday under CET included)', async () => {
    const s = setup({
      events: [
        ev('e2', 'Cena', '2026-10-25', '23:30', 20),
        ev('e1', 'Dentista', '2026-10-19', '09:00'),
        ev('e3', 'Viaje', '2026-10-21', '20:00', 24 * 60),
      ],
    });
    await s.add({ type: 'tarea', title: 'Llamar', area: 'personal', ...due('2026-10-19', '18:00') });
    await s.add({ type: 'tarea', title: 'Revisar', area: 'trabajo', ...due('2026-10-25') });

    const w = await buildWeekDigest(WEEK, s.deps);

    const byDay = Object.fromEntries(w.days.map((d) => [d.date, [...d.events.map((e) => e.title), ...d.tasks.map((t) => t.item.title)]]));
    expect(byDay).toEqual({
      '2026-10-19': ['Dentista', 'Llamar'],
      '2026-10-20': [],
      '2026-10-21': ['Viaje'],
      '2026-10-22': ['Viaje'],
      '2026-10-23': [],
      '2026-10-24': [],
      '2026-10-25': ['Cena', 'Revisar'],
    });
  });

  it('week tasks per area, plus overdue ones; tasks after the week are left out', async () => {
    const s = setup();
    await s.add({ type: 'tarea', title: 'Vencida antigua', area: 'personal', ...due('2026-10-10') });
    await s.add({ type: 'tarea', title: 'Lunes sin hacer', area: 'personal', ...due('2026-10-19') });
    await s.add({ type: 'tarea', title: 'Viernes', area: 'personal', ...due('2026-10-23', '10:00') });
    await s.add({ type: 'tarea', title: 'Sin área', ...due('2026-10-24') });
    await s.add({ type: 'tarea', title: 'Informe', area: 'trabajo', ...due('2026-10-21') });
    await s.add({ type: 'tarea', title: 'Semana siguiente', area: 'personal', ...due('2026-10-26') });
    await s.add({ type: 'tarea', title: 'Hecha', area: 'personal', status: 'hecho', ...due('2026-10-23') });
    await s.add({ type: 'tarea', title: 'Sin fecha', area: 'personal' });

    const w = await buildWeekDigest(WEEK, s.deps);

    expect(w.tasks.personal.items.map((t) => [t.item.title, t.overdue])).toEqual([
      ['Vencida antigua', true],
      ['Lunes sin hacer', true],
      ['Viernes', false],
      ['Sin área', false],
    ]);
    expect(w.tasks.trabajo.items.map((t) => [t.item.title, t.overdue])).toEqual([['Informe', true]]);
    // The day rows only hold the week's own tasks.
    expect(w.days.flatMap((d) => d.tasks.map((t) => t.item.title))).toEqual(['Lunes sin hacer', 'Informe', 'Viernes', 'Sin área']);
  });

  it('next week (the Sunday push) still lists overdue tasks; a past week does not repeat older ones', async () => {
    const s = setup();
    await s.add({ type: 'tarea', title: 'Vencida', area: 'personal', ...due('2026-10-10') });
    await s.add({ type: 'tarea', title: 'Pasada', area: 'personal', ...due('2026-10-14') });
    await s.add({ type: 'tarea', title: 'Jueves', area: 'personal', ...due('2026-10-22') });

    const next = await buildWeekDigest('2026-10-26', s.deps);
    expect(next.tasks.personal.items.map((t) => t.item.title)).toEqual(['Vencida', 'Pasada']);

    const past = await buildWeekDigest('2026-10-12', s.deps);
    expect(past.tasks.personal.items.map((t) => [t.item.title, t.overdue])).toEqual([['Pasada', true]]);
  });

  it(`caps each area at ${MAX_WEEK_TASKS_PER_AREA}, the rest as "more"`, async () => {
    const s = setup();
    for (let h = 8; h < 20; h++) await s.add({ type: 'tarea', title: `T${h}`, area: 'trabajo', ...due('2026-10-23', `${h}:00`) });
    const w = await buildWeekDigest(WEEK, s.deps);
    expect(w.tasks.trabajo.items).toHaveLength(MAX_WEEK_TASKS_PER_AREA);
    expect(w.tasks.trabajo.more).toBe(12 - MAX_WEEK_TASKS_PER_AREA);
  });

  it('dates in the week (not after it) with gift ideas', async () => {
    const s = setup();
    const ana = await s.people.upsertPersonByName('Ana');
    await s.people.updatePerson(ana.id, { birthday: '1990-10-24' });
    const luis = await s.people.upsertPersonByName('Luis');
    await s.people.updatePerson(luis.id, { birthday: '1985-10-26' });
    await s.add({ type: 'regalo', title: 'Libro', personId: ana.id });

    const w = await buildWeekDigest(WEEK, s.deps);

    expect(w.dates.map((d) => [d.person.name, d.date, d.giftIdeas.map((g) => g.title)])).toEqual([['Ana', '2026-10-24', ['Libro']]]);
  });

  it('counts unclassified items and leaves them out', async () => {
    const s = setup();
    await s.add({ type: 'tarea', title: 'Dudosa', area: 'personal', needsReview: true, ...due('2026-10-23') });
    const w = await buildWeekDigest(WEEK, s.deps);
    expect(w.unclassified).toBe(1);
    expect(w.tasks.personal.items).toEqual([]);
  });

  it('skips the AI when there is nothing personal to say', async () => {
    const { ai, prompts } = fakeAi();
    const s = setup({ ai, events: [ev('e1', 'Reunión', '2026-10-20', '10:00')] });
    await s.add({ type: 'tarea', title: 'Informe', area: 'trabajo', ...due('2026-10-21') });
    // An overdue personal task from before the week is not news about this week.
    await s.add({ type: 'tarea', title: 'Vieja', area: 'personal', ...due('2026-10-01') });

    const w = await buildWeekDigest(WEEK, s.deps);

    expect(prompts).toEqual([]);
    expect(w.headline).toBeNull();
  });

  it('with the AI down there is no line, and the week is still complete', async () => {
    const s = setup({ ai: fakeAi(new Error('quota')).ai, events: [ev('e1', 'Dentista', '2026-10-20', '17:00')] });
    await s.add({ type: 'tarea', title: 'Comprar pan', area: 'personal', ...due('2026-10-23') });
    const w = await buildWeekDigest(WEEK, s.deps);
    expect(w.headline).toBeNull();
    expect(w.days[1].events).toHaveLength(1);
    expect(w.tasks.personal.items).toHaveLength(1);
  });

  it('a Calendar failure leaves the days without events and a calm flag', async () => {
    const auth = await buildWeekDigest(WEEK, setup({ events: new CalendarError('auth', 'revoked') }).deps);
    expect(auth.calendarError).toBe('calendar_auth');
    expect(auth.days.every((d) => d.events.length === 0)).toBe(true);
    const down = await buildWeekDigest(WEEK, setup({ events: new Error('503') }).deps);
    expect(down.calendarError).toBe('calendar_unavailable');
  });
});

describe('weekCounts / weekSummaryLine', () => {
  it('counts events once (even across days), tasks, dates and unclassified', async () => {
    const s = setup({ events: [ev('e1', 'Viaje', '2026-10-21', '20:00', 24 * 60), ev('e2', 'Cena', '2026-10-23', '21:00')] });
    await s.add({ type: 'tarea', title: 'A', area: 'personal', ...due('2026-10-23') });
    await s.add({ type: 'tarea', title: 'B', area: 'trabajo', ...due('2026-10-24') });
    await s.add({ type: 'idea', title: 'C', needsReview: true });
    const ana = await s.people.upsertPersonByName('Ana');
    await s.people.updatePerson(ana.id, { birthday: '1990-10-24' });

    const w = await buildWeekDigest(WEEK, s.deps);

    expect(weekCounts(w)).toEqual({ events: 2, tasks: 2, dates: 1, unclassified: 1 });
    expect(weekSummaryLine(w)).toBe('2 citas · 2 tareas · 1 fecha · 1 sin clasificar');
  });

  it('an empty week reads calm', async () => {
    const w = await buildWeekDigest(WEEK, setup().deps);
    expect(weekSummaryLine(w)).toBe(CALM_WEEK);
  });
});
