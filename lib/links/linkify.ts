/**
 * Links inside titles and notes. Pure (no DOM), used by the client (LinkText) and the server
 * (deriveLink on save). Only http and https become links: anything else (javascript:, data:…)
 * stays plain text. React renders the segments as text nodes and <a>, never as HTML.
 */

export type LinkSegment = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

/** http(s)://… or www.… up to the next whitespace; trailing punctuation is trimmed below. */
const CANDIDATE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const TRAILING = /[.,;:!?'»”’…*_]+$/;

/** Longest path segment shown by shortUrl. */
const SEGMENT_MAX = 12;

/** The candidate without trailing punctuation, nor a closing bracket it did not open. */
function trimCandidate(raw: string): string {
  let s = raw;
  for (;;) {
    const before = s;
    s = s.replace(TRAILING, '');
    const last = s.at(-1);
    const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    if (last && pairs[last]) {
      const open = s.split(pairs[last]).length - 1;
      const close = s.split(last).length - 1;
      if (close > open) s = s.slice(0, -1);
    }
    if (s === before) return s;
  }
}

/** The normalised href when `text` is an http(s) URL with a host; null otherwise. */
export function safeHref(text: string): string | null {
  const raw = /^www\./i.test(text) ? `https://${text}` : text;
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** "amazon.es/…": the domain without www, plus a short first path segment when there is one. */
export function shortUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const host = url.hostname.replace(/^www\./i, '');
  const segs = url.pathname.split('/').filter(Boolean);
  const extra = Boolean(url.search || url.hash);
  if (segs.length === 0) return extra ? `${host}/…` : host;
  const first = decodeSafe(segs[0]);
  if (first.length > SEGMENT_MAX) return `${host}/…`;
  return segs.length === 1 && !extra ? `${host}/${first}` : `${host}/${first}/…`;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Splits `text` into plain text and http(s) links (shown shortened). */
export function linkify(text: string): LinkSegment[] {
  const out: LinkSegment[] = [];
  let last = 0;
  const pushText = (t: string) => {
    if (!t) return;
    const prev = out.at(-1);
    if (prev?.kind === 'text') prev.text += t;
    else out.push({ kind: 'text', text: t });
  };
  for (const m of text.matchAll(CANDIDATE)) {
    const start = m.index;
    const candidate = trimCandidate(m[0]);
    const href = safeHref(candidate);
    if (!href) continue;
    pushText(text.slice(last, start));
    out.push({ kind: 'link', href, text: shortUrl(href) });
    last = start + candidate.length;
  }
  pushText(text.slice(last));
  return out;
}

/** Every http(s) URL in `text`, in order, normalised. */
export function extractUrls(text: string): string[] {
  return linkify(text).flatMap((s) => (s.kind === 'link' ? [s.href] : []));
}

/**
 * The link an item should have when saved: its own `link` if it has one; otherwise the first
 * URL of the title, then of the notes; otherwise null. The one helper every save path uses.
 */
export function deriveLink(f: { title?: string | null; notes?: string | null; link?: string | null }): string | null {
  const own = f.link?.trim();
  if (own) return own;
  return extractUrls(f.title ?? '')[0] ?? extractUrls(f.notes ?? '')[0] ?? null;
}
