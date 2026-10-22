import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/agenda/week';
import { CalendarError, type CalendarGateway } from '@/lib/calendar/client';
import { digestPayload, handleMorningRequest, MAINTENANCE_CAP, runMorning, weeklyPayload, type MorningDeps } from '@/lib/cron/morning';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPhotosRepo } from '@/lib/db/photos';
import type { PushSub } from '@/lib/db/push';
import type { Settings, SettingsRepo } from '@/lib/db/settings';
import type { Item, NewItem } from '@/lib/db/types';
import type { Digest, DigestDate } from '@/lib/digest/build';
import type { WeekDigest } from '@/lib/digest/week';
import type { PushPayload } from '@/lib/push/send';
import { madridToUtc } from '@/lib/time';

const TZ = 'Europe/Madrid';
const DAY = 24 * 60 * 60 * 1000;
const AT_8 = madridToUtc('2026-10-22', '08:00', TZ);
const AT_7 = madridToUtc('2026-10-22', '07:00', TZ);

function item(over: Partial<Item>): Item {
  return {
    id: 'x',
    type: 'tarea',
    title: 't',
    notes: null,
    area: 'personal',
    dueAt: null,
    hasTime: false,
    status: 'pendiente',
    personId: null,
    origin: 'web',
    needsReview: false,
    confidence: null,
    calendarEventId: null,
    syncError: null,
    sourceText: null,
    author: null,
    readingState: null,
    link: null,
    linkTitle: null,
    linkImage: null,
    linkSite: null,
    createdAt: '2026-10-01T00:00:00Z',
    deletedAt: null,
    ...over,
  };
}

function digest(over: Partial<Digest> = {}): Digest {
  return {
    date: '2026-10-22',
    events: [
      { id: 'e1', title: 'SENTINELA_CITA reunión', startsAt: AT_8.toISOString(), endsAt: AT_8.toISOString() },
      { id: 'e2', title: 'Dentista', startsAt: AT_8.toISOString(), endsAt: AT_8.toISOString() },
    ],
    calendarError: null,
    tasks: {
      personal: { items: [{ item: item({ id: 'p1', title: 'Comprar pan' }), overdue: false }], more: 0 },
      trabajo: { items: [{ item: item({ id: 't1', title: 'SENTINELA_TRABAJO informe', area: 'trabajo' }), overdue: true }], more: 2 },
    },
    unclassified: 1,
    dates: [],
    headline: 'Hoy toca comprar pan.',
    ...over,
  };
}

function week(over: Partial<WeekDigest> = {}): WeekDigest {
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: addDays('2026-10-26', i),
    events: [] as WeekDigest['days'][number]['events'],
    tasks: [] as WeekDigest['days'][number]['tasks'],
  }));
  days[0].events = [{ id: 'e1', title: 'SENTINELA_CITA', startsAt: AT_8.toISOString(), endsAt: AT_8.toISOString() }];
  days[1].tasks = [{ item: item({ id: 't1', title: 'SENTINELA_TRABAJO', area: 'trabajo' }), overdue: false }];
  return {
    weekStart: '2026-10-26',
    today: '2026-10-26',
    days,
    calendarError: null,
    tasks: {
      personal: { items: [{ item: item({ id: 'p1', title: 'SENTINELA_PERSONAL' }), overdue: false }], more: 0 },
      trabajo: { items: [{ item: item({ id: 't1', title: 'SENTINELA_TRABAJO', area: 'trabajo' }), overdue: false }], more: 0 },
    },
    unclassified: 0,
    dates: [],
    headline: 'Semana con pan.',
    ...over,
  };
}

function fakeSettings(initial: Partial<Settings> = {}, fail = false) {
  const state: Settings = {
    digestHour: 8,
    tz: TZ,
    lastDigestDate: '2026-10-21',
    headline: null,
    headlineDate: null,
    weeklyDigest: 'lunes',
    lastWeeklyDate: '2026-10-19',
    weekHeadline: null,
    weekHeadlineWeek: null,
    ...initial,
  };
  const repo: SettingsRepo = {
    async get() {
      if (fail) throw new Error('db down');
      return { ...state };
    },
    async update(patch) {
      Object.assign(state, patch);
    },
  };
  return { state, repo };
}

