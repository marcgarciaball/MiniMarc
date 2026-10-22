/** Photo wiring for pages and server actions: the session client (RLS). Server only. */
import { createSupabasePhotosRepo } from '@/lib/db/photos';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { PhotoActionDeps } from './actions';
import { createSupabasePhotoStorage } from './storage';
import { buildPhotoMap, type PhotoMap } from './view';

/** Redirects to /login without an allowed session. */
export async function sessionPhotoDeps(): Promise<PhotoActionDeps> {
  const user = await requireUser();
  const client = await createClient();
  return { userId: user.id, photos: createSupabasePhotosRepo(client), storage: createSupabasePhotoStorage(client) };
}

/**
 * Signed URLs (1 h) for the photos of these items. Call after the page's session check
 * (getDeps). Photos are an extra: any failure (e.g. 0005_photos.sql not applied yet) logs and
 * returns no photos instead of breaking the list.
 */
export async function loadPhotoMap(items: { id: string }[]): Promise<PhotoMap> {
  if (items.length === 0) return {};
  try {
    const client = await createClient();
    return await buildPhotoMap(createSupabasePhotosRepo(client), createSupabasePhotoStorage(client), items.map((i) => i.id));
  } catch (err) {
    console.error('photos: could not load:', err instanceof Error ? err.message : 'unknown error');
    return {};
  }
}

/** itemId → number of photos (no signed URLs: the Personas cards only count). */
export async function countPhotos(itemIds: string[]): Promise<Record<string, number>> {
  if (itemIds.length === 0) return {};
  const client = await createClient();
  const counts: Record<string, number> = {};
  for (const p of await createSupabasePhotosRepo(client).listPhotosFor(itemIds)) counts[p.itemId] = (counts[p.itemId] ?? 0) + 1;
  return counts;
}
