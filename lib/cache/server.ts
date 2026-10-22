/** Server wiring of lib/cache/tags.ts: Next's updateTag (Server Actions only). */
import { cacheTag, updateTag } from 'next/cache';
import { invalidateUser, tagsFor, type DataScope } from './tags';

/** Read-your-own-writes: the next render waits for fresh data for these scopes. */
export function invalidate(userId: string, scopes: readonly DataScope[]): void {
  invalidateUser(userId, scopes, updateTag);
}

/** Inside a `'use cache: private'` scope: tags it with the user's scopes. */
export function tagUserData(userId: string, scopes: readonly DataScope[]): void {
  cacheTag(...tagsFor(userId, scopes));
}
