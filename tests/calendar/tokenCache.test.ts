import { describe, expect, it } from 'vitest';
import { createAccessTokenCache, TOKEN_EXPIRY_MARGIN_MS } from '@/lib/calendar/tokenCache';

describe('access token cache', () => {
  const start = 1_000_000;

  it('reuses a token until shortly before it expires', () => {
    let now = start;
    const cache = createAccessTokenCache(() => now);
    cache.set('u1', 'r1', { accessToken: 'a1', expiresAt: start + 3600_000 });
    expect(cache.get('u1', 'r1')).toEqual({ accessToken: 'a1', expiresAt: start + 3600_000 });

    now = start + 3600_000 - TOKEN_EXPIRY_MARGIN_MS - 1;
    expect(cache.get('u1', 'r1')?.accessToken).toBe('a1');

    now = start + 3600_000 - TOKEN_EXPIRY_MARGIN_MS;
    expect(cache.get('u1', 'r1')).toBeNull();
    // Gone for good once expired.
    now = start;
    expect(cache.get('u1', 'r1')).toBeNull();
  });

  it('never hands a token minted for another refresh token or another user', () => {
    const cache = createAccessTokenCache(() => start);
    cache.set('u1', 'r1', { accessToken: 'a1', expiresAt: start + 3600_000 });
    expect(cache.get('u2', 'r1')).toBeNull();
    expect(cache.get('u1', 'r2')).toBeNull();
    // A new login (new refresh token) drops the old token.
    expect(cache.get('u1', 'r1')).toBeNull();
  });

  it('ignores tokens without a value or already (nearly) expired', () => {
    const cache = createAccessTokenCache(() => start);
    cache.set('u1', 'r1', { accessToken: null, expiresAt: start + 3600_000 });
    expect(cache.get('u1', 'r1')).toBeNull();
    cache.set('u1', 'r1', { accessToken: 'a1', expiresAt: null });
    expect(cache.get('u1', 'r1')).toBeNull();
    cache.set('u1', 'r1', { accessToken: 'a1', expiresAt: start + TOKEN_EXPIRY_MARGIN_MS });
    expect(cache.get('u1', 'r1')).toBeNull();
  });

  it('drop forgets the user token', () => {
    const cache = createAccessTokenCache(() => start);
    cache.set('u1', 'r1', { accessToken: 'a1', expiresAt: start + 3600_000 });
    cache.drop('u1');
    expect(cache.get('u1', 'r1')).toBeNull();
  });
});
