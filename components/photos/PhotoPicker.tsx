'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { CameraIcon, PhotoIcon } from '@/components/icons';

export type PhotoPickerProps = {
  /** Image files chosen, taken or dropped (non-images are left out). */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Label of the gallery button. */
  label?: string;
  /** Allow several files at once. */
  multiple?: boolean;
};

const images = (list: FileList | null) => Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));

/**
 * "Hacer foto" (camera, touch screens only) and "Añadir foto" (gallery / files), plus a drop
 * zone on desktop. Two inputs because `capture` forces the camera on Android and iOS.
 */
export function PhotoPicker({ onFiles, disabled, label = 'Añadir foto', multiple = true }: PhotoPickerProps) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function picked(e: ChangeEvent<HTMLInputElement>) {
    const files = images(e.currentTarget.files);
    e.currentTarget.value = '';
    if (files.length) onFiles(files);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (disabled || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = images(e.dataTransfer.files);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  }

  return (
    <div
      className="photo-picker"
      data-dragging={dragging || undefined}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <button
        type="button"
        className="ui-row app-action photo-picker__button photo-picker__camera"
        disabled={disabled}
        onClick={() => camera.current?.click()}
      >
        <CameraIcon />
        Hacer foto
      </button>
      <button
        type="button"
        className="ui-row app-action photo-picker__button"
        disabled={disabled}
        onClick={() => gallery.current?.click()}
      >
        <PhotoIcon />
        {label}
        <span className="photo-picker__hint">o arrastra imágenes aquí</span>
      </button>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={picked} />
      <input ref={gallery} type="file" accept="image/*" multiple={multiple} hidden onChange={picked} />
    </div>
  );
}
