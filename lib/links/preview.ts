/**
 * Link previews around the items repo. Pure: the fetch and the scheduler come in as deps.
 *   - withLinkPreviews(repo, schedule): every save that leaves an item with a new link calls
 *     `schedule(item)` (on the server: next/server `after`, so it never blocks the save).
 *   - storeLinkPreview: fetches and stores title, image and site. Never throws; a failed fetch
 *     still stores the domain as the site, so it is not retried every hour.
 *   - refreshMissingPreviews: the hourly job's fallback for links never fetched.
 */
import type { ItemsRepo } from '@/lib/db/items';
import type { Item } from '@/lib/db/types';
import { linkHref } from '@/lib/libros';
import type { LinkPreview } from './ogParser';

export type PreviewFetcher = (url: string) => Promise<LinkPreview | null>;
export type PreviewScheduler = (item: Item) => void;

/** Links fetched per hourly run, at most. */
export const PREVIEW_CAP = 10;

/** "amazon.es" for a link (no www); null if it is not an http(s) link. */
export function linkDomain(link: string | null): string | null {
  const href = linkHref(link);
  if (!href) return null;
  try {
    return new URL(href).hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
}

/** Fetches the preview of `item.link` and stores it. True when something was stored. */
export async function storeLinkPreview(
  items: Pick<ItemsRepo, 'updateItem'>,
  item: Pick<Item, 'id' | 'link'>,
  fetcher: PreviewFetcher,
): Promise<boolean> {
  const href = linkHref(item.link);
  const domain = linkDomain(item.link);
  if (!href || !domain) return false;
  let preview: LinkPreview | null = null;
  try {
    preview = await fetcher(href);
  } catch {
    // Blocked, unreachable, too slow…: the card shows the domain.
  }
  try {
    await items.updateItem(item.id, {
      linkTitle: preview?.title ?? null,
      linkImage: preview?.image ?? null,
      linkSite: preview?.site ?? domain,
    });
    return true;
  } catch {
    return false; // e.g. 0009 not applied yet
  }
}

/** The repo, plus a preview scheduled whenever a save sets a (new) link. */
export function withLinkPreviews(repo: ItemsRepo, schedule: PreviewScheduler): ItemsRepo {
  const safe = (item: Item) => {
    try {
      schedule(item);
    } catch {
      // A preview is an extra: it never fails a save.
    }
  };
  return {
    ...repo,
    async createItem(input) {
      const item = await repo.createItem(input);
      if (item.link) safe(item);
      return item;
    },
    async updateItem(id, patch) {
      const item = await repo.updateItem(id, patch);
      if (patch.link && item.link) safe(item);
      return item;
    },
  };
}

/**
 * Fetches up to PREVIEW_CAP missing previews, newest links first, in parallel (each fetch gives
 * up after 5 s, so the run stays short). Returns how many were stored.
 */
export async function refreshMissingPreviews(items: ItemsRepo, fetcher: PreviewFetcher, cap = PREVIEW_CAP): Promise<number> {
  const pending = (await items.listMissingPreviews()).slice(0, cap);
  const stored = await Promise.all(pending.map((item) => storeLinkPreview(items, item, fetcher)));
  return stored.filter(Boolean).length;
}
