/**
 * Fetches a link's preview (og:title, og:image, og:site_name…) on the server, resisting SSRF:
 *   - http/https only, default ports, no credentials, no local names (checkFetchUrl);
 *   - the name is resolved and EVERY address must be public (isPublicAddress); the connection is
 *     then made to that checked address (pinned via `lookup`), so DNS rebinding cannot swap it;
 *   - at most 3 redirects, each one checked again from scratch;
 *   - 5 s in total, and at most 512 KB of (decompressed) body;
 *   - a normal browser User-Agent.
 * The checks are pure and the transport is injected (`FetchPreviewDeps`), so tests need no network.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import zlib from 'node:zlib';
import { checkFetchUrl, isIpLiteral, isPublicAddress } from './ipGuard';
import { parsePreview, type LinkPreview } from './ogParser';

export const PREVIEW_TIMEOUT_MS = 5000;
export const PREVIEW_MAX_BYTES = 512 * 1024;
export const PREVIEW_MAX_REDIRECTS = 3;

export const PREVIEW_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

export type PreviewResponse = { status: number; location: string | null; contentType: string; body: string };

export interface PreviewRequest {
  url: URL;
  /** The checked IP to connect to (the Host header and TLS name stay `url.hostname`). */
  address: string;
  headers: Record<string, string>;
  signal: AbortSignal;
  maxBytes: number;
}

export interface FetchPreviewDeps {
  /** Every address of a host name. */
  resolve(hostname: string): Promise<string[]>;
  /** One request, no redirects followed; the body only for 2xx HTML, capped at `maxBytes`. */
  get(req: PreviewRequest): Promise<PreviewResponse>;
  timeoutMs?: number;
}

/** The URL or one of its addresses is not allowed (scheme, port, private IP…). */
export class PreviewBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviewBlockedError';
  }
}

const isHtml = (contentType: string) => /\b(text\/html|application\/xhtml\+xml)\b/i.test(contentType);

async function checkedAddress(url: URL, deps: FetchPreviewDeps): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIpLiteral(host)) return host; // already checked by checkFetchUrl
  const addresses = await deps.resolve(host);
  if (addresses.length === 0) throw new PreviewBlockedError('sin direcciones');
  if (!addresses.every(isPublicAddress)) throw new PreviewBlockedError('dirección no pública');
  return addresses[0];
}

/**
 * The preview of `raw`, or null when the page is not HTML or not 2xx. Throws on a blocked URL,
 * too many redirects, a network error or the timeout. Never call it from a request's critical
 * path: lib/links/preview.ts runs it after the response and swallows any error.
 */
export async function fetchLinkPreview(raw: string, deps: FetchPreviewDeps = nodePreviewDeps): Promise<LinkPreview | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), deps.timeoutMs ?? PREVIEW_TIMEOUT_MS);
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('Tiempo agotado')), { once: true });
  });
  aborted.catch(() => {});
  try {
    let current = raw;
    for (let hop = 0; ; hop++) {
      const url = checkFetchUrl(current);
      if (!url) throw new PreviewBlockedError('URL no permitida');
      url.hash = '';
      const address = await Promise.race([checkedAddress(url, deps), aborted]);
      const res = await Promise.race([
        deps.get({
          url,
          address,
          signal: controller.signal,
          maxBytes: PREVIEW_MAX_BYTES,
          headers: {
            'User-Agent': PREVIEW_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6',
          },
        }),
        aborted,
      ]);
      if (res.status >= 300 && res.status < 400 && res.location) {
        if (hop >= PREVIEW_MAX_REDIRECTS) throw new Error('Demasiadas redirecciones');
        current = new URL(res.location, url).href;
        continue;
      }
      if (res.status < 200 || res.status >= 300 || !isHtml(res.contentType)) return null;
      return parsePreview(res.body, url.href);
    }
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Real transport (node:http/https), used in production ----------

function decoderFor(contentType: string): TextDecoder {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset || 'utf-8');
  } catch {
    return new TextDecoder('utf-8');
  }
}

function nodeGet(req: PreviewRequest): Promise<PreviewResponse> {
  const family = req.address.includes(':') ? 6 : 4;
  // Always answer with the address already checked: no second DNS lookup.
  const lookup = ((_host: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) => {
    if (opts?.all) cb(null, [{ address: req.address, family }]);
    else cb(null, req.address, family);
  }) as unknown as LookupFunction;
  const mod = req.url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const r = mod.request(
      req.url,
      {
        method: 'GET',
        headers: { ...req.headers, 'Accept-Encoding': 'gzip, deflate, br' },
        lookup,
        signal: req.signal,
        timeout: PREVIEW_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers['content-type'] ?? '');
        const location = typeof res.headers.location === 'string' ? res.headers.location : null;
        if (status < 200 || status >= 300 || !isHtml(contentType)) {
          res.resume();
          res.destroy();
          resolve({ status, location, contentType, body: '' });
          return;
        }
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const stream =
          encoding === 'gzip' || encoding === 'x-gzip'
            ? res.pipe(zlib.createGunzip())
            : encoding === 'deflate'
              ? res.pipe(zlib.createInflate())
              : encoding === 'br'
                ? res.pipe(zlib.createBrotliDecompress())
                : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          res.destroy();
          resolve({ status, location, contentType, body: decoderFor(contentType).decode(Buffer.concat(chunks)) });
        };
        stream.on('data', (chunk: Buffer) => {
          if (done) return;
          const room = req.maxBytes - size;
          chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
          size += Math.min(chunk.length, room);
          if (size >= req.maxBytes) finish(); // enough: the head is at the start
        });
        stream.on('end', finish);
        stream.on('error', (err) => {
          if (done) return;
          done = true;
          reject(err);
        });
      },
    );
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    r.end();
  });
}

export const nodePreviewDeps: FetchPreviewDeps = {
  async resolve(hostname) {
    const all = await dnsLookup(hostname, { all: true, verbatim: true });
    return all.map((a) => a.address);
  },
  get: nodeGet,
};
