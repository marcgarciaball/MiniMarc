/**
 * Server wiring of link previews: after a save, `after()` (next/server) fetches the preview once
 * the response is sent, so it never blocks or fails the save. It stores it with the service-role
 * client scoped to the user (the session's cookies are not usable after the response).
 * The hourly job (lib/cron/server.ts) fills in whatever this missed. Server only.
 */
import { after } from 'next/server';
import { createSupabaseItemsRepo, type ItemsRepo } from '@/lib/db/items';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchLinkPreview } from './fetchPreview';
import { storeLinkPreview, withLinkPreviews, type PreviewFetcher } from './preview';

export const serverPreviewFetcher: PreviewFetcher = (url) => fetchLinkPreview(url);

/** `repo`, plus a preview fetched after the response whenever a save sets a new link. */
export function withServerPreviews(repo: ItemsRepo, userId: string): ItemsRepo {
  return withLinkPreviews(repo, (item) => {
    after(async () => {
      try {
        await storeLinkPreview(createSupabaseItemsRepo(createAdminClient(), { userId }), item, serverPreviewFetcher);
      } catch {
        // Never surfaces: the hourly job retries links whose preview was never stored.
      }
    });
  });
}
