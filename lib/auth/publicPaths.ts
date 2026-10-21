/**
 * Routes reachable without a session. These either are the login flow itself
 * or validate their own token. Entries ending in `/` match as a prefix;
 * the rest match exactly (or as a path segment parent, e.g. `/login/...`).
 */
export const PUBLIC_PATHS = [
  '/login',
  '/auth/',
  '/api/capture',
  '/api/cron/',
  '/api/push/',
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) =>
    p.endsWith('/')
      ? pathname.startsWith(p)
      : pathname === p || pathname.startsWith(`${p}/`),
  );
}
