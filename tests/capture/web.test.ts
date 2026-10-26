import { describe, expect, it, vi } from 'vitest';
import type { AiProvider } from '@/lib/ai/provider';
import { captureText, type CaptureDeps } from '@/lib/capture/pipeline';
import { captureFromWeb, type WebCaptureDeps } from '@/lib/capture/web';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';

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

function setup(ai: AiProvider = aiForbidden()) {
  const backend = createMemoryBackend({ now: () => NOW });
  const items = createItemsRepo(backend, { now: () => NOW });
  const captureDeps: CaptureDeps = {
    ai,
    items,
    people: createPeopleRepo(backend),
    calendar: async () => {
      throw new Error('no calendar in this test');
    },
    now: NOW,
  };
  const deps: WebCaptureDeps = { captureDeps: async () => captureDeps };
  return { items, deps };
}

describe('captureFromWeb', () => {
  it('con el interruptor Trabajo activo llama al pipeline con area:"trabajo" y origin:"web"', async () => {
    const { deps } = setup();
    const capture = vi.fn(captureText);
    const res = await captureFromWeb(form({ text: 'Revisar presupuesto Q4', area: 'trabajo' }), { ...deps, capture });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0]).toEqual({ text: 'Revisar presupuesto Q4', area: 'trabajo', origin: 'web' });
    expect(res).toEqual({ ok: true, value: { message: 'Guardado en Tareas · Trabajo' } });
  });

  it('Trabajo nunca llega a la IA y se guarda como tarea de Trabajo', async () => {
    const ai = aiForbidden();
    const { deps, items } = setup(ai);
    await captureFromWeb(form({ text: 'Llamar al cliente', area: 'trabajo' }), deps);
    expect(ai.calls).toBe(0);
    const saved = await items.listItems();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ type: 'tarea', area: 'trabajo', title: 'Llamar al cliente', origin: 'web' });
  });

  it('sin el interruptor no pasa área: guarda el texto y deja la IA para después', async () => {
    const { deps, items } = setup(aiReturning([{ kind: 'compra', title: 'Leche', confidence: 0.9 }]));
    const capture = vi.fn(captureText);
    const res = await captureFromWeb(form({ text: 'comprar leche' }), { ...deps, capture });
    expect(capture.mock.calls[0][0]).toEqual({ text: 'comprar leche', origin: 'web' });
    expect(res).toEqual({ ok: true, value: { message: 'Guardado en Sin clasificar' } });
    expect(await items.listItems()).toMatchObject([{ title: 'comprar leche', aiState: 'pendiente' }]);
  });

  it('ignora un valor de área distinto de "trabajo"', async () => {
    const { deps } = setup(aiReturning([{ kind: 'idea', title: 'X', confidence: 0.9 }]));
    const capture = vi.fn(captureText);
    await captureFromWeb(form({ text: 'algo', area: 'personal' }), { ...deps, capture });
    expect(capture.mock.calls[0][0]).toEqual({ text: 'algo', origin: 'web' });
  });

  it.each(['', '   \n'])('rechaza un texto vacío (%j) sin guardar nada', async (text) => {
    const { deps, items } = setup();
    const res = await captureFromWeb(form({ text }), deps);
    expect(res).toEqual({ ok: false, error: 'El texto está vacío' });
    expect(await items.listItems()).toEqual([]);
  });

  it('rechaza más de 2000 caracteres sin guardar nada', async () => {
    const { deps, items } = setup();
    const res = await captureFromWeb(form({ text: 'a'.repeat(2001), area: 'trabajo' }), deps);
    expect(res).toEqual({ ok: false, error: 'El texto supera los 2000 caracteres' });
    expect(await items.listItems()).toEqual([]);
  });

  it('si el guardado falla devuelve un error en español, sin lanzar', async () => {
    const res = await captureFromWeb(form({ text: 'Algo', area: 'trabajo' }), {
      captureDeps: async () => {
        throw new Error('db down');
      },
    });
    expect(res).toEqual({ ok: false, error: 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.' });
  });

  it('deja pasar lo que `rethrow` relanza (redirect a /login)', async () => {
    const redirect = new Error('NEXT_REDIRECT');
    const res = captureFromWeb(form({ text: 'Algo' }), {
      captureDeps: async () => {
        throw redirect;
      },
      rethrow: (e) => {
        if (e === redirect) throw e;
      },
    });
    await expect(res).rejects.toBe(redirect);
  });

});
