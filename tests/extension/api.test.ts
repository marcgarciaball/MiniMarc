import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Digest } from '@/lib/digest/build';
import { toHoyResponse } from '@/lib/digest/hoyApi';
import { fetchHoy, sendCapture, type HoySummary } from '@/extension/lib/api';

const BASE = 'https://mini-marc-personal.vercel.app/';
const TOKEN = 'ap_test';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json(body, { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendCapture', () => {
  it('hace POST a /api/capture con Authorization, origin extension y devuelve el mensaje', async () => {
    const f = mockFetch(200, { items: [], eventIds: [], message: 'Guardado en Ideas' });
    const r = await sendCapture(BASE, TOKEN, 'una idea', undefined, 'idea');
    expect(r).toEqual({ ok: true, message: 'Guardado en Ideas' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://mini-marc-personal.vercel.app/api/capture');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(init.body))).toEqual({ text: 'una idea', origin: 'extension', type: 'idea' });
  });

  it('pasa type libro y el autor (recortado); sin autor no lo envía', async () => {
    const f = mockFetch(200, { message: 'Guardado en Libros' });
    await sendCapture(BASE, TOKEN, 'Sapiens', undefined, 'libro', '  Harari ');
    expect(JSON.parse(String(f.mock.calls[0][1].body))).toEqual({
      text: 'Sapiens',
      origin: 'extension',
      type: 'libro',
      author: 'Harari',
    });
    await sendCapture(BASE, TOKEN, 'Dune', undefined, 'libro', '   ');
    expect(JSON.parse(String(f.mock.calls[1][1].body))).toEqual({ text: 'Dune', origin: 'extension', type: 'libro' });
  });

  it('el autor solo viaja con type libro', async () => {
    const f = mockFetch(200, { message: 'Guardado en Ideas' });
    await sendCapture(BASE, TOKEN, 'una idea', undefined, 'idea', 'Alguien');
    expect(JSON.parse(String(f.mock.calls[0][1].body))).toEqual({ text: 'una idea', origin: 'extension', type: 'idea' });
  });

  it('envía area trabajo y omite type si no se indica', async () => {
    const f = mockFetch(200, { message: 'Guardado en Tareas · Trabajo' });
    await sendCapture('https://x.test', TOKEN, 'informe', 'trabajo');
    expect(JSON.parse(String(f.mock.calls[0][1].body))).toEqual({ text: 'informe', origin: 'extension', area: 'trabajo' });
  });

  it('401 devuelve { ok: false } con el mensaje del servidor', async () => {
    mockFetch(401, { message: 'No autorizado' });
    expect(await sendCapture(BASE, TOKEN, 'hola')).toEqual({ ok: false, message: 'No autorizado' });
  });

  it.each(['', '   \n'])('texto vacío (%j) no llama a la red', async (text) => {
    const f = mockFetch(200, {});
    const r = await sendCapture(BASE, TOKEN, text);
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('sin token no llama a la red', async () => {
    const f = mockFetch(200, {});
    expect((await sendCapture(BASE, '', 'hola')).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('un fallo de red devuelve { ok: false } con un mensaje', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const r = await sendCapture(BASE, TOKEN, 'hola');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/conexión/);
  });
});

describe('fetchHoy', () => {
  const summary: HoySummary = {
    date: '2026-10-22',
    headline: 'Buenos días',
    events: [],
    calendarError: null,
    tasks: { personal: { items: [], more: 0 }, trabajo: { items: [], more: 0 } },
    unclassified: 0,
  };

  it('hace GET a /api/hoy con Authorization y devuelve el resumen', async () => {
    const f = mockFetch(200, summary);
    expect(await fetchHoy(BASE, TOKEN)).toEqual({ ok: true, hoy: summary });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://mini-marc-personal.vercel.app/api/hoy');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('401 devuelve { ok: false }', async () => {
    mockFetch(401, { message: 'No autorizado' });
    expect(await fetchHoy(BASE, TOKEN)).toEqual({ ok: false, message: 'No autorizado' });
  });

  it('el tipo de la extensión coincide con la respuesta del servidor', () => {
    const digest: Digest = { ...summary, dates: [], tasks: { personal: { items: [], more: 0 }, trabajo: { items: [], more: 0 } } };
    const fromServer: HoySummary = toHoyResponse(digest);
    expect(fromServer).toEqual(summary);
  });
});