function fakeCalendar(fail?: Error) {
  const created: string[] = [];
  const deleted: string[] = [];
  const gw: CalendarGateway = {
    async createEvent(_c, e) {
      if (fail) throw fail;
      created.push(e.title);
      return `ev-${created.length}`;
    },
    async updateEvent() {
      if (fail) throw fail;
    },
    async setRequiredReminders() {},
    async deleteEvent(_c, id) {
      if (fail) throw fail;
      deleted.push(id);
    },
    async listEvents() {
      return [];
    },
    async ensureCalendar() {
      if (fail) throw fail;
      return 'tareas';
    },
  };
  return { gw, created, deleted };
}

function setup(opts: {
  now?: Date;
  settings?: Partial<Settings>;
  settingsFail?: boolean;
  subs?: PushSub[];
  failPushFor?: string[];
  digest?: Digest | Error;
  week?: WeekDigest | Error;
  settingsUpdateFail?: (keyof Settings)[];
  calendarFail?: Error;
  storageFail?: boolean;
} = {}) {
  let now = opts.now ?? AT_8;
  const clock = () => now;
  const db = createMemoryBackend({ now: clock });
  const items = createItemsRepo(db, { now: clock });
  const settings = fakeSettings(opts.settings, opts.settingsFail);
  const cal = fakeCalendar(opts.calendarFail);
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const built: string[] = [];
  const builtWeeks: string[] = [];
  if (opts.settingsUpdateFail) {
    const update = settings.repo.update;
    settings.repo.update = async (patch) => {
      if (Object.keys(patch).some((k) => opts.settingsUpdateFail!.includes(k as keyof Settings))) throw new Error('db down');
      return update(patch);
    };
  }
  const photos = createPhotosRepo(db);
  const removedObjects: string[] = [];
  const storage = {
    async remove(paths: string[]) {
      if (opts.storageFail) throw new Error('storage down');
      removedObjects.push(...paths);
    },
  };
  const invalidated: (readonly string[])[] = [];
  const deps: MorningDeps = {
    now: opts.now ?? AT_8,
    settings: settings.repo,
    items,
    calendar: async () => cal.gw,
    async buildDigest(date) {
      built.push(date);
      const d = opts.digest ?? digest();
      if (d instanceof Error) throw d;
      return d;
    },
    async buildWeekDigest(weekStart) {
      builtWeeks.push(weekStart);
      const w = opts.week ?? week({ weekStart });
      if (w instanceof Error) throw w;
      return w;
    },
    async subscriptions() {
      return opts.subs ?? [{ endpoint: 'https://push/a', p256dh: 'p', auth: 'a' }];
    },
    async sendPush(sub, payload) {
      if (opts.failPushFor?.includes(sub.endpoint)) throw new Error('push down');
      sent.push({ endpoint: sub.endpoint, payload });
    },
    photos,
    storage,
    invalidate: (scopes) => void invalidated.push(scopes),
  };
  const create = (n: NewItem) => items.createItem(n);
  const setNow = (d: Date) => (now = d);
  return { deps, db, items, settings, cal, sent, built, builtWeeks, create, setNow, photos, removedObjects, invalidated };
}

