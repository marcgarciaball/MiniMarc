import { describe, it, expect } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createItemsRepo } from '@/lib/db/items';
import { createPeopleRepo } from '@/lib/db/people';
import { createPhotosRepo } from '@/lib/db/photos';
import type { Item } from '@/lib/db/types';
import {
  CSV_COLUMNS,
  collectExport,
  exportFilename,
  serializeExport,
  type ExportData,
} from '@/lib/export/serialize';

const item = (over: Partial<Item> = {}): Item => ({
  id: 'i1',
  type: 'tarea',
  title: 'Llamar',
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
  location: null,
  aiState: null,
  createdAt: '2026-10-21T10:00:00.000Z',
  deletedAt: null,
  ...over,
});

const data = (over: Partial<ExportData> = {}): ExportData => ({
  exportedAt: '2026-10-22T08:00:00.000Z',
  items: [],
  people: [],
  personDates: [],
  photos: [],
  settings: null,
  apiTokens: [],
  ...over,
});

describe('serializeExport json', () => {
  it('contiene todos los campos y los elementos eliminados con deletedAt', () => {
    const deleted = item({ id: 'i2', title: 'Borrado', deletedAt: '2026-10-20T09:00:00.000Z' });
    const libro = item({ id: 'i3', type: 'libro', author: 'Ursula K. Le Guin', readingState: 'leyendo', link: 'https://x.es', linkTitle: 'X', linkImage: 'https://x.es/a.jpg', linkSite: 'x.es', sourceText: 'leer X' });
    const out = JSON.parse(
      serializeExport(
        data({
          items: [item(), deleted, libro],
          people: [{ id: 'p1', name: 'Ana', birthday: '1990-03-01', notes: null }],
          personDates: [{ id: 'd1', personId: 'p1', label: 'Santo', date: '1604-07-26', yearly: true, notes: null, createdAt: '2026-10-01T00:00:00.000Z' }],
          photos: [{ id: 'f1', itemId: 'i1', path: 'u/i1/a.webp', width: 10, height: 20, createdAt: '2026-10-21T10:00:00.000Z' }],
          settings: { digestHour: 8, tz: 'Europe/Madrid', weeklyDigest: 'lunes' },
          apiTokens: [{ name: 'Siri', createdAt: '2026-10-01T00:00:00.000Z', revokedAt: null }],
        }),
        'json',
      ),
    );
    expect(out.items).toHaveLength(3);
    expect(out.items[1].deletedAt).toBe('2026-10-20T09:00:00.000Z');
    expect(Object.keys(out.items[0]).sort()).toEqual(Object.keys(item()).sort());
    expect(out.items[2]).toMatchObject({ author: 'Ursula K. Le Guin', readingState: 'leyendo', linkSite: 'x.es', sourceText: 'leer X' });
    expect(out.people[0].name).toBe('Ana');
    expect(out.personDates[0].label).toBe('Santo');
    expect(out.photos[0].path).toBe('u/i1/a.webp');
    expect(out.settings.weeklyDigest).toBe('lunes');
    expect(out.apiTokens).toEqual([{ name: 'Siri', createdAt: '2026-10-01T00:00:00.000Z', revokedAt: null }]);
  });

  it('nunca incluye hashes de tokens aunque lleguen en los datos', () => {
    const leaky = { name: 'Siri', createdAt: 'x', revokedAt: null, tokenHash: 'abc', token_hash: 'def', id: 't1' };
    const json = serializeExport(data({ apiTokens: [leaky as never] }), 'json');
    expect(json).not.toContain('abc');
    expect(json).not.toContain('def');
    expect(JSON.parse(json).apiTokens[0]).toEqual({ name: 'Siri', createdAt: 'x', revokedAt: null });
  });
});

