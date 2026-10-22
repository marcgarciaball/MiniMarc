import type { SupabaseClient } from '@supabase/supabase-js';

/** Private bucket created by 0005_photos.sql. */
export const PHOTO_BUCKET = 'photos';
/** Signed URLs are made per request on the server, valid for an hour. */
export const SIGNED_URL_SECONDS = 60 * 60;

/** The `photos` bucket, behind an interface so tests (cron purge, share) inject a fake. */
export interface PhotoStorage {
  upload(path: string, body: Blob, contentType: string): Promise<void>;
  /** Missing objects are not an error. */
  remove(paths: string[]): Promise<void>;
  /** path → signed URL; paths that could not be signed are left out. */
  sign(paths: string[], expiresIn?: number): Promise<Map<string, string>>;
}

/** '{userId}/{itemId}/{uuid}.{ext}': the first segment is what the storage RLS checks. */
export function photoPath(userId: string, itemId: string, ext: string, id: string = crypto.randomUUID()): string {
  return `${userId}/${itemId}/${id}.${ext}`;
}

/** True when `path` is inside the user's folder (and the item's, if given), with no tricks. */
export function isPhotoPathFor(path: string, userId: string, itemId?: string): boolean {
  const prefix = itemId ? `${userId}/${itemId}/` : `${userId}/`;
  if (!userId || !path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return /^[A-Za-z0-9._/-]+$/.test(rest) && !rest.split('/').some((s) => s === '' || s === '.' || s === '..');
}

/**
 * Storage on a Supabase client: the session client (RLS limits it to the user's folder) or the
 * service-role client with `userId`, which then refuses any path outside that user's folder.
 */
export function createSupabasePhotoStorage(client: SupabaseClient, opts: { userId?: string } = {}): PhotoStorage {
  const bucket = () => client.storage.from(PHOTO_BUCKET);
  const scoped = (paths: string[]) => {
    if (opts.userId && paths.some((p) => !isPhotoPathFor(p, opts.userId!))) {
      throw new Error('Ruta de foto fuera de la carpeta del usuario');
    }
    return paths;
  };
  return {
    async upload(path, body, contentType) {
      const { error } = await bucket().upload(scoped([path])[0], body, { contentType, upsert: false });
      if (error) throw new Error(`upload photo: ${error.message}`);
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove(scoped(paths));
      if (error) throw new Error(`remove photos: ${error.message}`);
    },
    async sign(paths, expiresIn = SIGNED_URL_SECONDS) {
      const out = new Map<string, string>();
      if (paths.length === 0) return out;
      const { data, error } = await bucket().createSignedUrls(scoped(paths), expiresIn);
      if (error) throw new Error(`sign photos: ${error.message}`);
      for (const s of data ?? []) if (s.path && s.signedUrl && !s.error) out.set(s.path, s.signedUrl);
      return out;
    },
  };
}