describe('runMorning · resumen', () => {
  it('antes de la hora: no genera ni envía nada', async () => {
    const t = setup({ now: AT_7 });
    const r = await runMorning(t.deps);
    expect(r.digest).toBe('not_due');
    expect(t.built).toEqual([]);
    expect(t.sent).toEqual([]);
    expect(t.settings.state.lastDigestDate).toBe('2026-10-21');
  });

  it('ya enviado hoy: no repite', async () => {
    const t = setup({ settings: { lastDigestDate: '2026-10-22' } });
    expect((await runMorning(t.deps)).digest).toBe('not_due');
    expect(t.sent).toEqual([]);
  });

  it('a la hora: genera el resumen de la fecha local, lo envía a cada suscripción y guarda last_digest_date', async () => {
    const subs = [
      { endpoint: 'https://push/a', p256dh: 'p', auth: 'a' },
      { endpoint: 'https://push/b', p256dh: 'p', auth: 'a' },
    ];
    const t = setup({ subs });
    const r = await runMorning(t.deps);
    expect(t.built).toEqual(['2026-10-22']);
    expect(t.sent.map((s) => s.endpoint)).toEqual(['https://push/a', 'https://push/b']);
    expect(t.settings.state.lastDigestDate).toBe('2026-10-22');
    expect(r).toMatchObject({ digest: 'sent', pushed: 2, pushFailed: 0 });
  });

  it('sin suscripciones también guarda last_digest_date (no reintenta toda la mañana)', async () => {
    const t = setup({ subs: [] });
    const r = await runMorning(t.deps);
    expect(r).toMatchObject({ digest: 'sent', pushed: 0 });
    expect(t.settings.state.lastDigestDate).toBe('2026-10-22');
  });

  it('si falla un envío, el resto sale y la fecha se guarda', async () => {
    const subs = [
      { endpoint: 'https://push/a', p256dh: 'p', auth: 'a' },
      { endpoint: 'https://push/b', p256dh: 'p', auth: 'a' },
    ];
    const t = setup({ subs, failPushFor: ['https://push/a'] });
    const r = await runMorning(t.deps);
    expect(r).toMatchObject({ pushed: 1, pushFailed: 1 });
    expect(t.settings.state.lastDigestDate).toBe('2026-10-22');
  });

  it('si generar el resumen falla, no guarda la fecha (la próxima hora reintenta)', async () => {
    const t = setup({ digest: new Error('db down') });
    const r = await runMorning(t.deps);
    expect(r.digest).toBe('failed');
    expect(t.sent).toEqual([]);
    expect(t.settings.state.lastDigestDate).toBe('2026-10-21');
  });

  it('si no se pueden leer los ajustes, el resumen falla pero el mantenimiento sigue', async () => {
    const t = setup({ settingsFail: true });
    const task = await t.create({ type: 'tarea', title: 'Llamar', dueAt: '2026-10-23T10:00:00Z', hasTime: true, syncError: 'calendar_unavailable' });
    const r = await runMorning(t.deps);
    expect(r.digest).toBe('failed');
    expect(r.synced).toBe(1);
    expect((await t.items.listItems()).find((i) => i.id === task.id)?.calendarEventId).toBe('ev-1');
  });
});

describe('runMorning · resumen semanal', () => {
  /** Monday 26 Oct 2026, 08:00 in Madrid (CET). */
  const MON_8 = madridToUtc('2026-10-26', '08:00', TZ);
  /** Sunday 25 Oct 2026, 20:00 in Madrid (the day clocks go back). */
  const SUN_20 = madridToUtc('2026-10-25', '20:00', TZ);

  it('un jueves no hay resumen semanal', async () => {
    const t = setup();
    const r = await runMorning(t.deps);
    expect(r.weekly).toBe('not_due');
    expect(t.builtWeeks).toEqual([]);
  });

  it('lunes 08:00: sale el diario y el semanal, cada uno con su etiqueta; guarda last_weekly_date', async () => {
    const t = setup({ now: MON_8, settings: { lastDigestDate: '2026-10-25' } });
    const r = await runMorning(t.deps);
    expect(r).toMatchObject({ digest: 'sent', pushed: 1, weekly: 'sent', weeklyPushed: 1 });
    expect(t.built).toEqual(['2026-10-26']);
    expect(t.builtWeeks).toEqual(['2026-10-26']);
    expect(t.sent.map((s) => s.payload.tag)).toEqual(['digest-2026-10-22', 'weekly-2026-10-26']);
    expect(t.settings.state).toMatchObject({ lastDigestDate: '2026-10-26', lastWeeklyDate: '2026-10-26' });

    // The 09:00 run sends neither again.
    t.deps.now = new Date(MON_8.getTime() + 60 * 60 * 1000);
    const again = await runMorning(t.deps);
    expect(again).toMatchObject({ digest: 'not_due', weekly: 'not_due' });
    expect(t.sent).toHaveLength(2);
  });

  it('domingo 20:00 con «Domingo»: resume la semana siguiente', async () => {
    const t = setup({ now: SUN_20, settings: { weeklyDigest: 'domingo', lastDigestDate: '2026-10-25' } });
    const r = await runMorning(t.deps);
    expect(r).toMatchObject({ digest: 'not_due', weekly: 'sent' });
    expect(t.builtWeeks).toEqual(['2026-10-26']);
    expect(t.sent[0].payload.url).toBe('/semana?w=2026-10-26');
  });

  it('desactivado: nada', async () => {
    const t = setup({ now: MON_8, settings: { weeklyDigest: 'off' } });
    expect((await runMorning(t.deps)).weekly).toBe('not_due');
    expect(t.builtWeeks).toEqual([]);
  });

  it('si el semanal falla, el diario sale igual y la semana se reintenta la hora siguiente', async () => {
    const t = setup({ now: MON_8, week: new Error('calendar down') });
    const r = await runMorning(t.deps);
    expect(r).toMatchObject({ digest: 'sent', pushed: 1, weekly: 'failed', weeklyPushed: 0 });
    expect(t.settings.state.lastWeeklyDate).toBe('2026-10-19');
  });

  it('si no se puede guardar last_weekly_date, no envía (nunca un aviso por hora)', async () => {
    const t = setup({ now: MON_8, settingsUpdateFail: ['lastWeeklyDate'] });
    const r = await runMorning(t.deps);
    expect(r).toMatchObject({ digest: 'sent', weekly: 'failed', weeklyPushed: 0 });
    expect(t.sent.map((s) => s.payload.title)).toEqual(['Hoy']);
  });
});

