/** Photo wiring for pages, server actions and /compartir: the session client (RLS). Server only. */
import { createSupabasePhotosRepo } from '@/lib/db/photos';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { PhotoActionDeps } from './actions';
import { extensionFor } from './resize';
import { createSupabasePhotoStorage, photoPath } from './storage';
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

/** Uploads a file (already a reasonable size) to the user's folder and records it on the item. */
export async function savePhotoFile(userId: string, itemId: string, file: File): Promise<void> {
  const client = await createClient();
  const storage = createSupabasePhotoStorage(client);
  const path = photoPath(userId, itemId, extensionFor(file.type));
  await storage.upload(path, file, file.type);
  try {
    await createSupabasePhotosRepo(client).addPhoto({ itemId, path, width: null, height: null });
  } catch (err) {
    await storage.remove([path]).catch(() => {});
    throw err;
  }
}
