import { describe, expect, it, vi } from 'vitest';
import { finishSignIn, safeError, type CallbackDeps } from '@/lib/auth/callback';

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
    hasStoredRefreshToken: vi.fn(async () => {
      calls.push('hasStored');
      return true;
    }),
    ...over,
  };
}

describe('safeError', () => {
  it('copia solo code, message, details, hint y status', () => {
    expect(safeError({ code: 'x', message: 'm', status: 400, access_token: 'secreto', email: ALLOWED })).toEqual({
      code: 'x',
      message: 'm',
      status: 400,
    });
  });

  it('acepta valores que no son objetos', () => {
    expect(safeError('boom')).toEqual({ message: 'boom' });
  });
});

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

  it('si guardar las credenciales falla → registra una línea con solo los campos seguros del error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // Shape of a PostgrestError, plus request data supabase-js may attach.
      const err = Object.assign(new Error('permission denied for table google_credentials'), {
        code: '42501',
        details: null,
        hint: 'revisa los grants',
        status: 403,
        refresh_token: 'rt-secreto',
        headers: { apikey: 'service-role-key' },
      });
      const d = deps({
        exchange: async () => ({ userId: 'u1', email: ALLOWED, refreshToken: 'rt-secreto' }),
        saveCredentials: async () => {
          throw err;
        },
      });
      expect(await finishSignIn(d, 'c')).toBe('/login?error=credenciales');
      expect(spy).toHaveBeenCalledTimes(1);
      const [prefix, payload] = spy.mock.calls[0];
      expect(prefix).toBe('[auth/callback] saveCredentials failed');
      expect(payload).toEqual({
        code: '42501',
        message: 'permission denied for table google_credentials',
        details: null,
        hint: 'revisa los grants',
        status: 403,
      });
      const logged = JSON.stringify(spy.mock.calls);
      expect(logged).not.toContain('rt-secreto');
      expect(logged).not.toContain('service-role-key');
      expect(logged).not.toContain(ALLOWED);
    } finally {
      spy.mockRestore();
    }
  });

  it('caso normal → no consulta si había un token guardado', async () => {
    const d = deps();
    await finishSignIn(d, 'c');
    expect(d.hasStoredRefreshToken).not.toHaveBeenCalled();
  });

  it('sin refresh token de Google pero con uno guardado → entra y conserva el guardado', async () => {
    const d = deps({ exchange: async () => ({ userId: 'u1', email: ALLOWED, refreshToken: null }) });
    expect(await finishSignIn(d, 'c')).toBe('/');
    expect(d.hasStoredRefreshToken).toHaveBeenCalledWith('u1');
    expect(d.saveCredentials).not.toHaveBeenCalled();
    expect(d.signOut).not.toHaveBeenCalled();
  });

  it('sin refresh token de Google ni guardado → /login?reconsent=1 para pedir el consentimiento', async () => {
    const d = deps({
      exchange: async () => ({ userId: 'u1', email: ALLOWED, refreshToken: null }),
      hasStoredRefreshToken: vi.fn(async () => false),
    });
    expect(await finishSignIn(d, 'c')).toBe('/login?reconsent=1');
    expect(d.saveCredentials).not.toHaveBeenCalled();
  });

  it('correo no permitido sin refresh token → no_autorizado, nunca reconsent', async () => {
    const d = deps({
      exchange: async () => ({ userId: 'u2', email: 'otro@example.com', refreshToken: null }),
      hasStoredRefreshToken: vi.fn(async () => false),
    });
    expect(await finishSignIn(d, 'c')).toBe('/login?error=no_autorizado');
    expect(d.hasStoredRefreshToken).not.toHaveBeenCalled();
  });

  it('si falla la consulta del token guardado → entra (Calendar pedirá volver a entrar si hace falta) y lo registra', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const d = deps({
        exchange: async () => ({ userId: 'u1', email: ALLOWED, refreshToken: null }),
        hasStoredRefreshToken: async () => {
          throw Object.assign(new Error('timeout'), { code: '57014', refresh_token: 'rt-secreto' });
        },
      });
      expect(await finishSignIn(d, 'c')).toBe('/');
      expect(spy).toHaveBeenCalledWith('[auth/callback] loadCredentials failed', { code: '57014', message: 'timeout' });
    } finally {
      spy.mockRestore();
    }
  });
});
