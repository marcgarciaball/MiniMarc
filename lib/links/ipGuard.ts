/**
 * SSRF guard for the link preview fetch. Pure: no DNS here (lib/links/fetchPreview.ts resolves
 * the name and checks every address with isPublicAddress, then connects to that very address).
 * Fails closed: anything it cannot parse is not public.
 */

/** IPv4 ranges that are never fetched: [first octets as a 32-bit base, prefix length]. */
const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

function parseV4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function v4Public(n: number): boolean {
  for (const [base, bits] of BLOCKED_V4) {
    const b = parseV4(base)!;
    const size = 2 ** (32 - bits);
    if (n >= b && n < b + size) return false;
  }
  return true;
}

/** Eight 16-bit groups, or null. Accepts "::" compression and a dotted IPv4 tail. */
function parseV6(ip: string): number[] | null {
  let s = ip;
  if (s.includes('%')) return null; // scoped (link-local) addresses are never public
  const lastColon = s.lastIndexOf(':');
  if (s.slice(lastColon + 1).includes('.')) {
    // Dotted IPv4 tail ("::ffff:127.0.0.1") → two hex groups.
    const v4 = parseV4(s.slice(lastColon + 1));
    if (v4 === null) return null;
    s = `${s.slice(0, lastColon + 1)}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const group = (h: string) => (h === '' ? [] : h.split(':'));
  const head = group(halves[0]);
  const rest = halves.length === 2 ? group(halves[1]) : [];
  const parse = (g: string) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN);
  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head.map(parse), ...Array<number>(missing).fill(0), ...rest.map(parse)];
  } else {
    if (head.length !== 8) return null;
    groups = head.map(parse);
  }
  if (groups.some(Number.isNaN)) return null;
  return groups;
}

function v6Public(g: number[]): boolean {
  // IPv4-mapped (::ffff:a.b.c.d): judged as the IPv4 address it is.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4Public(g[6] * 65536 + g[7]);
  const first = g[0];
  // Only global unicast (2000::/3) can be public; this leaves out ::, ::1, ::/96, 64:ff9b::/96
  // (NAT64), 100::/64, fc00::/7 (unique local), fe80::/10 (link-local) and ff00::/8 (multicast).
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2001 && g[1] < 0x0200) return false; // 2001::/23 special purpose (Teredo, ORCHID…)
  if (first === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (first === 0x2002) return false; // 6to4 (may wrap a private IPv4)
  if (first === 0x3fff && g[1] < 0x1000) return false; // 3fff::/20 documentation
  return true;
}

/** True only for a well-formed, globally routable IPv4 or IPv6 address. */
export function isPublicAddress(ip: string): boolean {
  const s = ip.trim().replace(/^\[|\]$/g, '');
  if (!s) return false;
  if (s.includes(':')) {
    const g = parseV6(s);
    return g !== null && v6Public(g);
  }
  const n = parseV4(s);
  return n !== null && v4Public(n);
}

/** Is this host an IP literal (as the WHATWG URL parser leaves it)? */
export function isIpLiteral(host: string): boolean {
  const s = host.replace(/^\[|\]$/g, '');
  return s.includes(':') || parseV4(s) !== null;
}

/**
 * The URL to fetch, or null: http/https only, no user:password, default ports only (80/443),
 * no local names (localhost, *.local, single-label names), and an IP literal must be public.
 * DNS names are checked again after resolving, by the caller.
 */
export function checkFetchUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  const host = url.hostname.toLowerCase();
  if (!host) return null;
  if (isIpLiteral(host)) return isPublicAddress(host) ? url : null;
  const name = host.replace(/\.$/, '');
  if (!name.includes('.')) return null;
  if (/(^|\.)(localhost|local|internal|localdomain|home\.arpa|lan|intranet|corp)$/.test(name)) return null;
  return url;
}
