import { describe, expect, it } from 'vitest';
import type { ActionResult } from '@/lib/actions/result';
import type { QuickCapture } from '@/lib/capture/web';
import type { Item, NewItem } from '@/lib/db/types';
import { handleShare, shareText, type ShareDeps } from '@/lib/share/handler';

const BASE = 'https://agente.test';

function shareRequest(fields: Record<string, string>, files: File[] = []): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  for (const f of files) fd.append('photos', f);
  return new Request(`${BASE}/compartir`, { method: 'POST', body: fd });
}

const jpeg = (name = 'foto.jpg', bytes = 100) => new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });

function fakeDeps(over: { user?: string | null; capture?: ActionResult<QuickCapture>; failUpload?: boolean; failCreate?: boolean } = {}) {
  const captured: { text: string; kind: string; area: string | null }[] = [];
  const created: NewItem[] = [];
  const uploaded: { userId: string; itemId: string; name: string }[] = [];
  const deps: ShareDeps = {
    async userId() {
      return over.user === undefined ? 'user-1' : over.user;
    },
    async quickCapture(fd) {
      captured.push({ text: String(fd.get('text')), kind: String(fd.get('kind')), area: fd.get('area') as string | null });
      return over.capture ?? { ok: true, value: { message: 'Guardado en Compras', href: '/bandeja' } };
    },
    async createItem(input) {
      if (over.failCreate) throw new Error('db down');
      created.push(input);
      return { id: 'item-1', ...input } as Item;
    },
    async savePhoto(userId, itemId, file) {
      if (over.failUpload) throw new Error('storage down');
      uploaded.push({ userId, itemId, name: file.name });
    },
  };
  return { deps, captured, created, uploaded };
}

function location(res: Response): URL {
  expect(res.status).toBe(303);
  return new URL(res.headers.get('Location')!, BASE);
}

describe('shareText', () => {
  it('une título, texto y URL, sin repetir lo que ya está en el texto', () => {
    expect(shareText({ title: 'Receta', text: 'Mira esto', url: 'https://x.es/a' })).toBe('Receta\nMira esto\nhttps://x.es/a');
    expect(shareText({ title: '', text: 'Lee https://x.es/a', url: 'https://x.es/a' })).toBe('Lee https://x.es/a');
    expect(shareText({ title: 'Lee', text: 'Lee esto', url: '' })).toBe('Lee esto');
    expect(shareText({ title: '  ', text: '', url: '' })).toBe('');
  });
});

describe('handleShare', () => {
  it('sin sesión: redirige a /login y no guarda nada', async () => {
    const t = fakeDeps({ user: null });
    const res = await handleShare(shareRequest({ text: 'Comprar leche' }), t.deps);
    expect(location(res).pathname).toBe('/login');
    expect(t.captured).toEqual([]);
    expect(t.created).toEqual([]);
  });

  it('solo texto: va a la captura rápida en modo Auto y vuelve a la Bandeja con el aviso', async () => {
    const t = fakeDeps();
    const res = await handleShare(shareRequest({ title: '', text: 'Comprar leche', url: '' }), t.deps);
    expect(t.captured).toEqual([{ text: 'Comprar leche', kind: 'auto', area: null }]);
    const to = location(res);
    expect(to.pathname).toBe('/bandeja');
    expect(to.searchParams.get('guardado')).toBe('Guardado en Compras');
    expect(t.created).toEqual([]);
  });

  it('una URL: el texto de la captura lleva el título y la URL', async () => {
    const t = fakeDeps({ capture: { ok: true, value: { message: 'Guardado en Ideas', href: '/bandeja' } } });
    const res = await handleShare(shareRequest({ title: 'Sofá nórdico', text: '', url: 'https://tienda.es/sofa' }), t.deps);
    expect(t.captured.map((c) => c.text)).toEqual(['Sofá nórdico\nhttps://tienda.es/sofa']);
    expect(location(res).searchParams.get('guardado')).toBe('Guardado en Ideas');
  });

  it('si la captura falla, el aviso dice el error', async () => {
    const t = fakeDeps({ capture: { ok: false, error: 'No se ha podido guardar.' } });
    const res = await handleShare(shareRequest({ text: 'algo' }), t.deps);
    expect(location(res).searchParams.get('guardado')).toBe('No se ha podido guardar.');
  });

  it('una imagen sin texto: crea una idea «Foto compartida» con la foto adjunta, sin IA', async () => {
    const t = fakeDeps();
    const res = await handleShare(shareRequest({}, [jpeg()]), t.deps);
    expect(t.captured).toEqual([]);
    expect(t.created).toEqual([expect.objectContaining({ type: 'idea', title: 'Foto compartida', origin: 'web' })]);
    expect(t.uploaded).toEqual([{ userId: 'user-1', itemId: 'item-1', name: 'foto.jpg' }]);
    const to = location(res);
    expect(to.pathname).toBe('/bandeja');
    expect(to.searchParams.get('guardado')).toBe('Guardado en Ideas con la foto');
  });

  it('imágenes con texto: el texto es el título de la idea y se adjuntan todas', async () => {
    const t = fakeDeps();
    const res = await handleShare(shareRequest({ text: 'Lámpara para el salón' }, [jpeg('a.jpg'), jpeg('b.jpg')]), t.deps);
    expect(t.created[0]).toMatchObject({ type: 'idea', title: 'Lámpara para el salón', sourceText: 'Lámpara para el salón' });
    expect(t.uploaded.map((u) => u.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(location(res).searchParams.get('guardado')).toBe('Guardado en Ideas con 2 fotos');
  });

  it('si la foto no se puede subir, la idea queda guardada y el aviso lo dice', async () => {
    const t = fakeDeps({ failUpload: true });
    const res = await handleShare(shareRequest({ text: 'Lámpara' }, [jpeg()]), t.deps);
    expect(t.created).toHaveLength(1);
    expect(location(res).searchParams.get('guardado')).toBe('Guardado en Ideas, pero no se ha podido subir la foto');
  });

  it('ignora archivos que no son imágenes o son demasiado grandes', async () => {
    const t = fakeDeps();
    const pdf = new File([new Uint8Array(10)], 'doc.pdf', { type: 'application/pdf' });
    const huge = jpeg('enorme.jpg', 9 * 1024 * 1024);
    const res = await handleShare(shareRequest({ text: 'Nota' }, [pdf, huge]), t.deps);
    expect(t.created).toEqual([]);
    expect(t.captured.map((c) => c.text)).toEqual(['Nota']);
    expect(location(res).searchParams.get('guardado')).toBe('Guardado en Compras');
  });

  it('si no se puede crear la idea, el aviso lo dice', async () => {
    const t = fakeDeps({ failCreate: true });
    const res = await handleShare(shareRequest({}, [jpeg()]), t.deps);
    expect(location(res).searchParams.get('guardado')).toBe('No se ha podido guardar. Inténtalo de nuevo.');
  });

  it('nada que guardar: vuelve a la Bandeja sin capturar', async () => {
    const t = fakeDeps();
    const res = await handleShare(shareRequest({ title: ' ', text: '' }), t.deps);
    expect(t.captured).toEqual([]);
    expect(location(res).searchParams.get('guardado')).toBe('No había nada que guardar');
  });

  it('un cuerpo que no es un formulario no rompe: vuelve a la Bandeja', async () => {
    const t = fakeDeps();
    const res = await handleShare(new Request(`${BASE}/compartir`, { method: 'POST', body: 'x' }), t.deps);
    expect(location(res).pathname).toBe('/bandeja');
  });
});
