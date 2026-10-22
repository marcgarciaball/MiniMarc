import { describe, expect, it } from 'vitest';
import type { Digest } from '@/lib/digest/build';
import { handleHoy, hoyOptions, type HoyRouteDeps } from '@/lib/digest/hoyApi';
import type { Item } from '@/lib/db/types';

const TOKEN = 'ap_valid';
const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

const item = (p: Partial<Item>): Item =>
  ({
    id: 'i1',
    type: 'tarea',
    title: 'Tarea',
    notes: 'NOTA_PRIVADA',
    area: 'personal',
    status: 'pendiente',
    dueAt: '2026-10-22T08:00:00.000Z',
    hasTime: true,
    needsReview: false,
    sourceText: 'FUENTE',
    ...p,
  }) as Item;

const DIGEST: Digest = {
  date: '2026-10-22',
  headline: 'Día de pan.',
  events: [{ id: 'e1', title: 'Dentista', startsAt: '2026-10-22T09:00:00.000Z', endsAt: '2026-10-22T09:30:00.000Z' }],
  calendarError: null,
  tasks: {
    personal: { items: [{ item: item({ id: 'p1', title: 'Comprar pan' }), overdue: false }], more: 0 },
    trabajo: { items: [{ item: item({ id: 't1', title: 'Informe', area: 'trabajo', hasTime: false }), overdue: true }], more: 2 },
  },
  unclassified: 3,
  dates: [],
};

function setup(tokenName = 'Extensión') {
  const asked: string[] = [];
  const deps: HoyRouteDeps = {
    async verify(h) {
      return h === `Bearer ${TOKEN}` ? { userId: 'user-marc', tokenId: 't1', name: tokenName } : null;
    },
    async digest(userId) {
      asked.push(userId);
      return DIGEST;
    },
  };
  return { deps, asked };
}

function get(opts: { auth?: string | null; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  const auth = opts.auth === undefined ? `Bearer ${TOKEN}` : opts.auth;
  if (auth) headers.Authorization = auth;
  if (opts.origin) headers.Origin = opts.origin;
  return new Request('https://app.test/api/hoy', { headers });
}

describe('GET /api/hoy', () => {
  it.each([
    ['sin cabecera', null],
    ['token inválido', 'Bearer ap_otro'],
    ['cabecera mal formada', TOKEN],
  ])('401 %s, sin construir el resumen', async (_n, auth) => {
    const { deps, asked } = setup();
    const res = await handleHoy(get({ auth }), deps);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: 'No autorizado' });
    expect(asked).toEqual([]);
  });

  it('200 con un JSON ligero: titular, citas y tareas por área, sin notas ni texto original', async () => {
    const { deps, asked } = setup();
    const res = await handleHoy(get(), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(asked).toEqual(['user-marc']);
    expect(body).toEqual({
      date: '2026-10-22',
      headline: 'Día de pan.',
      events: [{ id: 'e1', title: 'Dentista', startsAt: '2026-10-22T09:00:00.000Z', endsAt: '2026-10-22T09:30:00.000Z' }],
      calendarError: null,
      tasks: {
        personal: { items: [{ id: 'p1', title: 'Comprar pan', dueAt: '2026-10-22T08:00:00.000Z', hasTime: true, overdue: false }], more: 0 },
        trabajo: { items: [{ id: 't1', title: 'Informe', dueAt: '2026-10-22T08:00:00.000Z', hasTime: false, overdue: true }], more: 2 },
      },
      unclassified: 3,
    });
    expect(JSON.stringify(body)).not.toMatch(/NOTA_PRIVADA|FUENTE/);
  });

  it('un token de Trabajo también recibe las dos áreas', async () => {
    const { deps } = setup('Extensión trabajo');
    const body = await (await handleHoy(get(), deps)).json();
    expect(Object.keys(body.tasks)).toEqual(['personal', 'trabajo']);
  });

  it('500 si falla el token o el resumen', async () => {
    const { deps } = setup();
    expect((await handleHoy(get(), { ...deps, verify: () => Promise.reject(new Error('db')) })).status).toBe(500);
    const res = await handleHoy(get(), { ...deps, digest: () => Promise.reject(new Error('db')) });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ message: 'No se ha podido cargar Hoy.' });
  });

  it('CORS para chrome-extension:// (GET y OPTIONS), nada para otros orígenes', async () => {
    const { deps } = setup();
    const ok = await handleHoy(get({ origin: EXT }), deps);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(EXT);
    const unauthorized = await handleHoy(get({ origin: EXT, auth: null }), deps);
    expect(unauthorized.headers.get('Access-Control-Allow-Origin')).toBe(EXT);
    const pre = hoyOptions(new Request('https://app.test/api/hoy', { method: 'OPTIONS', headers: { Origin: EXT } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    const evil = await handleHoy(get({ origin: 'https://evil.example' }), deps);
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
