/** Server wiring of lib/cache/tags.ts: updateTag in Server Actions, revalidateTag elsewhere. */
import { cacheTag, revalidateTag, updateTag } from 'next/cache';
import { invalidateUser, tagsFor, type DataScope } from './tags';

/** Read-your-own-writes: the next render waits for fresh data for these scopes. */
export function invalidate(userId: string, scopes: readonly DataScope[]): void {
  invalidateUser(userId, scopes, updateTag);
}

/**
 * For Route Handlers and after() (updateTag only works in Server Actions): expires the tags
 * with `{ expire: 0 }`, so the next read waits for fresh data instead of serving stale.
 */
export function revalidateUser(userId: string, scopes: readonly DataScope[]): void {
  invalidateUser(userId, scopes, (tag) => revalidateTag(tag, { expire: 0 }));
}

/** Inside a `'use cache: private'` scope: tags it with the user's scopes. */
export function tagUserData(userId: string, scopes: readonly DataScope[]): void {
  cacheTag(...tagsFor(userId, scopes));
}
