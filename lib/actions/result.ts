/**
 * What a write action hands back to the UI. Actions never throw at the UI: a failure carries
 * a Spanish message the sheet shows inline while keeping what was typed.
 * No server imports: also used client-side (`settle`).
 */
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** An error whose message is written for Marc (Spanish, no technical detail). */
export class UserError extends Error {
  override name = 'UserError';
}

export const ok = <T>(value: T): ActionResult<T> => ({ ok: true, value });
export const fail = <T = never>(error: string): ActionResult<T> => ({ ok: false, error });

/**
 * Runs an action and turns any throw into `{ ok: false }`: a UserError keeps its message,
 * anything else (repo, network, zod) becomes `fallback`. `rethrow` lets the server pass
 * Next's `unstable_rethrow`, so redirect() and friends still work.
 */
export async function attempt<T>(
  fn: () => Promise<T>,
  fallback: string,
  rethrow?: (e: unknown) => void,
): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    rethrow?.(e);
    return fail(e instanceof UserError ? e.message : fallback);
  }
}

/** Client side: a server action call can still reject (offline, server down). Never let it throw. */
export async function settle<T>(call: () => Promise<ActionResult<T>>, fallback: string): Promise<ActionResult<T>> {
  try {
    return await call();
  } catch {
    return fail(fallback);
  }
}
