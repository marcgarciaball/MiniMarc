import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import type { ActionResult } from '@/lib/actions/result';
import type { QuickCapture } from '@/lib/capture/web';
import type { Item, NewItem } from '@/lib/db/types';
import { createSharedIdea, saveSharedText, type ShareDeps } from '@/lib/share/handler';
import { isDirectSharePost, MAX_SHARED_PHOTOS, pickSharedImages, sharedPhotosMessage, shareText } from '@/lib/share/payload';
import { proxy } from '@/proxy';

const ROOT = join(__dirname, '..', '..');
const jpeg = (name = 'foto.jpg', bytes = 100) => new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });

function fakeDeps(over: { noSession?: boolean; capture?: ActionResult<QuickCapture>; failCreate?: boolean } = {}) {
  const captured: { text: string; kind: string; area: string | null }[] = [];
  const created: NewItem[] = [];
  const deps = async (): Promise<ShareDeps> => {
    if (over.noSession) throw new Error('NEXT_REDIRECT /login');
    return {
      async quickCapture(fd) {
        captured.push({ text: String(fd.get('text')), kind: String(fd.get('kind')), area: fd.get('area') as string | null });
        return over.capture ?? { ok: true, value: { message: 'Guardado en Compras', href: '/bandeja' } };
      },
      async createItem(input) {
        if (over.failCreate) throw new Error('db down');
        created.push(input);
        return { id: 'item-1', ...input } as Item;
      },
    };
  };
  return { deps, captured, created };
}

describe('shareText', () => {
  it('une título, texto y URL, sin repetir lo que ya está en el texto', () => {
    expect(shareText({ title: 'Receta', text: 'Mira esto', url: 'https://x.es/a' })).toBe('Receta\nMira esto\nhttps://x.es/a');
    expect(shareText({ title: '', text: 'Lee https://x.es/a', url: 'https://x.es/a' })).toBe('Lee https://x.es/a');
    expect(shareText({ title: 'Lee', text: 'Lee esto', url: '' })).toBe('Lee esto');
    expect(shareText({ title: '  ', text: '', url: '' })).toBe('');
  });
});

describe('pickSharedImages', () => {
  it('ignora lo que no es imagen, lo vacío o demasiado grande, y corta en el máximo', () => {
    const pdf = new File([new Uint8Array(10)], 'doc.pdf', { type: 'application/pdf' });
    const huge = jpeg('enorme.jpg', 9 * 1024 * 1024);
    const empty = jpeg('vacia.jpg', 0);
    expect(pickSharedImages([pdf, huge, empty, jpeg('a.jpg')]).map((f) => f.name)).toEqual(['a.jpg']);
    const many = Array.from({ length: MAX_SHARED_PHOTOS + 3 }, (_, i) => jpeg(`${i}.jpg`));
    expect(pickSharedImages(many)).toHaveLength(MAX_SHARED_PHOTOS);
  });
});

describe('sharedPhotosMessage', () => {
  it('dice cuántas fotos se subieron', () => {
    expect(sharedPhotosMessage(1, 1)).toBe('Guardado en Ideas con la foto');
    expect(sharedPhotosMessage(2, 2)).toBe('Guardado en Ideas con 2 fotos');
    expect(sharedPhotosMessage(0, 1)).toBe('Guardado en Ideas, pero no se ha podido subir la foto');
    expect(sharedPhotosMessage(0, 3)).toBe('Guardado en Ideas, pero no se ha podido subir ninguna foto');
    expect(sharedPhotosMessage(1, 3)).toBe('Guardado en Ideas con 1 de 3 fotos');
  });
});