describe('weeklyPayload', () => {
  it('«Tu semana», la línea de la IA, abre /semana; sin títulos de tareas ni de citas', () => {
    const p = weeklyPayload(week());
    expect(p).toEqual({ title: 'Tu semana', body: 'Semana con pan.', url: '/semana?w=2026-10-26', tag: 'weekly-2026-10-26' });
    const json = JSON.stringify(p);
    for (const s of ['SENTINELA_TRABAJO', 'SENTINELA_CITA', 'SENTINELA_PERSONAL']) expect(json).not.toContain(s);
  });

  it('sin línea de la IA: recuentos', () => {
    expect(weeklyPayload(week({ headline: null })).body).toBe('1 cita · 2 tareas');
    const empty = week({ headline: null, days: week().days.map((d) => ({ ...d, events: [], tasks: [] })) });
    expect(weeklyPayload({ ...empty, tasks: { personal: { items: [], more: 0 }, trabajo: { items: [], more: 0 } } }).body).toBe(
      'Semana tranquila.',
    );
  });
});

describe('digestPayload', () => {
  it('título "Hoy", abre /hoy, titular + recuentos, sin títulos de trabajo ni de citas', () => {
    const p = digestPayload(digest());
    expect(p.title).toBe('Hoy');
    expect(p.url).toBe('/hoy');
    expect(p.body).toContain('Hoy toca comprar pan.');
    expect(p.body).toContain('2 citas');
    expect(p.body).toContain('4 tareas');
    expect(p.body).toContain('1 sin clasificar');
    const json = JSON.stringify(p);
    expect(json).not.toContain('SENTINELA_TRABAJO');
    expect(json).not.toContain('SENTINELA_CITA');
    expect(json).not.toContain('Comprar pan"');
  });

  it('singulares y día vacío', () => {
    const empty = digest({
      events: [digest().events[0]],
      tasks: { personal: { items: [], more: 0 }, trabajo: { items: [], more: 0 } },
      unclassified: 0,
      headline: 'Buenos días',
    });
    expect(digestPayload(empty).body).toBe('Buenos días\n1 cita');
    const none = digest({ ...empty, events: [] });
    expect(digestPayload(none).body).toBe('Buenos días');
  });

  const person = (name: string) => ({ id: `p-${name}`, name, birthday: null, notes: 'SENTINELA_NOTA_PERSONA' });
  const date = (over: Partial<DigestDate>): DigestDate => ({
    person: person('Ainhoa'),
    kind: 'date',
    dateId: 'd1',
    label: 'Aniversario',
    date: '2026-10-22',
    daysUntil: 0,
    giftIdeas: [],
    ...over,
  });

  it('con una fecha hoy, el título es la fecha: "Hoy: aniversario con Ainhoa (5 años)"', () => {
    const p = digestPayload(digest({ dates: [date({ yearsSince: 5 }), date({ person: person('Ana'), daysUntil: 3 })] }));
    expect(p.title).toBe('Hoy: aniversario con Ainhoa (5 años)');
    expect(p.body).toContain('2 fechas');
    expect(JSON.stringify(p)).not.toContain('SENTINELA_NOTA_PERSONA');
  });

  it('cumpleaños, santo, años desconocidos y varias fechas hoy', () => {
    const bday = date({ kind: 'birthday', dateId: null, label: 'Cumpleaños', person: person('Ana'), yearsSince: 35 });
    expect(digestPayload(digest({ dates: [bday] })).title).toBe('Hoy: cumpleaños de Ana (35 años)');
    expect(digestPayload(digest({ dates: [date({ label: 'Santo', person: person('Luis') })] })).title).toBe('Hoy: santo de Luis');
    expect(digestPayload(digest({ dates: [date({ label: 'Nos conocimos', yearsSince: 1 })] })).title).toBe(
      'Hoy: nos conocimos con Ainhoa (1 año)',
    );
    expect(digestPayload(digest({ dates: [date({ yearsSince: 5 }), bday] })).title).toBe(
      'Hoy: aniversario con Ainhoa (5 años) y 1 más',
    );
  });

  it('sin fechas hoy (solo próximas) el título sigue siendo "Hoy"', () => {
    const p = digestPayload(digest({ dates: [date({ daysUntil: 1 })] }));
    expect(p.title).toBe('Hoy');
    expect(p.body).toContain('1 fecha');
  });
});

