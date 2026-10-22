'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent, type TransitionStartFunction } from 'react';
import { addItem, moveItem } from '@/app/actions/items';
import { ItemPhotos, uploadItemPhotos } from '@/components/items/ItemPhotos';
import { PhotoPicker } from '@/components/photos';
import { InsetList, Segmented, Sheet } from '@/components/ui';
import { editPatchFromForm, newItemFormError } from '@/lib/actions/forms';
import { settle } from '@/lib/actions/result';
import type { Item, ReadingState } from '@/lib/db/types';
import { originalText } from '@/lib/format';
import { linkHref, READING_LABELS, READING_STATES } from '@/lib/libros';
import type { PhotoView } from '@/lib/photos/view';

export type LibroSheetMode = { kind: 'new'; state: ReadingState } | { kind: 'edit'; item: Item };

export type LibroSheetProps = {
  open: boolean;
  mode: LibroSheetMode;
  /** The edited book's photos (signed URLs); the first one is the cover. */
  photos?: PhotoView[];
  onClose: () => void;
  /** After a successful save, with the book's reading state (the screen shows that tab). */
  onSaved: (state: ReadingState, notice?: string) => void;
  onArchive: (book: Item) => void;
  onDelete: (book: Item) => void;
};

const FORM_ID = 'libro-sheet-form';
const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/** Singular labels for the sheet's control ("Leído", not "Leídos"). */
const STATE_OPTIONS = READING_STATES.map((value) => ({
  value,
  label: value === 'leido' ? 'Leído' : READING_LABELS[value],
}));

/** Add or edit a book: title, author, reading state, link, notes and cover. */
export function LibroSheet(props: LibroSheetProps) {
  const { open, mode, onClose } = props;
  const [pending, startTransition] = useTransition();
  const editing = mode.kind === 'edit' ? mode.item : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Editar libro' : 'Nuevo libro'}
      leading={
        <button type="button" className="ui-bar-button" onClick={onClose}>
          Cancelar
        </button>
      }
      trailing={
        <button type="submit" form={FORM_ID} className="ui-bar-button ui-bar-button--strong" disabled={pending}>
          {editing ? 'OK' : 'Añadir'}
        </button>
      }
    >
      {/* Remount per book so the uncontrolled fields start from its values. */}
      <LibroForm key={editing ? editing.id : `new-${String(open)}`} {...props} startTransition={startTransition} />
    </Sheet>
  );
}

type Cover = { file: File; url: string };

function LibroForm(props: LibroSheetProps & { startTransition: TransitionStartFunction }) {
  const { mode, photos, onClose, onSaved, onArchive, onDelete, startTransition } = props;
  const book = mode.kind === 'edit' ? mode.item : null;
  const [state, setState] = useState<ReadingState>(book?.readingState ?? (mode.kind === 'new' ? mode.state : 'por_leer'));
  const [cover, setCover] = useState<Cover | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const coverUrl = useRef<string | null>(null);
  const href = linkHref(book?.link ?? null);
  const source = book ? originalText(book) : null;

  // The local preview of a cover chosen before the book exists.
  useEffect(() => () => {
    if (coverUrl.current) URL.revokeObjectURL(coverUrl.current);
  }, []);

  function pickCover(files: File[]) {
    const file = files[0];
    if (!file) return;
    if (coverUrl.current) URL.revokeObjectURL(coverUrl.current);
    coverUrl.current = URL.createObjectURL(file);
    setCover({ file, url: coverUrl.current });
  }

  // onSubmit, not <form action>: React would reset the fields when the action ends, even on failure.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const fd = new FormData(e.currentTarget);
    let save: () => Promise<{ ok: true; notice?: string } | { ok: false; error: string }>;
    if (book) {
      const patch = editPatchFromForm(fd, { type: 'libro', area: 'personal' });
      if (!patch.ok) return setError(patch.error);
      save = async () => {
        const r = await settle(() => moveItem(book.id, patch.value), OFFLINE);
        return r.ok ? { ok: true } : r;
      };
    } else {
      const invalid = newItemFormError(fd);
      if (invalid) return setError(invalid);
      const file = cover?.file;
      save = async () => {
        const r = await settle(() => addItem(fd), OFFLINE);
        if (!r.ok) return r;
        if (!file) return { ok: true };
        // The book is saved; a cover that fails to upload is only a notice (add it again later).
        const failed = await uploadItemPhotos(r.value.id, [file]);
        return { ok: true, notice: failed ? `Libro guardado, pero sin portada: ${failed}` : undefined };
      };
    }
    setError(null);
    inFlight.current = true;
    startTransition(async () => {
      const result = await save();
      inFlight.current = false;
      startTransition(() => {
        if (result.ok) {
          onClose();
          onSaved(state, result.notice);
        } else {
          setError(result.error);
        }
      });
    });
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} className="app-form">
      <input type="hidden" name="type" value="libro" />
      <input type="hidden" name="readingState" value={state} />
      <InsetList>
        <input
          className="app-input app-input--title"
          name="title"
          defaultValue={book?.title}
          placeholder="Título"
          aria-label="Título"
          autoComplete="off"
          enterKeyHint="next"
        />
        <input
          className="app-input app-input--below"
          name="author"
          defaultValue={book?.author ?? ''}
          placeholder="Autor"
          aria-label="Autor"
          autoComplete="off"
          autoCapitalize="words"
          maxLength={200}
        />
      </InsetList>

      <div className="app-form__segmented">
        <Segmented<ReadingState> label="Estado de lectura" options={STATE_OPTIONS} value={state} onChange={setState} />
      </div>

      <InsetList>
        <label className="app-field">
          <span>Enlace</span>
          <input
            className="app-input"
            name="link"
            type="text"
            inputMode="url"
            defaultValue={book?.link ?? ''}
            placeholder="Opcional"
            autoComplete="off"
            autoCapitalize="none"
          />
        </label>
        {href && (
          <a className="ui-row app-action" href={href} target="_blank" rel="noopener noreferrer">
            Abrir enlace
          </a>
        )}
      </InsetList>

      <InsetList>
        <textarea
          className="app-input app-input--notes app-input--alone"
          name="notes"
          defaultValue={book?.notes ?? ''}
          placeholder="Notas"
          aria-label="Notas"
          rows={4}
        />
      </InsetList>

      <InsetList header="Portada" footer={book && (photos?.length ?? 0) > 1 ? 'La primera foto es la portada.' : undefined}>
        {book ? (
          <ItemPhotos itemId={book.id} photos={photos ?? []} addLabel="Añadir portada" multiple={false} />
        ) : (
          <div className="photo-gallery">
            {cover && (
              <div className="photo-gallery__grid">
                <div className="photo-gallery__thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob URL) */}
                  <img src={cover.url} alt="Portada elegida" />
                </div>
              </div>
            )}
            <PhotoPicker onFiles={pickCover} multiple={false} label={cover ? 'Cambiar portada' : 'Añadir portada'} />
          </div>
        )}
      </InsetList>

      {source && (
        <InsetList header="Texto original">
          <p className="app-source-text">{source}</p>
        </InsetList>
      )}

      {error && (
        <p className="app-form__error" role="alert">
          {error}
        </p>
      )}

      {book && (
        <InsetList>
          <button type="button" className="ui-row app-action" onClick={() => onArchive(book)}>
            Archivar
          </button>
          <button type="button" className="ui-row app-action app-action--destructive" onClick={() => onDelete(book)}>
            Eliminar
          </button>
        </InsetList>
      )}
    </form>
  );
}
