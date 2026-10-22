/**
 * Routes reachable without a session. These either are the login flow itself
 * or validate their own token (or are public pages, like /privacidad). Entries ending in `/` match as a prefix;
 * the rest match exactly (or as a path segment parent, e.g. `/login/...`).
 */
export const PUBLIC_PATHS = [
  '/login',
  // Privacy policy: Google needs it public to publish the OAuth app.
  '/privacidad',
  '/auth/',
  '/api/capture',
  // Token-protected digest for the Chrome extension.
  '/api/hoy',
  '/api/cron/',
  '/api/push/',
  // PWA files: the browser fetches them without cookies (also excluded in the proxy matcher).
  '/manifest.webmanifest',
  '/sw.js',
  '/icons/',
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) =>
    p.endsWith('/')
      ? pathname.startsWith(p)
      : pathname === p || pathname.startsWith(`${p}/`),
  );
}
