import { describe, expect, it, vi } from 'vitest';
import { moveItem, addItem, type ActionDeps } from '@/lib/actions/items';
import type { AiProvider } from '@/lib/ai/provider';
import type { CalendarGateway } from '@/lib/calendar/client';
import { captureText, type CaptureDeps } from '@/lib/capture/pipeline';
import { quickCapture } from '@/lib/capture/web';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import type { Item } from '@/lib/db/types';
import { refreshMissingPreviews, storeLinkPreview, withLinkPreviews } from '@/lib/links/preview';

const NOW = new Date('2026-10-21T08:00:00.000Z');

const noAi: AiProvider = {
  async generateJson(): Promise<never> {
    throw new Error('sin IA');
  },
  async generateText(): Promise<never> {
    throw new Error('sin IA');
  },
};

function setup() {
  const backend = createMemoryBackend({ now: () => NOW });
  const base = createItemsRepo(backend, { now: () => NOW });
  const scheduled: Item[] = [];
  const items = withLinkPreviews(base, (item) => scheduled.push(item));
  const people = createPeopleRepo(backend);
  const captureDeps: CaptureDeps = {
    ai: noAi,
    items,
    people,
    calendar: async () => ({}) as CalendarGateway,
    now: NOW,
  };
  return { backend, base, items, people, scheduled, captureDeps };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe('guardar una URL fija link y pide la vista previa', () => {
  it('quickCapture (chip Idea): la URL del texto pasa a link y se programa la vista previa', async () => {
    const t = setup();
    const r = await quickCapture(form({ kind: 'idea', text: 'Mirar https://www.amazon.es/dp/B0X luego' }), {
      captureDeps: async () => t.captureDeps,
    });
    expect(r.ok).toBe(true);
    const [item] = await t.items.listItems();
    expect(item.link).toBe('https://www.amazon.es/dp/B0X');
    expect(t.scheduled.map((i) => i.id)).toEqual([item.id]);
  });

  it('el pipeline (IA caída → Sin clasificar) también', async () => {
    const t = setup();
    const res = await captureText({ text: 'Leer https://blog.ejemplo.com/post', origin: 'siri' }, t.captureDeps);
    expect(res.items[0].link).toBe('https://blog.ejemplo.com/post');
    expect(t.scheduled).toHaveLength(1);
  });

  it('Trabajo (sin IA) también', async () => {
    const t = setup();
    const res = await captureText({ text: 'Revisar https://jira.ejemplo.com/X-1', area: 'trabajo', origin: 'web' }, t.captureDeps);
    expect(res.items[0].link).toBe('https://jira.ejemplo.com/X-1');
  });

  it('la hoja: añadir con la URL en las notas, y editar el título con una URL nueva', async () => {
    const t = setup();
    const deps: ActionDeps = { items: t.items, people: t.people };
    const added = await addItem(deps, form({ type: 'compra', title: 'Cafetera', notes: 'https://tienda.es/cafetera' }));
    expect(added.link).toBe('https://tienda.es/cafetera');
    expect(t.scheduled).toHaveLength(1);

    // Editing without touching the link: no new fetch.
    await moveItem(deps, added.id, { title: 'Cafetera roja', notes: 'https://tienda.es/cafetera' });
    expect(t.scheduled).toHaveLength(1);

    const plain = await addItem(deps, form({ type: 'idea', title: 'Sin enlace' }));
    expect(plain.link).toBeNull();
    const moved = await moveItem(deps, plain.id, { title: 'Ver https://otro.es/a' });
    expect(moved.link).toBe('https://otro.es/a');
    expect(t.scheduled.at(-1)?.id).toBe(plain.id);
  });

  it('un libro con su propio enlace lo conserva aunque las notas tengan otra URL', async () => {
    const t = setup();
    const deps: ActionDeps = { items: t.items, people: t.people };
    const book = await addItem(deps, form({ type: 'libro', title: 'Dune', link: 'https://libro.es/dune', notes: 'https://otra.es' }));
    expect(book.link).toBe('https://libro.es/dune');
  });

  it('sin URL no se programa nada', async () => {
    const t = setup();
    await t.items.createItem({ type: 'idea', title: 'Nada' });
    expect(t.scheduled).toHaveLength(0);
  });

  it('si el programador falla, el guardado sigue', async () => {
    const backend = createMemoryBackend({ now: () => NOW });
    const items = withLinkPreviews(createItemsRepo(backend), () => {
      throw new Error('boom');
    });
    const item = await items.createItem({ type: 'idea', title: 'https://a.com' });
    expect(item.link).toBe('https://a.com/');
  });
});

describe('storeLinkPreview', () => {
  it('guarda título, imagen y sitio', async () => {
    const t = setup();
    const item = await t.base.createItem({ type: 'idea', title: 'https://www.ejemplo.com/a' });
    const fetcher = vi.fn(async () => ({ title: 'Hola', image: 'https://ejemplo.com/p.jpg', site: 'Ejemplo' }));
    expect(await storeLinkPreview(t.base, item, fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('https://www.ejemplo.com/a');
    const [saved] = await t.base.listItems();
    expect(saved).toMatchObject({ linkTitle: 'Hola', linkImage: 'https://ejemplo.com/p.jpg', linkSite: 'Ejemplo' });
  });

  it('si la descarga falla guarda el dominio como sitio y no lanza', async () => {
    const t = setup();
    const item = await t.base.createItem({ type: 'idea', title: 'https://www.ejemplo.com/a' });
    expect(await storeLinkPreview(t.base, item, async () => Promise.reject(new Error('red')))).toBe(true);
    const [saved] = await t.base.listItems();
    expect(saved).toMatchObject({ linkTitle: null, linkImage: null, linkSite: 'ejemplo.com' });
  });

  it('si guardar falla (0009 sin aplicar) devuelve false, sin lanzar', async () => {
    const failing = { updateItem: async () => Promise.reject(new Error('column does not exist')) };
    expect(await storeLinkPreview(failing, { id: 'x', link: 'https://a.com' }, async () => null)).toBe(false);
  });

  it('el trabajo horario rellena las que faltan, con tope', async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) await t.base.createItem({ type: 'idea', title: `https://a.com/${i}` });
    await t.base.createItem({ type: 'idea', title: 'sin enlace' });
    const fetcher = vi.fn(async () => null);
    expect(await refreshMissingPreviews(t.base, fetcher, 2)).toBe(2);
    expect(await refreshMissingPreviews(t.base, fetcher, 5)).toBe(1);
    expect(await refreshMissingPreviews(t.base, fetcher, 5)).toBe(0);
  });
});
