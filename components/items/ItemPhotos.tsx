'use client';

import { useState } from 'react';
import { addPhoto, deletePhoto } from '@/app/actions/photos';
import { PhotoGallery } from '@/components/photos';
import { settle } from '@/lib/actions/result';
import { prepareImage } from '@/lib/photos/resize';
import { createSupabasePhotoStorage, photoPath } from '@/lib/photos/storage';
import type { PhotoView } from '@/lib/photos/view';
import { createClient } from '@/lib/supabase/browser';

const OFFLINE = 'No se ha podido subir la foto. Revisa la conexión e inténtalo de nuevo.';

/**
 * An item's photos in its edit sheet. Each image is shrunk in the browser (1600 px, WebP/JPEG),
 * uploaded straight to the private bucket with Marc's session (RLS: only his folder), then
 * recorded with a server action, which refreshes the screen with new signed URLs (`photos`).
 */
export function ItemPhotos({ itemId, photos }: { itemId: string; photos: PhotoView[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: File[]) {
    setBusy(true);
    setError(null);
    let failure: string | null = null;
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('Vuelve a iniciar sesión para añadir fotos.');
      const storage = createSupabasePhotoStorage(supabase);
      for (const file of files) {
        try {
          const img = await prepareImage(file);
          const path = photoPath(data.user.id, itemId, img.ext);
          try {
            await storage.upload(path, img.blob, img.type);
          } catch {
            throw new Error(OFFLINE);
          }
          const r = await settle(() => addPhoto(itemId, path, img.width, img.height), OFFLINE);
          if (!r.ok) {
            await storage.remove([path]).catch(() => {});
            throw new Error(r.error);
          }
        } catch (err) {
          failure = err instanceof Error ? err.message : OFFLINE;
        }
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : OFFLINE;
    }
    setBusy(false);
    setError(failure);
  }

  async function remove(photo: PhotoView) {
    setError(null);
    const r = await settle(() => deletePhoto(photo.id), 'No se ha podido eliminar la foto.');
    if (!r.ok) setError(r.error);
  }

  return <PhotoGallery photos={photos} onAdd={upload} onDelete={remove} busy={busy} error={error} />;
}
