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
export function logCallbackError(step: 'exchange' | 'saveCredentials', err: unknown): void {
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
  // Without one (Google only sends it with prompt=consent) the existing row, if any, stays;
  // Tarea 7/8 show "Reconectar Google" when there is no credentials row at all.
  if (session.refreshToken) {
    try {
      await deps.saveCredentials(session.userId, session.refreshToken);
    } catch (err) {
      logCallbackError('saveCredentials', err);
      // Don't leave a half-working session behind the error page.
      await deps.signOut();
      return '/login?error=credenciales';
    }
  }
  return '/';
}
