/**
 * When the app comes back to the foreground (Marc used Siri, the extension or another device
 * meanwhile), the screens refresh their data: private caches live in the client router, so a
 * server-side revalidateTag alone cannot reach them. Pure: unit-tested.
 */

/** Away for less than this (a glance at a notification) → no refresh. */
export const RETURN_REFRESH_MIN_AWAY_MS = 3000;

export function shouldRefreshOnReturn(leftAt: number | null, now: number, minAwayMs = RETURN_REFRESH_MIN_AWAY_MS): boolean {
  return leftAt !== null && now - leftAt >= minAwayMs;
}
