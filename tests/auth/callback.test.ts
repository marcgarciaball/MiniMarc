import { describe, expect, it, vi } from 'vitest';
import { finishSignIn, type CallbackDeps } from '@/lib/auth/callback';

const ALLOWED = 'marc@example.com';

function deps(over: Partial<CallbackDeps> = {}): CallbackDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    allowedEmail: ALLOWED,
    exchange: vi.fn(async () => {
      calls.push('exchange');
      return { userId: 'u1', email: ALLOWED, refreshToken: 'rt' };
    }),
    signOut: vi.fn(async () => {
      calls.push('signOut');
    }),
    saveCredentials: vi.fn(async () => {
      calls.push('save');
    }),
    ...over,
  };
}

describe('finishSignIn (/auth/callback)', () => {
  it('sin código → /login?error=auth', async () => {
    const d = deps();
    expect(await finishSignIn(d, null)).toBe('/login?error=auth');
    expect(d.exchange).not.toHaveBeenCalled();
  });

  it('fallo al canjear el código → /login?error=auth', async () => {
    const d = deps({ exchange: async () => null });
    expect(await finishSignIn(d, 'c')).toBe('/login?error=auth');
  });

  it('correo no permitido → cierra sesión y no guarda credenciales', async () => {
    const d = deps({ exchange: async () => ({ userId: 'u2', email: 'otro@example.com', refreshToken: 'rt' }) });
    expect(await finishSignIn(d, 'c')).toBe('/login?error=no_autorizado');
    expect(d.signOut).toHaveBeenCalled();
    expect(d.saveCredentials).not.toHaveBeenCalled();
  });

  it('caso normal → guarda el refresh token del usuario y entra', async () => {
    const d = deps();
    expect(await finishSignIn(d, 'c')).toBe('/');
    expect(d.saveCredentials).toHaveBeenCalledWith('u1', 'rt');
    expect(d.signOut).not.toHaveBeenCalled();
  });

  it('si guardar las credenciales falla → cierra sesión ANTES de mandar a /login', async () => {
    const d = deps({
      saveCredentials: async () => {
        throw new Error('db');
      },
    });
    expect(await finishSignIn(d, 'c')).toBe('/login?error=credenciales');
    expect(d.signOut).toHaveBeenCalledTimes(1);
  });

  it('sin refresh token de Google → entra igualmente, sin tocar las credenciales guardadas', async () => {
    const d = deps({ exchange: async () => ({ userId: 'u1', email: ALLOWED, refreshToken: null }) });
    expect(await finishSignIn(d, 'c')).toBe('/');
    expect(d.saveCredentials).not.toHaveBeenCalled();
  });
});
