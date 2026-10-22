/**
 * What the UI gets for a photo: its id, a signed URL and its size. Built on the server with the
 * session client (RLS), so the browser never sees storage paths of anything it cannot read.
 */
import type { PhotosRepo } from '@/lib/db/photos';
import type { PhotoStorage } from './storage';

export type PhotoView = { id: string; url: string; width: number | null; height: number | null };
/** itemId → its photos, oldest first. Items without photos are absent. */
export type PhotoMap = Record<string, PhotoView[]>;

export async function buildPhotoMap(
  repo: Pick<PhotosRepo, 'listPhotosFor'>,
  storage: Pick<PhotoStorage, 'sign'>,
  itemIds: string[],
): Promise<PhotoMap> {
  const photos = await repo.listPhotosFor([...new Set(itemIds)]);
  if (photos.length === 0) return {};
  const urls = await storage.sign(photos.map((p) => p.path));
  const map: PhotoMap = {};
  for (const p of photos) {
    const url = urls.get(p.path);
    if (!url) continue;
    (map[p.itemId] ??= []).push({ id: p.id, url, width: p.width, height: p.height });
  }
  return map;
}
