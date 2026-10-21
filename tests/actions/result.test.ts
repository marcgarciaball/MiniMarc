import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createItemsRepo } from '@/lib/db/items';
import { createPeopleRepo } from '@/lib/db/people';
import * as actions from '@/lib/actions/items';
import type { ActionDeps } from '@/lib/actions/items';
import { attempt, settle } from '@/lib/actions/result';

let deps: ActionDeps;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  const backend = createMemoryBackend();
  deps = { items: createItemsRepo(backend), people: createPeopleRepo(backend) };
});

describe('attempt: las acciones devuelven un resultado, nunca lanzan a la interfaz', () => {
  it('éxito → { ok: true, value }', async () => {
    const r = await attempt(() => actions.addItem(deps, form({ type: 'idea', title: 'Viaje' })), 'fallo');
    expect(r).toMatchObject({ ok: true, value: { title: 'Viaje' } });
  });

  it('error de validación → su mensaje en español, y no se guarda nada', async () => {
    const r = await attempt(() => actions.addItem(deps, form({ type: 'tarea', title: '  ' })), 'fallo');
    expect(r).toEqual({ ok: false, error: 'El título no puede estar vacío' });
    expect(await deps.items.listItems()).toEqual([]);
  });

  it('fecha de cumpleaños inválida → mensaje en español', async () => {
    const r = await attempt(() => actions.addPerson(deps, form({ name: 'Ana', birthday: '1990-13-40' })), 'fallo');
    expect(r).toEqual({ ok: false, error: 'La fecha no es válida.' });
  });

  it('error interno (repo, zod, red) → el mensaje genérico, sin detalles técnicos', async () => {
    const broken: ActionDeps = { ...deps, items: { ...deps.items, createItem: () => Promise.reject(new Error('ECONNRESET')) } };
    const r = await attempt(() => actions.addItem(broken, form({ type: 'idea', title: 'X' })), 'No se ha podido añadir.');
    expect(r).toEqual({ ok: false, error: 'No se ha podido añadir.' });
    const z = await attempt(() => actions.addItem(deps, form({ type: 'cita', title: 'X' })), 'Genérico');
    expect(z).toEqual({ ok: false, error: 'Genérico' });
  });

  it('deja pasar los errores de control del framework (redirect) con rethrow', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
    const rethrow = (e: unknown) => {
      if (e === redirect) throw e;
    };
    await expect(attempt(() => Promise.reject(redirect), 'fallo', rethrow)).rejects.toBe(redirect);
  });
});

describe('settle: el cliente convierte un fallo de red en un resultado', () => {
  it('pasa el resultado tal cual', async () => {
    await expect(settle(async () => ({ ok: true as const, value: 1 }), 'x')).resolves.toEqual({ ok: true, value: 1 });
  });

  it('si la llamada lanza (sin conexión) devuelve el mensaje de reserva', async () => {
    await expect(settle(() => Promise.reject(new TypeError('Failed to fetch')), 'Sin conexión')).resolves.toEqual({
      ok: false,
      error: 'Sin conexión',
    });
  });
});
