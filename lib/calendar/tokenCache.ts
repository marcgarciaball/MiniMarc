/**
 * Google OAuth access tokens kept in memory per user until shortly before they expire, so a
 * Calendar read on a warm server instance skips the token refresh round-trip (~100–300 ms).
 * Keyed by the refresh token too: a new Google login (new refresh token) never reuses a token
 * minted for the old one. Pure (clock injected): unit-tested.
 */

/** A token this close to expiring is treated as expired (clock skew, a slow request). */
export const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export type CachedAccessToken = { accessToken: string; expiresAt: number };

export interface AccessTokenCache {
  /** A token still valid for at least the margin, or null. */
  get(userId: string, refreshToken: string): CachedAccessToken | null;
  /** Remembers a token; ignored without an access token or a future expiry. */
  set(userId: string, refreshToken: string, token: { accessToken?: string | null; expiresAt?: number | null }): void;
  /** Forgets the user's token (e.g. Google refused it). */
  drop(userId: string): void;
}

export function createAccessTokenCache(now: () => number = Date.now, marginMs = TOKEN_EXPIRY_MARGIN_MS): AccessTokenCache {
  const entries = new Map<string, CachedAccessToken & { refreshToken: string }>();
  return {
    get(userId, refreshToken) {
      const e = entries.get(userId);
      if (!e) return null;
      if (e.refreshToken !== refreshToken || e.expiresAt - marginMs <= now()) {
        entries.delete(userId);
        return null;
      }
      return { accessToken: e.accessToken, expiresAt: e.expiresAt };
    },
    set(userId, refreshToken, { accessToken, expiresAt }) {
      if (!accessToken || !expiresAt || expiresAt - marginMs <= now()) return;
      entries.set(userId, { accessToken, expiresAt, refreshToken });
    },
    drop(userId) {
      entries.delete(userId);
    },
  };
}
