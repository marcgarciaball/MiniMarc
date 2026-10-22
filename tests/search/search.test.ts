import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createItemsRepo, type ItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo, type PeopleRepo } from '@/lib/db/people';
import type { Item } from '@/lib/db/types';
import { createMemorySearch } from '@/lib/search/memory';
import { NORMALIZE_FROM, NORMALIZE_TO, normalizeSearch } from '@/lib/search/normalize';
import { escapeLike, groupResults, orFilter, parseQuery, runSearch } from '@/lib/search/query';

/** Splits a PostgREST or=() list on the commas that are outside double quotes. */
function splitOr(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && quoted) {
      cur += c + s[++i];
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (c === ',' && !quoted) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

describe('normalizeSearch', () => {
  it('minúsculas y sin acentos', () => {
    expect(normalizeSearch('Árbol Ñandú CAFÉ Çava Über')).toBe('arbol nandu cafe cava uber');
  });

  it('la tabla de la app es la misma que la de la migración 0009', () => {
    const sql = readFileSync(path.join(__dirname, '../../supabase/migrations/0009_link_preview.sql'), 'utf8');
    expect(NORMALIZE_FROM).toHaveLength(NORMALIZE_TO.length);
    expect(sql).toContain(`'${NORMALIZE_FROM}'`);
    expect(sql).toContain(`'${NORMALIZE_TO}'`);
  });
});

describe('parseQuery', () => {
  it('palabras normalizadas (y las originales, en minúsculas), sin vacíos, con tope', () => {
    expect(parseQuery('  Café   Ávila ')).toEqual({ terms: ['cafe', 'avila'], raw: ['café', 'ávila'] });
    expect(parseQuery('   ').terms).toEqual([]);
    expect(parseQuery('a b c d e f g h').terms).toHaveLength(6);
  });

  it('el asterisco no es comodín (PostgREST lo trataría como %)', () => {
    expect(parseQuery('a*b').terms).toEqual(['a', 'b']);
  });
});

describe('escapeLike / orFilter', () => {
  it('escapa %, _ y la barra invertida para LIKE', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('una condición por columna; comas, comillas y paréntesis del usuario no rompen la lista', () => {
    const f = orFilter(['title', 'notes'], 'a,b)"c%');
    const parts = splitOr(f);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('title.ilike."%a,b)\\"c\\\\%%"');
    expect(parts[1].startsWith('notes.ilike."')).toBe(true);
  });
});

describe('búsqueda (memoria)', () => {
  let items: ItemsRepo;
  let people: PeopleRepo;
  let search: ReturnType<typeof createMemorySearch>;
  const NOW = new Date('2026-10-21T10:00:00Z');

  beforeEach(() => {
    const backend = createMemoryBackend({ now: () => NOW });
    items = createItemsRepo(backend, { now: () => NOW });
    people = createPeopleRepo(backend);
    search = createMemorySearch(backend);
  });

  it('busca sin mayúsculas ni acentos en título, notas, texto original, autor y título del enlace', async () => {
    const a = await items.createItem({ type: 'idea', title: 'Café en Ávila' });
    const b = await items.createItem({ type: 'compra', title: 'Leche', notes: 'la del CAFE' });
    const c = await items.createItem({ type: 'tarea', title: 'x', sourceText: 'comprar café', area: 'personal' });
    const d = await items.createItem({ type: 'libro', title: 'Libro', author: 'Cafetín Pérez' });
    const e = await items.createItem({ type: 'idea', title: 'https://tienda.es/1' });
    await items.updateItem(e.id, { linkTitle: 'Cafetera italiana' });
    await items.createItem({ type: 'idea', title: 'Té verde' });
    const r = await runSearch(search, 'cafe', { includeDeleted: false });
    const ids = r.groups.flatMap((g) => (g.kind === 'items' ? g.items.map((i) => i.id) : []));
    expect(ids.sort()).toEqual([a.id, b.id, c.id, d.id, e.id].sort());
  });

  it('todas las palabras deben aparecer', async () => {
    await items.createItem({ type: 'idea', title: 'Viaje a Roma' });
    await items.createItem({ type: 'idea', title: 'Viaje a París' });
    const r = await runSearch(search, 'viaje paris', { includeDeleted: false });
    expect(r.total).toBe(1);
  });

  it('personas por nombre y notas', async () => {
    const ana = await people.upsertPersonByName('Ána');
    await people.updatePerson(ana.id, { notes: 'Le gusta el café' });
    await people.upsertPersonByName('Luis');
    expect((await runSearch(search, 'ana', { includeDeleted: false })).groups).toMatchObject([
      { key: 'personas', kind: 'people', people: [{ id: ana.id }] },
    ]);
    expect((await runSearch(search, 'CAFÉ', { includeDeleted: false })).total).toBe(1);
  });

  it('% y _ del usuario son literales', async () => {
    await items.createItem({ type: 'idea', title: '50% descuento' });
    await items.createItem({ type: 'idea', title: '50 descuento' });
    expect((await runSearch(search, '50%', { includeDeleted: false })).total).toBe(1);
    expect((await runSearch(search, '_', { includeDeleted: false })).total).toBe(0);
  });

  it('lo eliminado solo sale con Papelera, y en su propio grupo', async () => {
    const x = await items.createItem({ type: 'idea', title: 'Borrada' });
    await items.softDeleteItem(x.id);
    expect((await runSearch(search, 'borrada', { includeDeleted: false })).total).toBe(0);
    const r = await runSearch(search, 'borrada', { includeDeleted: true });
    expect(r.groups.map((g) => g.key)).toEqual(['papelera']);
  });

  it('consulta vacía: nada', async () => {
    await items.createItem({ type: 'idea', title: 'Algo' });
    expect(await runSearch(search, '  ', { includeDeleted: false })).toEqual({ query: '', groups: [], total: 0 });
  });
});

describe('groupResults', () => {
  const base = (over: Partial<Item>): Item =>
    ({
      id: Math.random().toString(36).slice(2),
      type: 'tarea',
      title: 't',
      notes: null,
      area: 'personal',
      status: 'pendiente',
      needsReview: false,
      createdAt: '2026-10-01T00:00:00Z',
      deletedAt: null,
      ...over,
    }) as Item;

  it('agrupa por tipo en el orden de la app; Tareas Personal y Trabajo nunca juntas', () => {
    const items = [
      base({ type: 'tarea', area: 'trabajo', title: 'informe' }),
      base({ type: 'tarea', area: 'personal', title: 'dentista' }),
      base({ type: 'tarea', area: null, title: 'sin área' }),
      base({ type: 'idea' }),
      base({ type: 'compra' }),
      base({ type: 'regalo' }),
      base({ type: 'libro' }),
      base({ type: 'tarea', needsReview: true, area: null }),
      base({ type: 'tarea', needsReview: true, area: 'trabajo' }),
      base({ type: 'tarea', area: 'trabajo', deletedAt: '2026-10-02T00:00:00Z' }),
      base({ type: 'idea', deletedAt: '2026-10-02T00:00:00Z' }),
    ];
    const groups = groupResults(items, [{ id: 'p', name: 'Ana', birthday: null, notes: null }]);
    expect(groups.map((g) => [g.key, g.label])).toEqual([
      ['tareas-personal', 'Tareas · Personal'],
      ['tareas-trabajo', 'Tareas · Trabajo'],
      ['ideas', 'Ideas'],
      ['compras', 'Compras'],
      ['regalos', 'Regalos'],
      ['libros', 'Libros'],
      ['personas', 'Personas'],
      ['sin-clasificar', 'Sin clasificar'],
      ['sin-clasificar-trabajo', 'Sin clasificar · Trabajo'],
      ['papelera', 'Papelera'],
      ['papelera-trabajo', 'Papelera · Trabajo'],
    ]);
    const get = (k: string) => groups.find((g) => g.key === k);
    const titles = (k: string) => {
      const g = get(k);
      return g?.kind === 'items' ? g.items.map((i) => i.title) : [];
    };
    expect(titles('tareas-personal').sort()).toEqual(['dentista', 'sin área']);
    expect(titles('tareas-trabajo')).toEqual(['informe']);
    for (const g of groups) {
      if (g.kind !== 'items') continue;
      const areas = new Set(g.items.filter((i) => i.type === 'tarea').map((i) => i.area === 'trabajo'));
      expect(areas.size).toBeLessThanOrEqual(1);
    }
  });
});
