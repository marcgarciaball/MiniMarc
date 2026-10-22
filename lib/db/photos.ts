import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBackend, type DbBackend, type Row } from './backend';

/** One photo of an item (item_photos row). The image itself lives in the private `photos` bucket. */
export interface ItemPhoto {
  id: string;
  itemId: string;
  /** Storage path in the `photos` bucket: '{userId}/{itemId}/{uuid}.webp'. */
  path: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export type NewPhoto = Pick<ItemPhoto, 'itemId' | 'path' | 'width' | 'height'>;

export interface PhotosRepo {
  addPhoto(input: NewPhoto): Promise<ItemPhoto>;
  /** An item's photos, oldest first. */
  listPhotos(itemId: string): Promise<ItemPhoto[]>;
  /** Photos of several items at once (list screens), oldest first. */
  listPhotosFor(itemIds: string[]): Promise<ItemPhoto[]>;
  getPhoto(id: string): Promise<ItemPhoto | null>;
  /** Removes the row only; the storage object is the caller's job. */
  removePhoto(id: string): Promise<void>;
}

const num = (v: unknown) => (v == null ? null : Number(v));

export function rowToPhoto(row: Row): ItemPhoto {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    path: String(row.path),
    width: num(row.width),
    height: num(row.height),
    createdAt: String(row.created_at),
  };
}

const byCreated = (a: ItemPhoto, b: ItemPhoto) => Date.parse(a.createdAt) - Date.parse(b.createdAt);

export function createPhotosRepo(backend: DbBackend): PhotosRepo {
  return {
    async addPhoto({ itemId, path, width, height }) {
      return rowToPhoto(await backend.insert('item_photos', { item_id: itemId, path, width, height }));
    },
    async listPhotos(itemId) {
      return (await backend.select('item_photos', { eq: { item_id: itemId } })).map(rowToPhoto).sort(byCreated);
    },
    async listPhotosFor(itemIds) {
      if (itemIds.length === 0) return [];
      return (await backend.select('item_photos', { in: { item_id: itemIds } })).map(rowToPhoto).sort(byCreated);
    },
    async getPhoto(id) {
      const [row] = await backend.select('item_photos', { eq: { id } });
      return row ? rowToPhoto(row) : null;
    },
    async removePhoto(id) {
      await backend.remove('item_photos', { eq: { id } });
    },
  };
}

/** With `userId` (service-role client) every query is scoped to that user; without it, RLS does. */
export function createSupabasePhotosRepo(client: SupabaseClient, opts: { userId?: string } = {}): PhotosRepo {
  return createPhotosRepo(createSupabaseBackend(client, opts));
}
