/**
 * Decision logic of /auth/callback, kept pure so every branch is tested.
 * Returns the path to redirect to.
 */
import { isAllowedEmail } from './allowlist';

export interface CallbackDeps {
  allowedEmail: string | undefined;
  /** Exchanges the OAuth code for a session; null on failure. */
  exchange: (code: string) => Promise<{ userId: string; email: string | undefined; refreshToken: string | null } | null>;
  signOut: () => Promise<void>;
  /** Stores Google's refresh token (service role only; see 0002_single_user.sql). Throws on failure. */
  saveCredentials: (userId: string, refreshToken: string) => Promise<void>;
  /** True if a Google refresh token is already stored for `userId` (service role). Throws on failure. */
  hasStoredRefreshToken: (userId: string) => Promise<boolean>;
}

const SAFE_FIELDS = ['code', 'message', 'details', 'hint', 'status'] as const;

/**
 * Loggable view of a Supabase/PostgREST error. Copies only these fields: the supabase-js
 * error object can carry request data (tokens, keys, emails), so it is never logged whole.
 */
export function safeError(err: unknown): Partial<Record<(typeof SAFE_FIELDS)[number], unknown>> {
  if (typeof err !== 'object' || err === null) return { message: String(err) };
  const out: Partial<Record<(typeof SAFE_FIELDS)[number], unknown>> = {};
  for (const key of SAFE_FIELDS) {
    if (key in err) out[key] = (err as Record<string, unknown>)[key];
  }
  return out;
}

/** One line in the server logs (Vercel) per callback failure, without secrets. */
export function logCallbackError(step: 'exchange' | 'saveCredentials' | 'loadCredentials', err: unknown): void {
  console.error(`[auth/callback] ${step} failed`, safeError(err));
}

export async function finishSignIn(deps: CallbackDeps, code: string | null): Promise<string> {
  if (!code) return '/login?error=auth';
  const session = await deps.exchange(code);
  if (!session) return '/login?error=auth';

  if (!isAllowedEmail(session.email, deps.allowedEmail)) {
    await deps.signOut();
    return '/login?error=no_autorizado';
  }

  // Supabase does not persist Google's refresh token; keep it for Calendar.
  // Login asks Google with prompt=select_account, so a refresh token only comes on the first
  // consent (or with ?reconsent=1). Without one, the stored token stays; if none is stored,
  // /login?reconsent=1 asks again with prompt=consent.
  if (session.refreshToken) {
    try {
      await deps.saveCredentials(session.userId, session.refreshToken);
    } catch (err) {
      logCallbackError('saveCredentials', err);
      // Don't leave a half-working session behind the error page.
      await deps.signOut();
      return '/login?error=credenciales';
    }
    return '/';
  }

  try {
    if (!(await deps.hasStoredRefreshToken(session.userId))) return '/login?reconsent=1';
  } catch (err) {
    // Can't tell: let Marc in; Calendar screens offer "Volver a entrar con Google" if needed.
    logCallbackError('loadCredentials', err);
  }
  return '/';
}
