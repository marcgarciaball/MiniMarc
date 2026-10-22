/**
 * API tokens for Siri and the browser extension (`Authorization: Bearer ap_…`).
 * Only the SHA-256 of a token is stored; the plain token is shown once, at creation.
 * Server only: `public.api_tokens` is reached with the service-role client, always scoped
 * to the user. Never log a token or the Authorization header.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export const TOKEN_PREFIX = 'ap_';
const TOKEN_BYTES = 32;
const TOKEN_RE = /^ap_[A-Za-z0-9_-]{43}$/;

export type TokenRow = { id: string; user_id: string; name: string; token_hash: string; revoked_at: string | null };

/** What Ajustes shows: never the token nor its hash. */
export type ApiTokenInfo = { id: string; name: string; createdAt: string; revokedAt: string | null };

export interface TokenStore {
  insert(row: { user_id: string; name: string; token_hash: string }): Promise<{ id: string }>;
  /** The user's tokens, newest first. */
  list(userId: string): Promise<ApiTokenInfo[]>;
  findByHash(hash: string): Promise<TokenRow | null>;
  /** Marks the token revoked, only if it belongs to `userId`. */
  revoke(id: string, userId: string, at: string): Promise<void>;
}

export interface TokenDeps {
  store: TokenStore;
  /** The signed-in user (create/revoke only). */
  userId: () => Promise<string>;
}

/** The token's owner, its id and its name ("Siri trabajo" forces the Trabajo area, see handleCapture). */
export type VerifiedToken = { userId: string; tokenId: string; name: string };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function supabaseTokenStore(db = createAdminClient()): TokenStore {
  return {
    async insert(row) {
      const { data, error } = await db.from('api_tokens').insert(row).select('id').single();
      if (error) throw new Error(`insert api_tokens: ${error.message}`);
      return { id: String(data.id) };
    },
    async list(userId) {
      const { data, error } = await db
        .from('api_tokens')
        .select('id, name, created_at, revoked_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`select api_tokens: ${error.message}`);
      return (data ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        createdAt: String(r.created_at),
        revokedAt: r.revoked_at == null ? null : String(r.revoked_at),
      }));
    },
    async findByHash(hash) {
      const { data, error } = await db
        .from('api_tokens')
        .select('id, user_id, name, token_hash, revoked_at')
        .eq('token_hash', hash)
        .maybeSingle();
      if (error) throw new Error(`select api_tokens: ${error.message}`);
      return (data as TokenRow | null) ?? null;
    },
    async revoke(id, userId, at) {
      const { error } = await db.from('api_tokens').update({ revoked_at: at }).eq('id', id).eq('user_id', userId);
      if (error) throw new Error(`update api_tokens: ${error.message}`);
    },
  };
}

/** Real deps, built lazily so nothing reads env vars or cookies until a call needs them. */
async function defaultDeps(): Promise<TokenDeps> {
  return {
    store: supabaseTokenStore(),
    async userId() {
      // Token management asks the Auth server (a revoked session cannot mint or list tokens).
      const { requireFreshUser } = await import('@/lib/supabase/server');
      return (await requireFreshUser()).id;
    },
  };
}

/** Creates a token for the signed-in user. The plain `token` is returned only here. */
export async function createApiToken(name: string, deps?: TokenDeps): Promise<{ id: string; token: string }> {
  const clean = name.trim();
  if (!clean) throw new Error('El nombre no puede estar vacío');
  const d = deps ?? (await defaultDeps());
  const userId = await d.userId();
  const token = TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('base64url');
  const { id } = await d.store.insert({ user_id: userId, name: clean, token_hash: sha256(token) });
  return { id, token };
}

/**
 * Checks `Authorization: Bearer <token>`. Returns the owner, or null when the header is missing
 * or malformed, or the token is unknown or revoked. Throws only if the database fails.
 */
export async function verifyApiToken(authHeader: string | null, deps?: TokenDeps): Promise<VerifiedToken | null> {
  const m = /^Bearer ([^\s]+)$/i.exec(authHeader ?? '');
  if (!m || !TOKEN_RE.test(m[1])) return null;
  const hash = sha256(m[1]);
  const d = deps ?? (await defaultDeps());
  const row = await d.store.findByHash(hash);
  if (!row || row.revoked_at) return null;
  const a = Buffer.from(row.token_hash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { userId: row.user_id, tokenId: row.id, name: row.name };
}

/** The signed-in user's tokens (name, creation date, revoked or not), newest first. */
export async function listApiTokens(deps?: TokenDeps): Promise<ApiTokenInfo[]> {
  const d = deps ?? (await defaultDeps());
  return d.store.list(await d.userId());
}

/** Revokes one of the signed-in user's tokens (a no-op for someone else's). */
export async function revokeApiToken(id: string, deps?: TokenDeps): Promise<void> {
  const d = deps ?? (await defaultDeps());
  await d.store.revoke(id, await d.userId(), new Date().toISOString());
}
