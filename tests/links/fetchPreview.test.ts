import { describe, expect, it, vi } from 'vitest';
import { fetchLinkPreview, PreviewBlockedError, type FetchPreviewDeps, type PreviewResponse } from '@/lib/links/fetchPreview';

const html = (title: string) => `<head><meta property="og:title" content="${title}"><meta property="og:image" content="/p.jpg"></head>`;

function deps(
  dns: Record<string, string[]>,
  pages: Record<string, Partial<PreviewResponse>>,
): FetchPreviewDeps & { get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async ({ url }: { url: URL }) => {
    const p = pages[url.href];
    if (!p) throw new Error(`no page ${url.href}`);
    return { status: 200, location: null, contentType: 'text/html; charset=utf-8', body: '', ...p };
  });
  return {
    resolve: async (host) => dns[host] ?? [],
    get,
  };
}

describe('fetchLinkPreview', () => {
  it('resuelve, comprueba la IP, se conecta a esa IP y lee la vista previa', async () => {
    const d = deps({ 'ejemplo.com': ['93.184.216.34'] }, { 'https://ejemplo.com/a': { body: html('Hola') } });
    expect(await fetchLinkPreview('https://ejemplo.com/a', d)).toEqual({
      title: 'Hola',
      image: 'https://ejemplo.com/p.jpg',
      site: null,
    });
    const call = d.get.mock.calls[0][0];
    expect(call.address).toBe('93.184.216.34');
    expect(call.headers['User-Agent']).toMatch(/Mozilla\/5\.0/);
    expect(call.maxBytes).toBe(512 * 1024);
  });

  it('rechaza un nombre que resuelve a una IP privada (también si solo una de varias lo es)', async () => {
    const d = deps({ 'interno.ejemplo.com': ['8.8.8.8', '10.0.0.5'] }, {});
    await expect(fetchLinkPreview('https://interno.ejemplo.com/', d)).rejects.toBeInstanceOf(PreviewBlockedError);
    expect(d.get).not.toHaveBeenCalled();
  });

  it('rechaza esquemas que no son http(s) y nombres sin direcciones', async () => {
    const d = deps({}, {});
    await expect(fetchLinkPreview('file:///etc/passwd', d)).rejects.toBeInstanceOf(PreviewBlockedError);
    await expect(fetchLinkPreview('https://nada.ejemplo.com/', d)).rejects.toBeInstanceOf(PreviewBlockedError);
  });

  it('sigue redirecciones y comprueba cada salto (una a 169.254.169.254 se corta)', async () => {
    const d = deps(
      { 'a.com': ['1.1.1.1'], 'b.com': ['8.8.8.8'] },
      {
        'https://a.com/': { status: 301, location: '/dos' },
        'https://a.com/dos': { status: 302, location: 'https://b.com/x' },
        'https://b.com/x': { body: html('Final') },
      },
    );
    expect((await fetchLinkPreview('https://a.com/', d))?.title).toBe('Final');

    const evil = deps({ 'a.com': ['1.1.1.1'] }, { 'https://a.com/': { status: 302, location: 'http://169.254.169.254/latest/meta-data' } });
    await expect(fetchLinkPreview('https://a.com/', evil)).rejects.toBeInstanceOf(PreviewBlockedError);
    expect(evil.get).toHaveBeenCalledTimes(1);
  });

  it('como mucho 3 redirecciones', async () => {
    const d = deps(
      { 'a.com': ['1.1.1.1'] },
      {
        'https://a.com/0': { status: 302, location: '/1' },
        'https://a.com/1': { status: 302, location: '/2' },
        'https://a.com/2': { status: 302, location: '/3' },
        'https://a.com/3': { status: 302, location: '/4' },
        'https://a.com/4': { body: html('Demasiado') },
      },
    );
    await expect(fetchLinkPreview('https://a.com/0', d)).rejects.toThrow(/redirecciones/);
    expect(d.get).toHaveBeenCalledTimes(4);
  });

  it('lo que no es HTML o no es 2xx no da vista previa', async () => {
    const d = deps(
      { 'a.com': ['1.1.1.1'] },
      { 'https://a.com/img.jpg': { contentType: 'image/jpeg', body: 'xx' }, 'https://a.com/404': { status: 404, body: html('No') } },
    );
    expect(await fetchLinkPreview('https://a.com/img.jpg', d)).toBeNull();
    expect(await fetchLinkPreview('https://a.com/404', d)).toBeNull();
  });

  it('se rinde a los 5 s', async () => {
    vi.useFakeTimers();
    try {
      const d: FetchPreviewDeps = {
        resolve: async () => ['1.1.1.1'],
        get: ({ signal }) =>
          new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
      };
      const p = fetchLinkPreview('https://a.com/', d);
      const check = expect(p).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(5000);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });
});
