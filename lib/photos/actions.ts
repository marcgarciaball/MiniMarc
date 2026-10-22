/**
 * Logic behind the photo server actions (app/actions/photos.ts). The browser uploads the image
 * itself with the user's session; these only record or remove it.
 */
import { UserError } from '@/lib/actions/result';
import type { ItemPhoto, PhotosRepo } from '@/lib/db/photos';
import { isPhotoPathFor, type PhotoStorage } from './storage';

export interface PhotoActionDeps {
  userId: string;
  photos: PhotosRepo;
  storage: PhotoStorage;
}

const size = (v: unknown): number | null => (Number.isInteger(v) && (v as number) > 0 && (v as number) <= 20000 ? (v as number) : null);

/** Records an image already uploaded to '{userId}/{itemId}/…'. */
export async function addPhoto(
  deps: PhotoActionDeps,
  input: { itemId: string; path: string; width?: unknown; height?: unknown },
): Promise<ItemPhoto> {
  if (typeof input.itemId !== 'string' || typeof input.path !== 'string' || !isPhotoPathFor(input.path, deps.userId, input.itemId)) {
    throw new UserError('La foto no es válida.');
  }
  return deps.photos.addPhoto({ itemId: input.itemId, path: input.path, width: size(input.width), height: size(input.height) });
}

/** Removes the image, then its row (a failed removal leaves the row, so it can be retried). */
export async function deletePhoto(deps: PhotoActionDeps, id: string): Promise<void> {
  const photo = await deps.photos.getPhoto(id);
  if (!photo) throw new UserError('Esa foto ya no existe.');
  await deps.storage.remove([photo.path]);
  await deps.photos.removePhoto(id);
}
