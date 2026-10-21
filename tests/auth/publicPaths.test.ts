import { describe, it, expect } from 'vitest';
import { isPublicPath } from '@/lib/auth/publicPaths';

describe('isPublicPath', () => {
  it.each([
    '/login',
    '/auth/callback',
    '/api/capture',
    '/api/cron/digest',
    '/api/push/subscribe',
    '/manifest.webmanifest',
    '/sw.js',
    '/icons/icon-192.png',
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
    '/icons',
    '/tareas',
  ])('%s is protected', (p) => {
    expect(isPublicPath(p)).toBe(false);
  });
});
