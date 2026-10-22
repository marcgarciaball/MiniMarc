/**
 * Server wiring of link previews: after a save, `after()` (next/server) fetches the preview once
 * the response is sent, so it never blocks or fails the save. It stores it with the service-role
 * client scoped to the user (the session's cookies are not usable after the response), then
 * expires the user's cached lists so the preview shows on the next visit.
 * The hourly job (lib/cron/server.ts) fills in whatever this missed. Server only.
 */
import { after } from 'next/server';
import { revalidateUser } from '@/lib/cache/server';
import { WRITES, type DataScope } from '@/lib/cache/tags';
import { createSupabaseItemsRepo, type ItemsRepo } from '@/lib/db/items';
import type { Item } from '@/lib/db/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchLinkPreview } from './fetchPreview';
import { storeLinkPreview, withLinkPreviews, type PreviewFetcher } from './preview';

export const serverPreviewFetcher: PreviewFetcher = (url) => fetchLinkPreview(url);

export interface ServerPreviewDeps {
  /** Runs work after the response (next/server `after`). */
  after: (task: () => Promise<void>) => void;
  /** Fetches and stores the item's preview. */
  store: (item: Item) => Promise<unknown>;
  invalidate: (userId: string, scopes: readonly DataScope[]) => void;
}

const realDeps = (userId: string): ServerPreviewDeps => ({
  after,
  store: (item) => storeLinkPreview(createSupabaseItemsRepo(createAdminClient(), { userId }), item, serverPreviewFetcher),
  invalidate: revalidateUser,
});

/** `repo`, plus a preview fetched after the response whenever a save sets a new link. */
export function withServerPreviews(repo: ItemsRepo, userId: string, deps: ServerPreviewDeps = realDeps(userId)): ItemsRepo {
  return withLinkPreviews(repo, (item) => {
    deps.after(async () => {
      try {
        await deps.store(item);
        deps.invalidate(userId, WRITES.preview);
      } catch {
        // Never surfaces: the hourly job retries links whose preview was never stored.
      }
    });
  });
}
