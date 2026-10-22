'use client';

import { useOptimistic, useRef, useState, useTransition } from 'react';
import { deleteItem, moveItem, undoDelete } from '@/app/actions/items';
import { BookIcon, PlusIcon } from '@/components/icons';
import { RowThumb } from '@/components/items/ItemRow';
import { SwipeRow } from '@/components/items/SwipeRow';
import { InsetList, LargeTitle, Segmented, Toast, type ToastProps } from '@/components/ui';
import { settle, type ActionResult } from '@/lib/actions/result';
import type { Item, ReadingState } from '@/lib/db/types';
import {
  EMPTY_TEXT,
  NEXT_ACTION_LABELS,
  nextReadingState,
  READING_LABELS,
  READING_STATES,
  statusForReading,
} from '@/lib/libros';
import type { PhotoMap } from '@/lib/photos/view';
import { LibroSheet, type LibroSheetMode } from './LibroSheet';

type ToastState = NonNullable<ToastProps['toast']>;
type Change = { id: string; state: ReadingState } | { id: string; removed: true };

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/** "Movido a Leyendo": the destination as a single book, not the tab label. */
const MOVED_TO: Record<ReadingState, string> = {
  por_leer: 'Movido a Por leer',
  leyendo: 'Movido a Leyendo',
  leido: 'Marcado como leído',
};

/** First non-empty line of the notes, for the row. */
function firstLine(notes: string | null): string | undefined {
  return notes?.split('\n').find((l) => l.trim())?.trim();
}

/**
 * Libros: Por leer · Leyendo · Leídos. Each row shows the cover (first photo), title, author and
 * the first line of the notes. Swipe right, or the button at the end, moves the book on
 * (por leer → leyendo → leído → por leer again); swipe left archives. Tap opens the sheet.
 */
export function LibrosScreen({ books, photos }: { books: Item[]; photos: PhotoMap }) {
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<ReadingState>('por_leer');
  const [changes, applyChange] = useOptimistic<Change[], Change>([], (list, c) => [...list, c]);
  const [sheet, setSheet] = useState<{ open: boolean; mode: LibroSheetMode }>({
    open: false,
    mode: { kind: 'new', state: 'por_leer' },
  });
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);

  // Books as they stand after the pending (optimistic) moves and removals.
  const current = books
    .filter((b) => !changes.some((c) => c.id === b.id && 'removed' in c))
    .map((b) => {
      const last = changes.findLast((c) => c.id === b.id && 'state' in c);
      return last && 'state' in last ? { ...b, readingState: last.state } : b;
    });
  const shown = current.filter((b) => (b.readingState ?? 'por_leer') === tab);

  function showToast(message: string, undo?: () => Promise<ActionResult<unknown>>) {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message,
      actionLabel: undo ? 'Deshacer' : undefined,
      onAction: undo ? () => startTransition(async () => void (await run(undo))) : undefined,
    });
  }

  async function run(fn: () => Promise<ActionResult<unknown>>): Promise<boolean> {
    const result = await settle(fn, OFFLINE);
    if (!result.ok) showToast(result.error);
    return result.ok;
  }

  function moveTo(book: Item, state: ReadingState) {
    const previous = book.readingState ?? 'por_leer';
    startTransition(async () => {
      applyChange({ id: book.id, state });
      if (await run(() => moveItem(book.id, { readingState: state }))) {
        showToast(MOVED_TO[state], () => moveItem(book.id, { readingState: previous }));
      }
    });
  }

  const advance = (book: Item) => moveTo(book, nextReadingState(book.readingState));

  function archive(book: Item) {
    const back = statusForReading(book.readingState ?? 'por_leer');
    startTransition(async () => {
      applyChange({ id: book.id, removed: true });
      if (await run(() => moveItem(book.id, { status: 'archivado' }))) {
        showToast('Archivado', () => moveItem(book.id, { status: back }));
      }
    });
  }

  function remove(book: Item) {
    startTransition(async () => {
      applyChange({ id: book.id, removed: true });
      if (await run(() => deleteItem(book.id))) showToast('Eliminado', () => undoDelete(book.id));
    });
  }

  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));

  function fromSheet(book: Item, then: (book: Item) => void) {
    closeSheet();
    then(book);
  }

  return (
    <>
      <LargeTitle
        title="Libros"
        trailing={
          <button
            type="button"
            className="ui-bar-button"
            aria-label="Nuevo libro"
            onClick={() => setSheet({ open: true, mode: { kind: 'new', state: tab } })}
          >
            <PlusIcon />
          </button>
        }
      >
        <div className="app-segmented">
          <Segmented<ReadingState>
            label="Estado de lectura"
            options={READING_STATES.map((s) => ({ value: s, label: READING_LABELS[s] }))}
            value={tab}
            onChange={setTab}
          />
        </div>

        {shown.length > 0 ? (
          <InsetList>
            {shown.map((book) => {
              const state = book.readingState ?? 'por_leer';
              const cover = photos[book.id]?.[0]?.url;
              const note = firstLine(book.notes);
              return (
                <SwipeRow
                  key={book.id}
                  completeLabel={NEXT_ACTION_LABELS[state]}
                  onCommit={(outcome) => (outcome === 'complete' ? advance(book) : archive(book))}
                >
                  <div className="ui-row app-book">
                    <button
                      type="button"
                      className="ui-row__body app-book__body"
                      onClick={() => setSheet({ open: true, mode: { kind: 'edit', item: book } })}
                    >
                      {cover ? (
                        <RowThumb url={cover} />
                      ) : (
                        <span className="app-book__placeholder" aria-hidden>
                          <BookIcon />
                        </span>
                      )}
                      <span className="ui-row__text">
                        <span className="ui-row__title">{book.title}</span>
                        {book.author && <span className="ui-row__subtitle">{book.author}</span>}
                        {note && <span className="ui-row__subtitle app-book__note">{note}</span>}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="app-book__next"
                      aria-label={`${NEXT_ACTION_LABELS[state]}: «${book.title}»`}
                      onClick={() => advance(book)}
                    >
                      {NEXT_ACTION_LABELS[state]}
                    </button>
                  </div>
                </SwipeRow>
              );
            })}
          </InsetList>
        ) : (
          <p className="app-empty">{EMPTY_TEXT[tab]}</p>
        )}
      </LargeTitle>

      <LibroSheet
        open={sheet.open}
        mode={sheet.mode}
        photos={sheet.mode.kind === 'edit' ? photos[sheet.mode.item.id] : undefined}
        onClose={closeSheet}
        onSaved={(state, notice) => {
          if (state !== tab) setTab(state);
          if (notice) showToast(notice);
        }}
        onArchive={(book) => fromSheet(book, archive)}
        onDelete={(book) => fromSheet(book, remove)}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
