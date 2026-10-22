import { describe, expect, it } from 'vitest';
import { deriveLink, extractUrls, linkify, shortUrl } from '@/lib/links/linkify';

describe('linkify', () => {
  it('texto sin enlaces: un solo segmento de texto', () => {
    expect(linkify('Comprar pan')).toEqual([{ kind: 'text', text: 'Comprar pan' }]);
  });

  it('cadena vacía: sin segmentos', () => {
    expect(linkify('')).toEqual([]);
  });

  it('separa texto y enlace, con el enlace acortado al dominio y un trozo de ruta', () => {
    expect(linkify('Mira https://www.amazon.es/dp/B0ABCDEFGH/ref=sr_1 mañana')).toEqual([
      { kind: 'text', text: 'Mira ' },
      { kind: 'link', href: 'https://www.amazon.es/dp/B0ABCDEFGH/ref=sr_1', text: 'amazon.es/dp/…' },
      { kind: 'text', text: ' mañana' },
    ]);
  });

  it('deja fuera la puntuación final y el paréntesis de cierre que no es suyo', () => {
    const segs = linkify('(ver https://ejemplo.com/a.) y https://es.wikipedia.org/wiki/Foo_(bar), fin');
    const links = segs.filter((s) => s.kind === 'link').map((s) => s.href);
    expect(links).toEqual(['https://ejemplo.com/a', 'https://es.wikipedia.org/wiki/Foo_(bar)']);
    expect(segs.map((s) => (s.kind === 'link' ? s.href : s.text)).join('')).toBe(
      '(ver https://ejemplo.com/a.) y https://es.wikipedia.org/wiki/Foo_(bar), fin',
    );
  });

  it('www. sin esquema se enlaza con https', () => {
    expect(linkify('www.casadellibro.com')).toEqual([
      { kind: 'link', href: 'https://www.casadellibro.com/', text: 'casadellibro.com' },
    ]);
  });

  it('solo http y https: javascript:, data:, ftp: y mailto: quedan como texto', () => {
    for (const t of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://ejemplo.com/x', 'mailto:a@b.es']) {
      expect(linkify(t).every((s) => s.kind === 'text')).toBe(true);
    }
  });

  it('no enlaza un esquema sin host', () => {
    expect(linkify('https:// nada').every((s) => s.kind === 'text')).toBe(true);
  });

  it('mayúsculas en el esquema', () => {
    expect(linkify('HTTPS://Ejemplo.com/X')[0]).toMatchObject({ kind: 'link', href: 'https://ejemplo.com/X' });
  });

  it('varios enlaces seguidos en líneas distintas', () => {
    const segs = linkify('https://a.com\nhttps://b.com/x');
    expect(segs.filter((s) => s.kind === 'link')).toHaveLength(2);
    expect(segs[1]).toEqual({ kind: 'text', text: '\n' });
  });
});

describe('shortUrl', () => {
  it('dominio sin www, y la ruta corta o «…»', () => {
    expect(shortUrl('https://www.amazon.es/')).toBe('amazon.es');
    expect(shortUrl('https://amazon.es/dp')).toBe('amazon.es/dp');
    expect(shortUrl('https://amazon.es/dp/B0ABC')).toBe('amazon.es/dp/…');
    expect(shortUrl('https://amazon.es/un-titulo-de-producto-muy-largo')).toBe('amazon.es/…');
    expect(shortUrl('https://amazon.es/?q=1')).toBe('amazon.es/…');
  });

  it('texto que no es URL: tal cual', () => {
    expect(shortUrl('no es url')).toBe('no es url');
  });
});

describe('extractUrls / deriveLink', () => {
  it('extrae las URL http(s) en orden', () => {
    expect(extractUrls('a https://x.com/1 b www.y.es c')).toEqual(['https://x.com/1', 'https://www.y.es/']);
  });

  it('sin link: toma la primera URL del título y, si no, de las notas', () => {
    expect(deriveLink({ title: 'Ver https://a.com/x', notes: 'https://b.com', link: null })).toBe('https://a.com/x');
    expect(deriveLink({ title: 'Ver esto', notes: 'en https://b.com/y', link: null })).toBe('https://b.com/y');
  });

  it('con link: lo respeta', () => {
    expect(deriveLink({ title: 'https://a.com', notes: null, link: 'https://mio.es' })).toBe('https://mio.es');
  });

  it('sin URL en ningún sitio: null', () => {
    expect(deriveLink({ title: 'Pan', notes: null, link: null })).toBeNull();
    expect(deriveLink({ title: 'Pan', notes: undefined, link: '  ' })).toBeNull();
  });
});
