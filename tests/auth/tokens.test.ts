import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
  verifyApiToken,
  TOKEN_PREFIX,
  type TokenDeps,
  type TokenRow,
  type TokenStore,
} from '@/lib/auth/tokens';

function memoryStore() {
  const rows: (TokenRow & { created_at: string })[] = [];
  let n = 0;
  const store: TokenStore = {
    async insert(row) {
      const id = `t${++n}`;
      rows.push({ id, ...row, revoked_at: null, created_at: new Date(Date.UTC(2026, 9, 21, 10, n)).toISOString() });
      return { id };
    },
    async list(userId) {
      return rows
        .filter((r) => r.user_id === userId)
        .map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, revokedAt: r.revoked_at }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async findByHash(hash) {
      return rows.find((r) => r.token_hash === hash) ?? null;
    },
    async revoke(id, userId, at) {
      const r = rows.find((x) => x.id === id && x.user_id === userId);
      if (r) r.revoked_at = at;
    },
  };
  return { rows, store };
}

function setup(userId = 'user-marc') {
  const { rows, store } = memoryStore();
  const deps: TokenDeps = { store, userId: async () => userId };
  return { rows, deps };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('createApiToken', () => {
  it('devuelve el token en claro una vez y guarda solo su hash SHA-256', async () => {
    const { rows, deps } = setup();
    const { id, token } = await createApiToken('iPhone', deps);
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    // 32 bytes in base64url = 43 characters.
    expect(token.slice(TOKEN_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, user_id: 'user-marc', name: 'iPhone', token_hash: sha256(token) });
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('cada token es distinto', async () => {
    const { deps } = setup();
    const a = await createApiToken('a', deps);
    const b = await createApiToken('b', deps);
    expect(a.token).not.toBe(b.token);
  });

  it('rechaza un nombre vacío', async () => {
    const { rows, deps } = setup();
    await expect(createApiToken('  ', deps)).rejects.toThrow();
    expect(rows).toHaveLength(0);
  });
});

describe('verifyApiToken', () => {
  it('un token válido devuelve su usuario y su id', async () => {
    const { deps } = setup();
    const { id, token } = await createApiToken('iPhone', deps);
    await expect(verifyApiToken(`Bearer ${token}`, deps)).resolves.toEqual({ userId: 'user-marc', tokenId: id });
  });

  it('un token revocado falla', async () => {
    const { deps } = setup();
    const { id, token } = await createApiToken('iPhone', deps);
    await revokeApiToken(id, deps);
    await expect(verifyApiToken(`Bearer ${token}`, deps)).resolves.toBeNull();
  });

  it('solo se revocan los tokens del usuario actual', async () => {
    const { rows, deps } = setup();
    const { id, token } = await createApiToken('iPhone', deps);
    await revokeApiToken(id, { ...deps, userId: async () => 'otro' });
    expect(rows[0].revoked_at).toBeNull();
    await expect(verifyApiToken(`Bearer ${token}`, deps)).resolves.not.toBeNull();
  });

  it('cabecera ausente o mal formada falla', async () => {
    const { deps } = setup();
    const { token } = await createApiToken('iPhone', deps);
    for (const h of [null, '', 'Bearer', 'Bearer ', token, `Basic ${token}`, `Bearer ${token} x`, `Bearer  ${token}x`]) {
      await expect(verifyApiToken(h, deps)).resolves.toBeNull();
    }
  });

  it('un token desconocido falla', async () => {
    const { deps } = setup();
    await createApiToken('iPhone', deps);
    await expect(verifyApiToken(`Bearer ${TOKEN_PREFIX}${'A'.repeat(43)}`, deps)).resolves.toBeNull();
  });

  it('acepta "bearer" sin distinguir mayúsculas', async () => {
    const { deps } = setup();
    const { token } = await createApiToken('iPhone', deps);
    await expect(verifyApiToken(`bearer ${token}`, deps)).resolves.not.toBeNull();
  });

  it('si la base de datos falla, lanza (el endpoint no debe confundirlo con 401)', async () => {
    const { deps } = setup();
    const broken: TokenDeps = {
      ...deps,
      store: { ...deps.store, findByHash: async () => Promise.reject(new Error('db down')) },
    };
    await expect(verifyApiToken(`Bearer ${TOKEN_PREFIX}${'A'.repeat(43)}`, broken)).rejects.toThrow('db down');
  });
});

describe('listApiTokens', () => {
  it('lista los tokens del usuario (nombre, fecha, revocado) sin hash ni token, el más nuevo primero', async () => {
    const { deps } = setup();
    const siri = await createApiToken('Siri', deps);
    const ext = await createApiToken('Extensión', deps);
    await createApiToken('Ajeno', { ...deps, userId: async () => 'otro' });
    await revokeApiToken(siri.id, deps);

    const list = await listApiTokens(deps);
    expect(list.map((t) => [t.name, t.revokedAt === null])).toEqual([
      ['Extensión', true],
      ['Siri', false],
    ]);
    expect(list[0]).toEqual({ id: ext.id, name: 'Extensión', createdAt: expect.any(String), revokedAt: null });
    expect(JSON.stringify(list)).not.toContain(ext.token);
    expect(JSON.stringify(list)).not.toContain(sha256(ext.token));
  });
});