describe('serializeExport csv', () => {
  it('vacío produce solo la cabecera', () => {
    const csv = serializeExport(data(), 'csv');
    expect(csv.trimEnd()).toBe(CSV_COLUMNS.join(','));
    expect(csv.trimEnd().split('\r\n')).toHaveLength(1);
  });

  it('cabecera estable con todos los campos del elemento', () => {
    expect([...CSV_COLUMNS].sort()).toEqual(Object.keys(item()).sort());
    expect(CSV_COLUMNS[0]).toBe('id');
  });

  it('escapa comas, comillas y saltos de línea', () => {
    const csv = serializeExport(
      data({ items: [item({ title: 'Leche, pan', notes: 'Dijo "mañana"\nsin falta' })] }),
      'csv',
    );
    expect(csv).toContain('"Leche, pan"');
    expect(csv).toContain('"Dijo ""mañana""\nsin falta"');
  });

  it('neutraliza fórmulas: celdas que empiezan por = + - @ tabulador o CR llevan \' delante (M-5)', () => {
    const titles = ['=HYPERLINK("http://x")', '+1+1', '-2', '@SUM(A1)', '\tcmd', '\rcmd'];
    const csv = serializeExport(data({ items: titles.map((t, n) => item({ id: `i${n}`, title: 'ok', linkTitle: t })) }), 'csv');
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(",'+1+1,");
    expect(csv).toContain(",'-2,");
    expect(csv).toContain(",'@SUM(A1),");
    expect(csv).toContain(",'\tcmd,");
    expect(csv).toContain(`"'\rcmd"`);
    expect(csv).not.toMatch(/,[=+@]/);
  });

  it('las fechas y textos normales no cambian', () => {
    const csv = serializeExport(data({ items: [item({ title: 'Leche 2-3', notes: 'a=b' })] }), 'csv');
    expect(csv).toContain(',Leche 2-3,a=b,');
  });

  it('incluye elementos eliminados con deletedAt, booleanos y nulos', () => {
    const csv = serializeExport(data({ items: [item({ deletedAt: '2026-10-20T09:00:00.000Z', hasTime: true })] }), 'csv');
    const [header, row] = csv.trimEnd().split('\r\n');
    const cols = header.split(',');
    const cells = row.split(',');
    expect(cells[cols.indexOf('deletedAt')]).toBe('2026-10-20T09:00:00.000Z');
    expect(cells[cols.indexOf('hasTime')]).toBe('true');
    expect(cells[cols.indexOf('notes')]).toBe('');
  });
});

describe('exportFilename', () => {
  it('agente-personal-YYYY-MM-DD con la extensión', () => {
    expect(exportFilename('2026-10-22', 'json')).toBe('agente-personal-2026-10-22.json');
    expect(exportFilename('2026-10-22', 'csv')).toBe('agente-personal-2026-10-22.csv');
  });
});

describe('collectExport', () => {
  it('reúne elementos (también eliminados), personas, fechas y fotos', async () => {
    const backend = createMemoryBackend();
    const items = createItemsRepo(backend);
    const people = createPeopleRepo(backend);
    const ana = await people.upsertPersonByName('Ana');
    await people.addDate({ personId: ana.id, label: 'Santo', date: '1604-07-26' });
    const a = await items.createItem({ type: 'idea', title: 'Viva' });
    const b = await items.createItem({ type: 'tarea', title: 'Muerta' });
    await items.softDeleteItem(b.id);
    await createPhotosRepo(backend).addPhoto({ itemId: a.id, path: 'u/a/1.webp', width: null, height: null });

    const out = await collectExport({
      backend,
      settings: async () => ({ digestHour: 9, tz: 'Europe/Madrid', weeklyDigest: 'off' }),
      tokens: async () => [{ id: 't', name: 'Siri', createdAt: 'c', revokedAt: 'r' }],
      now: () => new Date('2026-10-22T08:00:00Z'),
    });
    expect(out.items.map((i) => i.title).sort()).toEqual(['Muerta', 'Viva']);
    expect(out.items.find((i) => i.title === 'Muerta')?.deletedAt).toBeTruthy();
    expect(out.people.map((p) => p.name)).toEqual(['Ana']);
    expect(out.personDates[0].label).toBe('Santo');
    expect(out.photos[0].path).toBe('u/a/1.webp');
    expect(out.settings).toEqual({ digestHour: 9, tz: 'Europe/Madrid', weeklyDigest: 'off' });
    expect(out.apiTokens).toEqual([{ name: 'Siri', createdAt: 'c', revokedAt: 'r' }]);
    expect(out.exportedAt).toBe('2026-10-22T08:00:00.000Z');
  });

  it('una parte opcional que falla (migración sin aplicar) queda vacía', async () => {
    const backend = createMemoryBackend();
    const failing = { ...backend, select: async (t: string, w?: never) => { if (t === 'item_photos' || t === 'person_dates') throw new Error('no table'); return backend.select(t as never, w); } };
    const out = await collectExport({
      backend: failing as never,
      settings: async () => { throw new Error('x'); },
      tokens: async () => { throw new Error('y'); },
    });
    expect(out.photos).toEqual([]);
    expect(out.personDates).toEqual([]);
    expect(out.settings).toBeNull();
    expect(out.apiTokens).toEqual([]);
  });
});