describe('saveSharedText (acción «Guardar» de /compartir)', () => {
  it('sin sesión: no guarda nada', async () => {
    const t = fakeDeps({ noSession: true });
    const r = await saveSharedText('Comprar leche', t.deps);
    expect(r.ok).toBe(false);
    expect(t.captured).toEqual([]);
  });

  it('va a la captura rápida en modo Auto y devuelve el aviso', async () => {
    const t = fakeDeps();
    const r = await saveSharedText('Comprar leche', t.deps);
    expect(t.captured).toEqual([{ text: 'Comprar leche', kind: 'auto', area: null }]);
    expect(r).toEqual({ ok: true, value: { message: 'Guardado en Compras' } });
    expect(t.created).toEqual([]);
  });

  it('si la captura falla, devuelve el error', async () => {
    const t = fakeDeps({ capture: { ok: false, error: 'No se ha podido guardar.' } });
    expect(await saveSharedText('algo', t.deps)).toEqual({ ok: false, error: 'No se ha podido guardar.' });
  });

  it('texto vacío o que no es texto: nada que guardar', async () => {
    const t = fakeDeps();
    expect(await saveSharedText('  ', t.deps)).toEqual({ ok: false, error: 'No había nada que guardar' });
    expect(await saveSharedText(42, t.deps)).toEqual({ ok: false, error: 'No había nada que guardar' });
    expect(t.captured).toEqual([]);
  });
});

describe('createSharedIdea (acción «Guardar» con fotos)', () => {
  it('sin sesión: no crea nada', async () => {
    const t = fakeDeps({ noSession: true });
    expect((await createSharedIdea('', t.deps)).ok).toBe(false);
    expect(t.created).toEqual([]);
  });

  it('sin texto: una idea «Foto compartida», sin IA', async () => {
    const t = fakeDeps();
    const r = await createSharedIdea('', t.deps);
    expect(r).toEqual({ ok: true, value: { itemId: 'item-1' } });
    expect(t.captured).toEqual([]);
    expect(t.created).toEqual([expect.objectContaining({ type: 'idea', title: 'Foto compartida', origin: 'web', sourceText: null })]);
  });

  it('con texto: el texto es el título de la idea', async () => {
    const t = fakeDeps();
    await createSharedIdea('Lámpara para el salón', t.deps);
    expect(t.created[0]).toMatchObject({ type: 'idea', title: 'Lámpara para el salón', sourceText: 'Lámpara para el salón' });
  });

  it('si no se puede crear la idea, el aviso lo dice', async () => {
    const t = fakeDeps({ failCreate: true });
    expect(await createSharedIdea('x', t.deps)).toEqual({ ok: false, error: 'No se ha podido guardar. Inténtalo de nuevo.' });
  });

  it('texto demasiado largo: no crea nada', async () => {
    const t = fakeDeps();
    expect((await createSharedIdea('x'.repeat(2001), t.deps)).ok).toBe(false);
    expect(t.created).toEqual([]);
  });
});

describe('POST directo a /compartir (CSRF, I-1)', () => {
  it('isDirectSharePost: solo un POST a /compartir que no es una acción de servidor', () => {
    const h = (o: Record<string, string> = {}) => new Headers(o);
    expect(isDirectSharePost('POST', '/compartir', h())).toBe(true);
    expect(isDirectSharePost('POST', '/compartir', h({ 'next-action': 'abc' }))).toBe(false);
    expect(isDirectSharePost('GET', '/compartir', h())).toBe(false);
    expect(isDirectSharePost('POST', '/bandeja', h())).toBe(false);
  });

  it('el proxy responde 303 a /compartir sin tocar nada (ni sesión ni base de datos)', async () => {
    const fd = new FormData();
    fd.set('text', 'Cita mañana a las 9 con el dentista');
    fd.append('photos', jpeg());
    const req = new NextRequest('https://agente.test/compartir', {
      method: 'POST',
      body: fd,
      headers: { origin: 'https://malo.example', cookie: 'sb-access-token=x' },
    });
    const res = await proxy(req);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/compartir');
    expect(new URL(res.headers.get('location')!).search).toBe('');
  });

  it('ya no existe ningún manejador POST de /compartir en el servidor', () => {
    expect(existsSync(join(ROOT, 'app/compartir/route.ts'))).toBe(false);
    expect(existsSync(join(ROOT, 'app/(app)/compartir/route.ts'))).toBe(false);
  });

  it('el service worker guarda lo compartido en el dispositivo y nunca lo envía al servidor', () => {
    const sw = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
    expect(sw).toMatch(/indexedDB\.open/);
    expect(sw).not.toMatch(/fetch\(\s*['"]\/compartir/);
    expect(sw).not.toMatch(/fetch\(original\)/);
    expect(sw).toMatch(/\/compartir\?id=/);
  });
});