describe('runMorning · mantenimiento', () => {
  it('reintenta la sincronización de una tarea pendiente con syncError', async () => {
    const t = setup({ now: AT_7 });
    const task = await t.create({ type: 'tarea', title: 'Llamar', dueAt: '2026-10-23T10:00:00Z', hasTime: true, syncError: 'calendar_unavailable' });
    const r = await runMorning(t.deps);
    expect(r).toMatchObject({ synced: 1, syncFailed: 0 });
    const after = (await t.items.listItems()).find((i) => i.id === task.id)!;
    expect(after).toMatchObject({ calendarEventId: 'ev-1', syncError: null });
  });

  it('borra el evento de una tarea hecha, archivada o eliminada (avisos huérfanos, I-3)', async () => {
    const t = setup({ now: AT_7 });
    const done = await t.create({ type: 'tarea', title: 'a', dueAt: '2026-10-23T10:00:00Z', hasTime: true, status: 'hecho', calendarEventId: 'ev-done' });
    const arch = await t.create({ type: 'tarea', title: 'b', dueAt: '2026-10-23T10:00:00Z', hasTime: true, status: 'archivado', calendarEventId: 'ev-arch', syncError: 'calendar_unavailable' });
    const del = await t.create({ type: 'tarea', title: 'c', dueAt: '2026-10-23T10:00:00Z', hasTime: true, calendarEventId: 'ev-del', syncError: 'calendar_auth' });
    const keep = await t.create({ type: 'tarea', title: 'd', dueAt: '2026-10-23T10:00:00Z', hasTime: true, calendarEventId: 'ev-keep' });
    await t.items.softDeleteItem(del.id);
    const r = await runMorning(t.deps);
    expect(t.cal.deleted.sort()).toEqual(['ev-arch', 'ev-del', 'ev-done']);
    expect(r.synced).toBe(3);
    const rows = t.db.tables.items;
    for (const id of [done.id, arch.id, del.id]) {
      expect(rows.find((x) => x.id === id)).toMatchObject({ calendar_event_id: null, sync_error: null });
    }
    expect(rows.find((x) => x.id === keep.id)).toMatchObject({ calendar_event_id: 'ev-keep' });
  });

  it('no borra el aviso de Calendar de un elemento de Sin clasificar sin evento (M-2)', async () => {
    const t = setup({ now: AT_7 });
    const cita = await t.create({ type: 'tarea', title: 'Dentista', dueAt: '2026-10-23T10:00:00Z', hasTime: true, needsReview: true, syncError: 'calendar_unavailable' });
    const r = await runMorning(t.deps);
    expect(r).toMatchObject({ synced: 0, syncFailed: 0 });
    expect(t.db.tables.items.find((x) => x.id === cita.id)).toMatchObject({ sync_error: 'calendar_unavailable', calendar_event_id: null });
  });

  it('un elemento de Sin clasificar con evento sí se limpia (el evento se borra)', async () => {
    const t = setup({ now: AT_7 });
    const it = await t.create({ type: 'tarea', title: 'x', dueAt: '2026-10-23T10:00:00Z', hasTime: true, needsReview: true, calendarEventId: 'ev-r' });
    await runMorning(t.deps);
    expect(t.cal.deleted).toEqual(['ev-r']);
    expect(t.db.tables.items.find((x) => x.id === it.id)).toMatchObject({ calendar_event_id: null });
  });

  it('si Calendar sigue fallando, deja el error guardado y lo cuenta', async () => {
    const t = setup({ now: AT_7, calendarFail: new CalendarError('unavailable', '503') });
    await t.create({ type: 'tarea', title: 'a', dueAt: '2026-10-23T10:00:00Z', hasTime: true, syncError: 'calendar_auth' });
    const r = await runMorning(t.deps);
    expect(r).toMatchObject({ synced: 0, syncFailed: 1 });
    expect(t.db.tables.items[0].sync_error).toBe('calendar_unavailable');
  });

  it(`procesa como mucho ${MAINTENANCE_CAP} elementos por ejecución`, async () => {
    const t = setup({ now: AT_7 });
    for (let i = 0; i < MAINTENANCE_CAP + 5; i++) {
      await t.create({ type: 'tarea', title: `t${i}`, dueAt: '2026-10-23T10:00:00Z', hasTime: true, syncError: 'calendar_unavailable' });
    }
    const r = await runMorning(t.deps);
    expect(r.synced).toBe(MAINTENANCE_CAP);
    expect(t.db.tables.items.filter((x) => x.sync_error).length).toBe(5);
  });

  it('purga lo eliminado hace más de 30 días, borrando antes su evento', async () => {
    const t = setup({ now: AT_7 });
    const old = await t.create({ type: 'idea', title: 'vieja' });
    const oldWithEvent = await t.create({ type: 'tarea', title: 'vieja con evento', dueAt: '2026-09-01T10:00:00Z', hasTime: true, calendarEventId: 'ev-old' });
    const recent = await t.create({ type: 'idea', title: 'reciente' });
    t.setNow(new Date(AT_7.getTime() - 31 * DAY));
    await t.items.softDeleteItem(old.id);
    await t.items.softDeleteItem(oldWithEvent.id);
    t.setNow(new Date(AT_7.getTime() - 29 * DAY));
    await t.items.softDeleteItem(recent.id);
    t.setNow(AT_7);
    const r = await runMorning(t.deps);
    expect(r.purged).toBe(2);
    expect(t.cal.deleted).toContain('ev-old');
    expect(t.db.tables.items.map((x) => x.id)).toEqual([recent.id]);
  });

  it('al purgar borra también las fotos del almacenamiento; el borrado suave las conserva', async () => {
    const t = setup({ now: AT_7 });
    const old = await t.create({ type: 'idea', title: 'vieja con fotos' });
    const recent = await t.create({ type: 'idea', title: 'reciente con foto' });
    await t.photos.addPhoto({ itemId: old.id, path: `u/${old.id}/a.webp`, width: 10, height: 10 });
    await t.photos.addPhoto({ itemId: old.id, path: `u/${old.id}/b.webp`, width: 10, height: 10 });
    await t.photos.addPhoto({ itemId: recent.id, path: `u/${recent.id}/c.webp`, width: 10, height: 10 });
    t.setNow(new Date(AT_7.getTime() - 31 * DAY));
    await t.items.softDeleteItem(old.id);
    t.setNow(new Date(AT_7.getTime() - 29 * DAY));
    await t.items.softDeleteItem(recent.id);
    t.setNow(AT_7);
    const r = await runMorning(t.deps);
    expect(r.purged).toBe(1);
    expect(t.removedObjects.sort()).toEqual([`u/${old.id}/a.webp`, `u/${old.id}/b.webp`]);
    expect(t.db.tables.items.map((x) => x.id)).toEqual([recent.id]);
  });

  it('si no se pueden borrar las fotos, no purga el elemento (se reintenta la próxima hora)', async () => {
    const t = setup({ now: AT_7, storageFail: true });
    const old = await t.create({ type: 'idea', title: 'vieja con foto' });
    const plain = await t.create({ type: 'idea', title: 'vieja sin foto' });
    await t.photos.addPhoto({ itemId: old.id, path: `u/${old.id}/a.webp`, width: 10, height: 10 });
    t.setNow(new Date(AT_7.getTime() - 31 * DAY));
    await t.items.softDeleteItem(old.id);
    await t.items.softDeleteItem(plain.id);
    t.setNow(AT_7);
    const r = await runMorning(t.deps);
    expect(r.purged).toBe(1);
    expect(r.maintenanceFailed).toBe(true);
    expect(t.db.tables.items.map((x) => x.id)).toEqual([old.id]);
  });

  it('no purga un elemento cuyo evento no se pudo borrar (se reintenta la próxima hora)', async () => {
    const t = setup({ now: AT_7, calendarFail: new CalendarError('unavailable', '503') });
    const it_ = await t.create({ type: 'tarea', title: 'vieja', dueAt: '2026-09-01T10:00:00Z', hasTime: true, calendarEventId: 'ev-old' });
    t.setNow(new Date(AT_7.getTime() - 31 * DAY));
    await t.items.softDeleteItem(it_.id);
    t.setNow(AT_7);
    const r = await runMorning(t.deps);
    expect(r.purged).toBe(0);
    expect(t.db.tables.items).toHaveLength(1);
    expect(t.db.tables.items[0].sync_error).toBe('calendar_unavailable');
  });

  it('un fallo del mantenimiento no bloquea el resumen', async () => {
    const t = setup();
    t.deps.items = {
      ...t.items,
      async listCalendarState() {
        throw new Error('db down');
      },
      async listDeletedBefore() {
        throw new Error('db down');
      },
    };
    const r = await runMorning(t.deps);
    expect(r).toMatchObject({ digest: 'sent', pushed: 1, maintenanceFailed: true });
  });
});

