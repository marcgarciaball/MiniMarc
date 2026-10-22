/**
 * The signed-in user from the session JWT, verified locally (no Next imports: unit-tested).
 *
 * `getClaims()` checks the access token's signature against the project's JWKS (fetched once
 * per server instance and cached by supabase-js) and its expiry, so it costs no network call
 * when the project uses asymmetric signing keys. With the legacy shared secret (HS256) it falls
 * back to asking the Auth server, which is what `getUser()` always does.
 *
 * Trade-off: a token stays valid until it expires (1 h by default) even if the session is revoked
 * on the server in the meantime. Fine for reads of Marc's own data (RLS still checks the same
 * token on every query); the token-management actions and the OAuth callback keep `getUser()`.
 */
import { isAllowedEmail } from '@/lib/auth/allowlist';

export type SessionUser = { id: string; email: string };

/** The part of `supabase.auth` this needs (tests pass a fake). */
export interface ClaimsAuth {
  getClaims(): Promise<{ data: { claims: Record<string, unknown> } | null; error: unknown }>;
}

/** The allowed user of a verified session, or null (no session, bad token, other account). */
export async function userFromClaims(auth: ClaimsAuth): Promise<SessionUser | null> {
  let result: Awaited<ReturnType<ClaimsAuth['getClaims']>>;
  try {
    result = await auth.getClaims();
  } catch {
    return null;
  }
  const claims = result.data?.claims;
  if (result.error || !claims) return null;
  const { sub, email } = claims;
  if (typeof sub !== 'string' || !sub || typeof email !== 'string') return null;
  if (!isAllowedEmail(email)) return null;
  return { id: sub, email };
}
