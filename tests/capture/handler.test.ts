import { describe, expect, it } from 'vitest';
import type { AiProvider } from '@/lib/ai/provider';
import type { CalendarGateway } from '@/lib/calendar/client';
import { captureMessage, captureOptions, handleCapture, type CaptureRouteDeps } from '@/lib/capture/handler';
import type { CaptureDeps } from '@/lib/capture/pipeline';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import type { Item } from '@/lib/db/types';

const TOKEN = 'ap_valid';
const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

function aiReturning(items: unknown[]): AiProvider {
  return {
    async generateJson(_p, schema) {
      return schema.parse({ items });
    },
    async generateText() {
      return '';
    },
  };
}

const gw: CalendarGateway = {
  async createEvent() {
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

function setup(
  ai: AiProvider = aiReturning([{ kind: 'tarea', title: 'Llamar a mamá', confidence: 0.9 }]),
  tokenName = 'Siri',
) {
  const db = createMemoryBackend();
  const built: string[] = [];
  const invalidated: { userId: string; scopes: readonly string[] }[] = [];
  const deps: CaptureRouteDeps = {
    invalidate: (userId, scopes) => void invalidated.push({ userId, scopes }),
    async verify(h) {
      return h === `Bearer ${TOKEN}` ? { userId: 'user-marc', tokenId: 't1', name: tokenName } : null;
    },
    async captureDeps(userId): Promise<CaptureDeps> {
      built.push(userId);
      return {
        ai,
        items: createItemsRepo(db),
        people: createPeopleRepo(db),
        calendar: async () => gw,
        now: new Date('2026-10-21T08:00:00.000Z'),
      };
    },
  };
  return { db, deps, built, invalidated };
}

function post(body: unknown, opts: { auth?: string | null; origin?: string; raw?: boolean } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = opts.auth === undefined ? `Bearer ${TOKEN}` : opts.auth;
  if (auth) headers.Authorization = auth;
  if (opts.origin) headers.Origin = opts.origin;
  return new Request('https://app.test/api/capture', {
    method: 'POST',
    headers,
    body: opts.raw ? (body as string) : JSON.stringify(body),
  });
}

describe('POST /api/capture', () => {
  it.each([
    ['sin cabecera', null],
    ['token inválido', 'Bearer ap_otro'],
    ['cabecera mal formada', TOKEN],
  ])('401 %s, sin construir dependencias ni guardar', async (_n, auth) => {
    const { db, deps, built } = setup();
    const res = await handleCapture(post({ text: 'hola' }, { auth }), deps);
    expect(res.status).toBe(401);
    expect(built).toEqual([]);
    expect(db.tables.items).toHaveLength(0);
  });

  it('401 antes que 400: un cuerpo inválido sin token sigue siendo 401', async () => {
    const { deps } = setup();
    expect((await handleCapture(post('{', { auth: null, raw: true }), deps)).status).toBe(401);
  });

  it.each([
    ['JSON inválido', '{nope', true],
    ['no es un objeto', '"hola"', true],
    ['sin text', {}, false],
    ['text no es texto', { text: 3 }, false],
    ['text vacío', { text: '' }, false],
    ['text solo espacios', { text: '   ' }, false],
    ['text de más de 2000 caracteres', { text: 'a'.repeat(2001) }, false],
    ['área desconocida', { text: 'hola', area: 'personal' }, false],
    ['origen desconocido', { text: 'hola', origin: 'web' }, false],
  ])('400 %s, sin guardar nada', async (_n, body, raw) => {
    const { db, deps } = setup();
    const res = await handleCapture(post(body, { raw }), deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty('message');
    expect(db.tables.items).toHaveLength(0);
  });

  it('200 con la respuesta mínima y un mensaje para Siri', async () => {
    const { db, deps, built } = setup();
    const res = await handleCapture(post({ text: 'llamar a mamá' }), deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      items: [{ id: expect.any(String), type: 'tarea', title: 'Llamar a mamá', area: 'personal', needsReview: false }],
      eventIds: [],
      message: 'Guardado en Tareas · Personal',
    });
    expect(built).toEqual(['user-marc']);
    expect(db.tables.items[0].origin).toBe('siri');
  });

  it('acepta 2000 caracteres justos, area trabajo y origin extension', async () => {
    const { db, deps } = setup();
    const res = await handleCapture(post({ text: 'a'.repeat(2000), area: 'trabajo', origin: 'extension' }), deps);
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Guardado en Tareas · Trabajo');
    expect(db.tables.items[0]).toMatchObject({ origin: 'extension', area: 'trabajo' });
  });

  it('si la IA falla responde 200 con "Guardado en Sin clasificar"', async () => {
    const { deps } = setup({
      async generateJson() {
        throw new Error('timeout');
      },
      async generateText() {
        return '';
      },
    });
    const body = await (await handleCapture(post({ text: 'algo' }), deps)).json();
    expect(body.message).toBe('Guardado en Sin clasificar');
    expect(body.items[0]).toMatchObject({ title: 'algo', needsReview: true, area: null });
  });

  it('500 con mensaje si no se puede guardar', async () => {
    const { deps } = setup();
    const broken: CaptureRouteDeps = {
      ...deps,
      async captureDeps(u) {
        const d = await deps.captureDeps(u);
        return { ...d, items: { ...d.items, createItem: async () => Promise.reject(new Error('db down')) } };
      },
    };
    const res = await handleCapture(post({ text: 'algo' }), broken);
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('No se ha podido guardar. Inténtalo de nuevo.');
  });

  it('200 si falla un elemento de varios: guarda el resto y el texto en Sin clasificar', async () => {
    const ai = aiReturning([
      { kind: 'compra', title: 'Leche', confidence: 0.9 },
      { kind: 'idea', title: 'App de recetas', confidence: 0.9 },
    ]);
    const { db, deps } = setup(ai);
    const partial: CaptureRouteDeps = {
      ...deps,
      async captureDeps(u) {
        const d = await deps.captureDeps(u);
        let n = 0;
        const createItem: typeof d.items.createItem = async (input) => {
          if (++n === 2) throw new Error('db down');
          return d.items.createItem(input);
        };
        return { ...d, items: { ...d.items, createItem } };
      },
    };
    const res = await handleCapture(post({ text: 'comprar leche e idea: app de recetas' }), partial);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((i: Item) => i.title)).toEqual(['Leche', 'comprar leche e idea: app de recetas']);
    expect(body.message).toBe('Guardado en Compras y Sin clasificar');
    expect(db.tables.items).toHaveLength(2);
  });

  it.each(['Siri trabajo', 'TRABAJO', 'Atajo Trabajo iPhone'])(
    'un token llamado "%s" fuerza el área Trabajo y nunca llama a la IA',
    async (name) => {
      const ai: AiProvider = {
        async generateJson() {
          throw new Error('AI must not be called');
        },
        async generateText() {
          throw new Error('AI must not be called');
        },
      };
      const { db, deps } = setup(ai, name);
      const res = await handleCapture(post({ text: 'revisar contrato Acme' }), deps);
      expect(res.status).toBe(200);
      expect((await res.json()).message).toBe('Guardado en Tareas · Trabajo');
      expect(db.tables.items[0]).toMatchObject({ area: 'trabajo', needs_review: false });
    },
  );

  it('un token sin "trabajo" en el nombre respeta el cuerpo', async () => {
    const { db, deps } = setup(undefined, 'Siri personal');
    await handleCapture(post({ text: 'llamar a mamá' }), deps);
    expect(db.tables.items[0].area).toBe('personal');
  });

  it('500 (no 401) si no se puede comprobar el token', async () => {
    const { deps } = setup();
    const res = await handleCapture(post({ text: 'algo' }), {
      ...deps,
      verify: async () => Promise.reject(new Error('db down')),
    });
    expect(res.status).toBe(500);
  });
});

describe('CORS para la extensión', () => {
  it('OPTIONS desde chrome-extension:// → 204 con Authorization y Content-Type permitidos', () => {
    const res = captureOptions(new Request('https://app.test/api/capture', { method: 'OPTIONS', headers: { Origin: EXT } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(EXT);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('las respuestas del POST llevan la cabecera CORS para la extensión (también los errores)', async () => {
    const { deps } = setup();
    const ok = await handleCapture(post({ text: 'hola' }, { origin: EXT }), deps);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(EXT);
    const unauthorized = await handleCapture(post({ text: 'hola' }, { origin: EXT, auth: null }), deps);
    expect(unauthorized.headers.get('Access-Control-Allow-Origin')).toBe(EXT);
  });

  it('otros orígenes no reciben cabeceras CORS', async () => {
    const { deps } = setup();
    const res = await handleCapture(post({ text: 'hola' }, { origin: 'https://evil.example' }), deps);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const pre = captureOptions(
      new Request('https://app.test/api/capture', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }),
    );
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('captureMessage', () => {
  const item = (p: Partial<Item>) => ({ type: 'tarea', area: null, needsReview: false, ...p }) as Item;

  it.each([
    [[item({ area: 'personal' })], [], 'Guardado en Tareas · Personal'],
    [[item({ area: 'trabajo' })], [], 'Guardado en Tareas · Trabajo'],
    [[item({ type: 'idea' })], [], 'Guardado en Ideas'],
    [[item({ type: 'compra' })], [], 'Guardado en Compras'],
    [[item({ type: 'regalo' })], [], 'Guardado en Regalos'],
    [[item({ type: 'compra', needsReview: true })], [], 'Guardado en Sin clasificar'],
    [[], ['ev-1'], 'Guardado en Calendar'],
    [[item({ type: 'compra' }), item({ type: 'compra' }), item({ area: 'personal' })], ['ev-1'], 'Guardado en Compras, Tareas · Personal y Calendar'],
  ])('%#', (items, eventIds, msg) => {
    expect(captureMessage({ items, eventIds })).toBe(msg);
  });
});

describe('POST /api/capture con type (chips de la extensión)', () => {
  const aiForbidden: AiProvider = {
    async generateJson() {
      throw new Error('AI must not be called');
    },
    async generateText() {
      throw new Error('AI must not be called');
    },
  };

  it.each([
    ['tarea', undefined, 'Guardado en Tareas · Personal', { type: 'tarea', area: 'personal' }],
    ['tarea', 'trabajo', 'Guardado en Tareas · Trabajo', { type: 'tarea', area: 'trabajo' }],
    ['idea', undefined, 'Guardado en Ideas', { type: 'idea' }],
    ['compra', undefined, 'Guardado en Compras', { type: 'compra' }],
    ['regalo', undefined, 'Guardado en Regalos', { type: 'regalo', person_id: null }],
    ['libro', undefined, 'Guardado en Libros', { type: 'libro', reading_state: 'por_leer' }],
  ])('type %s (area %s) guarda directamente sin IA', async (type, area, message, row: Record<string, unknown>) => {
    const { db, deps } = setup(aiForbidden);
    const res = await handleCapture(post({ text: '  Leche de avena  ', type, area, origin: 'extension' }), deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe(message);
    expect(body.items).toEqual([
      { id: expect.any(String), type, title: 'Leche de avena', area: row.area ?? null, needsReview: false },
    ]);
    expect(body.eventIds).toEqual([]);
    expect(db.tables.items).toHaveLength(1);
    expect(db.tables.items[0]).toMatchObject({
      ...row,
      title: 'Leche de avena',
      origin: 'extension',
      needs_review: false,
      source_text: '  Leche de avena  ',
    });
  });

  it('type libro con author guarda el libro con su autor, sin IA', async () => {
    const { db, deps } = setup(aiForbidden);
    const res = await handleCapture(post({ text: 'Sapiens', type: 'libro', author: 'Harari', origin: 'extension' }), deps);
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Guardado en Libros');
    expect(db.tables.items[0]).toMatchObject({ type: 'libro', title: 'Sapiens', author: 'Harari', reading_state: 'por_leer' });
  });

  it('un token de Trabajo con type tarea guarda en Tareas · Trabajo', async () => {
    const { db, deps } = setup(aiForbidden, 'Extensión trabajo');
    const res = await handleCapture(post({ text: 'informe', type: 'tarea' }), deps);
    expect((await res.json()).message).toBe('Guardado en Tareas · Trabajo');
    expect(db.tables.items[0].area).toBe('trabajo');
  });

  it.each([['cita'], ['auto'], ['nota']])('400 con type desconocido "%s", sin guardar', async (type) => {
    const { db, deps } = setup(aiForbidden);
    const res = await handleCapture(post({ text: 'hola', type }), deps);
    expect(res.status).toBe(400);
    expect(db.tables.items).toHaveLength(0);
  });

  it('400 con type y texto vacío', async () => {
    const { db, deps } = setup(aiForbidden);
    expect((await handleCapture(post({ text: '  ', type: 'idea' }), deps)).status).toBe(400);
    expect(db.tables.items).toHaveLength(0);
  });

  it('500 si la base de datos falla al guardar con type', async () => {
    const { deps } = setup(aiForbidden);
    const res = await handleCapture(post({ text: 'algo', type: 'idea' }), {
      ...deps,
      async captureDeps(u) {
        const d = await deps.captureDeps(u);
        return { ...d, items: { ...d.items, createItem: async () => Promise.reject(new Error('db down')) } };
      },
    });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/capture invalida la caché del usuario', () => {
  const capture = ['items', 'people', 'calendar'];

  it('Auto (con IA): invalida items, personas y calendario del dueño del token', async () => {
    const { deps, invalidated } = setup();
    const res = await handleCapture(post({ text: 'Llamar a mamá mañana' }), deps);
    expect(res.status).toBe(200);
    expect(invalidated).toEqual([{ userId: 'user-marc', scopes: expect.arrayContaining(capture) }]);
  });

  it.each(['tarea', 'idea', 'compra', 'regalo', 'libro'])('type %s: invalida', async (type) => {
    const { deps, invalidated } = setup();
    const res = await handleCapture(post({ text: 'Algo', type, origin: 'extension' }), deps);
    expect(res.status).toBe(200);
    expect(invalidated).toEqual([{ userId: 'user-marc', scopes: expect.arrayContaining(capture) }]);
  });

  it('también si la escritura falla a medias', async () => {
    const { deps, invalidated } = setup();
    const failing: CaptureRouteDeps = {
      ...deps,
      async captureDeps(u) {
        const d = await deps.captureDeps(u);
        return { ...d, items: { ...d.items, createItem: async () => Promise.reject(new Error('db down')) } };
      },
    };
    const res = await handleCapture(post({ text: 'Algo', type: 'idea' }), failing);
    expect(res.status).toBe(500);
    expect(invalidated).toHaveLength(1);
  });

  it('sin token válido o sin texto no invalida nada', async () => {
    const { deps, invalidated } = setup();
    await handleCapture(post({ text: 'x' }, { auth: 'Bearer nope' }), deps);
    await handleCapture(post({ text: '   ' }), deps);
    expect(invalidated).toEqual([]);
  });
});
