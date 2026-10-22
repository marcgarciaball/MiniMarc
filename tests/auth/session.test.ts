import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userFromClaims, type ClaimsAuth } from '@/lib/auth/session';

const auth = (result: Awaited<ReturnType<ClaimsAuth['getClaims']>> | Error): ClaimsAuth & { calls: number } => {
  const fake = {
    calls: 0,
    async getClaims() {
      fake.calls += 1;
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return fake;
};

describe('userFromClaims (requireUser)', () => {
  beforeEach(() => vi.stubEnv('ALLOWED_EMAIL', 'marc@example.com'));
  afterEach(() => vi.unstubAllEnvs());

  it('returns the allowed user from verified claims, with one getClaims call', async () => {
    const a = auth({ data: { claims: { sub: 'u-1', email: 'Marc@Example.com ' } }, error: null });
    expect(await userFromClaims(a)).toEqual({ id: 'u-1', email: 'Marc@Example.com ' });
    expect(a.calls).toBe(1);
  });

  it('refuses another account', async () => {
    expect(await userFromClaims(auth({ data: { claims: { sub: 'u-2', email: 'otro@example.com' } }, error: null }))).toBeNull();
  });

  it('refuses no session, a bad token or claims without sub/email', async () => {
    expect(await userFromClaims(auth({ data: null, error: null }))).toBeNull();
    expect(await userFromClaims(auth({ data: null, error: new Error('invalid JWT') }))).toBeNull();
    expect(await userFromClaims(auth({ data: { claims: { email: 'marc@example.com' } }, error: null }))).toBeNull();
    expect(await userFromClaims(auth({ data: { claims: { sub: 'u-1' } }, error: null }))).toBeNull();
    expect(await userFromClaims(auth(new Error('network')))).toBeNull();
  });
});
