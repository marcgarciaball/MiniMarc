import { describe, expect, it } from 'vitest';
import { parsePreview } from '@/lib/links/ogParser';

const BASE = 'https://www.ejemplo.com/libros/uno';

describe('parsePreview', () => {
  it('lee og:title, og:image y og:site_name', () => {
    const html = `<!doctype html><html><head>
      <title>Título de la pestaña</title>
      <meta property="og:title" content="El nombre del viento">
      <meta property="og:image" content="https://cdn.ejemplo.com/portada.jpg" />
      <meta property="og:site_name" content="Casa del Libro">
    </head><body></body></html>`;
    expect(parsePreview(html, BASE)).toEqual({
      title: 'El nombre del viento',
      image: 'https://cdn.ejemplo.com/portada.jpg',
      site: 'Casa del Libro',
    });
  });

  it('atributos en cualquier orden, comillas simples y mayúsculas', () => {
    const html = `<META CONTENT='Hola' PROPERTY='og:title'><meta content="/img/a.png" name="twitter:image">`;
    expect(parsePreview(html, BASE)).toMatchObject({ title: 'Hola', image: 'https://www.ejemplo.com/img/a.png' });
  });

  it('sin og: usa twitter:* y después <title>', () => {
    expect(parsePreview('<meta name="twitter:title" content="Tuit"><title>T</title>', BASE).title).toBe('Tuit');
    expect(parsePreview('<title>\n  Solo título  \n</title>', BASE)).toEqual({ title: 'Solo título', image: null, site: null });
  });

  it('hace absoluta la imagen relativa (también //cdn…) y descarta esquemas que no son http(s)', () => {
    expect(parsePreview('<meta property="og:image" content="../p.jpg">', BASE).image).toBe('https://www.ejemplo.com/p.jpg');
    expect(parsePreview('<meta property="og:image" content="//cdn.x.com/p.jpg">', BASE).image).toBe('https://cdn.x.com/p.jpg');
    expect(parsePreview('<meta property="og:image" content="javascript:alert(1)">', BASE).image).toBeNull();
    expect(parsePreview('<meta property="og:image" content="data:image/png;base64,AAA">', BASE).image).toBeNull();
  });

  it('decodifica entidades HTML', () => {
    const html = '<meta property="og:title" content="Caf&eacute; &amp; t&#233; &#x2014; &quot;ya&quot; &lt;b&gt;">';
    expect(parsePreview(html, BASE).title).toBe('Café & té — "ya" <b>');
  });

  it('og:image:secure_url y og:image:url valen como imagen', () => {
    expect(parsePreview('<meta property="og:image:secure_url" content="https://a.com/s.jpg">', BASE).image).toBe('https://a.com/s.jpg');
  });

  it('sin nada útil: todo null', () => {
    expect(parsePreview('<html><body>Hola</body></html>', BASE)).toEqual({ title: null, image: null, site: null });
  });

  it('ignora metas vacíos y recorta títulos larguísimos', () => {
    const long = 'x'.repeat(1000);
    const r = parsePreview(`<meta property="og:title" content="  "><meta name="twitter:title" content="${long}">`, BASE);
    expect(r.title?.length).toBeLessThanOrEqual(300);
  });

  it('no confunde metas dentro de comentarios ni de scripts', () => {
    const html = '<!-- <meta property="og:title" content="Falso"> --><script>var s=\'<meta property="og:title" content="Script">\'</script><title>Real</title>';
    expect(parsePreview(html, BASE).title).toBe('Real');
  });
});
