/**
 * A small Open Graph / Twitter card reader for link previews. Pure and dependency-free: regexes
 * over the first 512 KB of HTML (the fetch caps it), not a full HTML parser. Only reads <meta>
 * and <title>, after dropping comments, scripts and styles.
 */

export type LinkPreview = { title: string | null; image: string | null; site: string | null };

const TITLE_MAX = 300;
const SITE_MAX = 100;
const IMAGE_MAX = 2000;

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  ccedil: 'ç', Ccedil: 'Ç', agrave: 'à', egrave: 'è', ograve: 'ò', iexcl: '¡', iquest: '¿',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', euro: '€', copy: '©', reg: '®', trade: '™', middot: '·',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[code] ?? m;
  });
}

const clean = (s: string | undefined, max: number): string | null => {
  const v = s === undefined ? '' : decodeEntities(s).replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, max) : null;
};

/** name → value of every attribute of one tag ("<meta a="1" b='2' c=3>"), names lowercased. */
function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=/<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const m of tag.matchAll(re)) out[m[1].toLowerCase()] ??= m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

function absoluteImage(src: string | null, base: string): string | null {
  if (!src) return null;
  try {
    const url = new URL(src, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href.length <= IMAGE_MAX ? url.href : null;
  } catch {
    return null;
  }
}

/** Title, image (absolute, http/https only) and site name of a page; null for what is missing. */
export function parsePreview(html: string, baseUrl: string): LinkPreview {
  const doc = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '');

  const meta = new Map<string, string>();
  for (const m of doc.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(m[0]);
    const key = (a.property ?? a.name ?? '').toLowerCase().trim();
    const value = a.content;
    if (!key || value === undefined || !value.trim() || meta.has(key)) continue;
    meta.set(key, value);
  }
  const first = (...keys: string[]) => keys.map((k) => meta.get(k)).find((v) => v !== undefined);

  const titleTag = doc.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const title = clean(first('og:title', 'twitter:title'), TITLE_MAX) ?? clean(titleTag, TITLE_MAX);
  const image = absoluteImage(
    clean(first('og:image', 'og:image:secure_url', 'og:image:url', 'twitter:image', 'twitter:image:src'), IMAGE_MAX),
    baseUrl,
  );
  const site = clean(first('og:site_name', 'application-name'), SITE_MAX);
  return { title, image, site };
}