describe('handleMorningRequest', () => {
  const run = async () => ({ ok: true });
  const req = (auth?: string, method = 'POST') =>
    new Request('https://app/api/cron/morning', { method, headers: auth ? { Authorization: auth } : {} });

  it('sin cabecera o con secreto erróneo → 401 y no ejecuta', async () => {
    let ran = 0;
    const counted = async () => {
      ran++;
      return {};
    };
    expect((await handleMorningRequest(req(), { secret: 's3cret', run: counted })).status).toBe(401);
    expect((await handleMorningRequest(req('Bearer nope'), { secret: 's3cret', run: counted })).status).toBe(401);
    expect((await handleMorningRequest(req('s3cret'), { secret: 's3cret', run: counted })).status).toBe(401);
    expect(ran).toBe(0);
  });

  it('sin CRON_SECRET configurado → 401 siempre (falla cerrado)', async () => {
    expect((await handleMorningRequest(req('Bearer '), { secret: undefined, run })).status).toBe(401);
    expect((await handleMorningRequest(req('Bearer '), { secret: '', run })).status).toBe(401);
  });

  it('con el secreto correcto (POST o GET) → 200 con el resultado', async () => {
    for (const method of ['POST', 'GET']) {
      const res = await handleMorningRequest(req('Bearer s3cret', method), { secret: 's3cret', run });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
  });

  it('si la ejecución lanza → 500 sin detalles', async () => {
    const res = await handleMorningRequest(req('Bearer s3cret'), {
      secret: 's3cret',
      run: async () => {
        throw new Error('secret detail');
      },
    });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret detail');
  });
});

describe('runMorning invalida la caché del usuario', () => {
  it('tras el mantenimiento (sync, purga, previews) invalida items, calendario y ajustes', async () => {
    const t = setup({ now: AT_7 });
    const old = await t.create({ type: 'idea', title: 'vieja' });
    t.setNow(new Date(AT_7.getTime() - 31 * DAY));
    await t.items.softDeleteItem(old.id);
    t.setNow(AT_7);
    const r = await runMorning({ ...t.deps, refreshPreviews: async () => 1 });
    expect(r.purged).toBe(1);
    expect(r.previews).toBe(1);
    expect(t.invalidated).toEqual([expect.arrayContaining(['items', 'calendar', 'settings'])]);
  });

  it('también cuando el resumen o el mantenimiento fallan', async () => {
    const t = setup({ digest: new Error('ai down'), storageFail: true });
    await runMorning(t.deps);
    expect(t.invalidated).toHaveLength(1);
  });
});
