import { describe, expect, it } from 'vitest';
import { RETURN_REFRESH_MIN_AWAY_MS, shouldRefreshOnReturn } from '@/lib/cache/returnRefresh';

describe('refresh on return to the app', () => {
  it('refreshes after being away (Siri, the extension), not after a glance or without leaving', () => {
    expect(shouldRefreshOnReturn(1000, 1000 + RETURN_REFRESH_MIN_AWAY_MS)).toBe(true);
    expect(shouldRefreshOnReturn(1000, 1000 + RETURN_REFRESH_MIN_AWAY_MS - 1)).toBe(false);
    expect(shouldRefreshOnReturn(null, 99_999)).toBe(false);
  });
});
