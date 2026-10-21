import { describe, it, expect } from 'vitest';
import { isPublicPath } from '@/lib/auth/publicPaths';

describe('isPublicPath', () => {
  it.each([
    '/login',
    '/auth/callback',
    '/api/capture',
    '/api/cron/digest',
    '/api/push/subscribe',
  ])('%s is public', (p) => {
    expect(isPublicPath(p)).toBe(true);
  });

  it.each([
    '/',
    '/ajustes',
    '/loginx',
    '/api/capturex',
    '/api/cron',
    '/api/items',
    '/auth',
  ])('%s is protected', (p) => {
    expect(isPublicPath(p)).toBe(false);
  });
});
