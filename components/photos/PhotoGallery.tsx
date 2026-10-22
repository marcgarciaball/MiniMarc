'use client';

import { useState } from 'react';
import type { PhotoView } from '@/lib/photos/view';
import { PhotoLightbox } from './PhotoLightbox';
import { PhotoPicker } from './PhotoPicker';
import './photos.css';

export type PhotoGalleryProps = {
  photos: PhotoView[];
  /** Enables the picker ("Hacer foto" / "Añadir foto" / drop). */
  onAdd?: (files: File[]) => void;
  /** Enables "Eliminar foto" in the full-screen view. */
  onDelete?: (photo: PhotoView) => Promise<void> | void;
  /** An upload is in progress: the picker waits and says so. */
  busy?: boolean;
  /** Shown under the photos (upload or delete failure). */
  error?: string | null;
  addLabel?: string;
  multiple?: boolean;
};

/**
 * Thumbnails, full-screen view and picker. Knows nothing about items or storage: the caller
 * uploads and deletes (ItemPhotos for items; Libros covers can reuse it as is).
 */
export function PhotoGallery({ photos, onAdd, onDelete, busy, error, addLabel, multiple }: PhotoGalleryProps) {
  const [open, setOpen] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function remove(photo: PhotoView) {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(photo);
      setOpen(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="photo-gallery">
      {(photos.length > 0 || busy) && (
        <div className="photo-gallery__grid">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="photo-gallery__thumb"
              aria-label={`Ver foto ${i + 1} de ${photos.length}`}
              onClick={() => setOpen(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, no optimizer */}
              <img src={p.url} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
          {busy && <div className="photo-gallery__thumb photo-gallery__thumb--pending" aria-label="Subiendo foto" role="status" />}
        </div>
      )}
      {error && (
        <p className="photo-gallery__error" role="alert">
          {error}
        </p>
      )}
      {onAdd && <PhotoPicker onFiles={onAdd} disabled={busy} label={busy ? 'Subiendo…' : addLabel} multiple={multiple} />}
      {open !== null && photos.length > 0 && (
        <PhotoLightbox
          photos={photos}
          index={Math.min(open, photos.length - 1)}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onDelete={onDelete ? remove : undefined}
          deleting={deleting}
        />
      )}
    </div>
  );
}
