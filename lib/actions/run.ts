/**
 * The one way write actions run (no Next imports: unit-tested with injected deps):
 * authenticate, do the work, then invalidate the user's cached data for the scopes the write
 * may change. Invalidation also follows a failure once the session is known: a write that
 * failed half-way must not leave stale data either. Never throws at the UI (see `attempt`).
 */
import type { DataScope } from '@/lib/cache/tags';
import { attempt, type ActionResult } from './result';

export interface ActionRunnerDeps<D> {
  /** The signed-in user and the deps bound to their session (redirects without one). */
  session: () => Promise<{ userId: string; deps: D }>;
  /** Expires the user's cache tags (updateTag on the server). */
  invalidate: (userId: string, scopes: readonly DataScope[]) => void;
  /** Next's unstable_rethrow, so redirect() still works. */
  rethrow?: (e: unknown) => void;
}

export type ActionRunner<D> = <T>(
  scopes: readonly DataScope[],
  fn: (deps: D) => Promise<T>,
  fallback: string,
) => Promise<ActionResult<T>>;

export function createActionRunner<D>(r: ActionRunnerDeps<D>): ActionRunner<D> {
  return async (scopes, fn, fallback) => {
    let userId: string | null = null;
    const result = await attempt(
      async () => {
        const s = await r.session();
        userId = s.userId;
        return fn(s.deps);
      },
      fallback,
      r.rethrow,
    );
    if (userId) r.invalidate(userId, scopes);
    return result;
  };
}
