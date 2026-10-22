'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, TrashIcon } from '@/components/icons';
import type { PhotoView } from '@/lib/photos/view';

export type PhotoLightboxProps = {
  photos: PhotoView[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** Shows "Eliminar" (asks once more before calling). */
  onDelete?: (photo: PhotoView) => void;
  deleting?: boolean;
};

/**
 * Full-screen photo over a dark glass backdrop. Escape or ✕ closes, arrows move between photos.
 * Rendered into <body>: an open sheet is transformed, which would trap a fixed overlay inside it.
 */
export function PhotoLightbox({ photos, index, onIndex, onClose, onDelete, deleting }: PhotoLightboxProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const photo = photos[Math.min(index, photos.length - 1)];
  const count = photos.length;

  useEffect(() => {
    // Capture phase on window, stopped there: Escape closes the photo, not the sheet below it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && count > 1) onIndex((index - 1 + count) % count);
      else if (e.key === 'ArrowRight' && count > 1) onIndex((index + 1) % count);
      else return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, count, onIndex, onClose]);

  if (!photo || typeof document === 'undefined') return null;

  return createPortal(
    <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="Foto">
      <div className="photo-lightbox__backdrop" onClick={onClose} aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, no optimizer */}
      <img
        className="photo-lightbox__image"
        src={photo.url}
        alt=""
        width={photo.width ?? undefined}
        height={photo.height ?? undefined}
      />
      <div className="photo-lightbox__bar photo-lightbox__bar--top">
        <button type="button" className="photo-lightbox__button" aria-label="Cerrar" onClick={onClose}>
          <CloseIcon />
        </button>
        {count > 1 && (
          <span className="photo-lightbox__count">
            {Math.min(index, count - 1) + 1} de {count}
          </span>
        )}
      </div>
      <div className="photo-lightbox__bar photo-lightbox__bar--bottom">
        {count > 1 ? (
          <button
            type="button"
            className="photo-lightbox__button"
            aria-label="Foto anterior"
            onClick={() => onIndex((index - 1 + count) % count)}
          >
            <ChevronLeftIcon />
          </button>
        ) : (
          <span />
        )}
        {onDelete &&
          (confirming === photo.id ? (
            <button
              type="button"
              className="photo-lightbox__pill photo-lightbox__pill--destructive"
              disabled={deleting}
              onClick={() => onDelete(photo)}
            >
              {deleting ? 'Eliminando…' : 'Eliminar foto'}
            </button>
          ) : (
            <button
              type="button"
              className="photo-lightbox__button"
              aria-label="Eliminar foto"
              onClick={() => setConfirming(photo.id)}
            >
              <TrashIcon />
            </button>
          ))}
        {count > 1 ? (
          <button
            type="button"
            className="photo-lightbox__button"
            aria-label="Foto siguiente"
            onClick={() => onIndex((index + 1) % count)}
          >
            <ChevronRightIcon />
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>,
    document.body,
  );
}
