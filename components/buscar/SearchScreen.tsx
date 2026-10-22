'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { listCapturePeople } from '@/app/actions/capture';
import { addItem, deleteItem, moveItem, toggleDone, undoDelete } from '@/app/actions/items';
import { search, type SearchResponse } from '@/app/actions/search';
import { CloseIcon, SearchIcon } from '@/components/icons';
import { RowThumb } from '@/components/items/ItemRow';
import { ItemSheet } from '@/components/items/ItemSheet';
import { LibroSheet } from '@/components/libros/LibroSheet';
import { LinkPreviewCard } from '@/components/links/LinkPreviewCard';
import { LinkText } from '@/components/links/LinkText';
import { InsetList, LargeTitle, Row, Switch, Toast, type ToastProps } from '@/components/ui';
import type { MovePatch } from '@/lib/actions/items';
import { settle, type ActionResult } from '@/lib/actions/result';
import type { Item, Person } from '@/lib/db/types';
import { TYPE_LABELS } from '@/lib/format';
import { SEARCH_INPUT_ID } from '@/lib/nav';

type ToastState = NonNullable<ToastProps['toast']>;

const DEBOUNCE_MS = 250;
const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
const SEARCH_OFFLINE = 'No se ha podido buscar. Revisa la conexión e inténtalo de nuevo.';

/** First line of the notes, else the type (for an unclassified or deleted item). */
function subtitleFor(item: Item, showType: boolean): string | undefined {
  const parts: string[] = [];
  if (showType) parts.push(TYPE_LABELS[item.type]);
  if (item.type === 'libro' && item.author) parts.push(item.author);
  const note = item.notes?.split('\n').find((l) => l.trim())?.trim();
  if (note) parts.push(note);
  return parts.join(' · ') || undefined;
}

/**
 * /buscar: a field (focused on desktop), searched as you type (debounced) or on Enter, and the
 * results grouped like the lists. A result opens its own sheet (items) or page (people); deleted
 * items only appear with the Papelera switch, and open the Papelera.
 */
export function SearchScreen() {
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [sheet, setSheet] = useState<{ open: boolean; item: Item | null }>({ open: false, item: null });
  const [toast, setToast] = useState<ToastState | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const toastId = useRef(0);

  // Desktop: straight into the field. On iPhone the keyboard would cover the screen uninvited.
  useEffect(() => {
    if (window.matchMedia('(min-width: 900px)').matches) inputRef.current?.focus();
  }, []);

  // People for the gift sheet's "Para" picker.
  useEffect(() => {
    let live = true;
    void settle(listCapturePeople, '').then((r) => {
      if (live && r.ok) setPeople(r.value);
    });
    return () => {
      live = false;
    };
  }, []);

  async function runSearch(q: string, deleted: boolean) {
    const id = ++requestId.current;
    if (!q.trim()) {
      setResults(null);
      setError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const r = await settle(() => search(q, deleted), SEARCH_OFFLINE);
    if (id !== requestId.current) return; // a newer search is on its way
    setSearching(false);
    if (r.ok) {
      setResults(r.value);
      setError(null);
    } else {
      setError(r.error);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void runSearch(query, includeDeleted), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, includeDeleted]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void runSearch(query, includeDeleted);
  }

  const refresh = () => void runSearch(query, includeDeleted);

  function showToast(message: string, undo?: () => Promise<ActionResult<unknown>>) {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message,
      actionLabel: undo ? 'Deshacer' : undefined,
      onAction: undo
        ? () =>
            startTransition(async () => {
              const r = await settle(undo, OFFLINE);
              if (!r.ok) showToast(r.error);
              refresh();
            })
        : undefined,
    });
  }

  function act(action: () => Promise<ActionResult<unknown>>, message: string, undo?: () => Promise<ActionResult<unknown>>) {
    setSheet((s) => ({ ...s, open: false }));
    startTransition(async () => {
      const r = await settle(action, OFFLINE);
      if (r.ok) showToast(message, undo);
      else showToast(r.error);
      refresh();
    });
  }

  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));
  const save = async (item: Item, patch: MovePatch) => {
    const r = await settle(() => moveItem(item.id, patch), OFFLINE);
    if (r.ok) refresh();
    return r;
  };

  const item = sheet.item;
  const photos = results?.photos ?? {};

  return (
    <>
      <LargeTitle title="Buscar" search={false}>
        <form role="search" onSubmit={submit}>
          <label className="app-search">
            <SearchIcon />
            <input
              ref={inputRef}
              id={SEARCH_INPUT_ID}
              type="search"
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tareas, ideas, libros, personas…"
              aria-label="Buscar"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              maxLength={100}
            />
            {query && (
              <button
                type="button"
                className="app-search__clear"
                aria-label="Borrar búsqueda"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
              >
                <CloseIcon />
              </button>
            )}
          </label>
        </form>

        <div className="app-search__options">
          <InsetList footer="Incluye lo eliminado en los últimos 30 días.">
            <Row title="Papelera" trailing={<Switch label="Buscar también en la Papelera" checked={includeDeleted} onChange={setIncludeDeleted} />} />
          </InsetList>
        </div>

        {error && (
          <p className="app-form__error" role="alert">
            {error}
          </p>
        )}

        <div aria-live="polite" aria-busy={searching}>
          {results?.groups.map((group) =>
            group.kind === 'people' ? (
              <InsetList key={group.key} header={group.label}>
                {group.people.map((p) => (
                  <Row key={p.id} href={`/personas/${p.id}`} title={p.name} subtitle={p.notes?.split('\n')[0] || undefined} />
                ))}
              </InsetList>
            ) : (
              <InsetList key={group.key} header={group.label}>
                {group.items.map((i) => {
                  const deleted = Boolean(i.deletedAt);
                  const subtitle = subtitleFor(i, deleted || i.needsReview);
                  return (
                    <div key={i.id}>
                      <div className="ui-row app-item">
                        <div className="ui-row__body app-press">
                          {deleted ? (
                            <Link href="/bandeja/papelera" className="app-press__hit" aria-label={`«${i.title}», en la Papelera`} />
                          ) : (
                            <button
                              type="button"
                              className="app-press__hit"
                              aria-label={`Abrir «${i.title}»`}
                              onClick={() => setSheet({ open: true, item: i })}
                            />
                          )}
                          <span className="ui-row__text">
                            <span className="ui-row__title" data-done={i.status === 'hecho' || undefined}>
                              <LinkText text={i.title} />
                            </span>
                            {subtitle && (
                              <span className="ui-row__subtitle">
                                <LinkText text={subtitle} />
                              </span>
                            )}
                          </span>
                          {i.status === 'hecho' && <span className="ui-row__detail">Hecho</span>}
                          {i.status === 'archivado' && <span className="ui-row__detail">Archivado</span>}
                          {photos[i.id]?.[0] && <RowThumb url={photos[i.id][0].url} />}
                        </div>
                      </div>
                      {i.link && !deleted && <LinkPreviewCard item={i} inRow />}
                    </div>
                  );
                })}
              </InsetList>
            ),
          )}
          {results && results.total === 0 && query.trim() && <p className="app-empty">Sin resultados para «{results.query}».</p>}
        </div>
      </LargeTitle>

      <ItemSheet
        open={sheet.open && item?.type !== 'libro'}
        mode={item && item.type !== 'libro' ? { kind: 'edit', item } : { kind: 'new', defaults: { type: 'idea', label: '' } }}
        people={people}
        photos={item ? photos[item.id] : undefined}
        reviewMode={item?.needsReview}
        onClose={closeSheet}
        onCreate={(fd) => settle(() => addItem(fd), OFFLINE)}
        onSave={save}
        onComplete={(i) => act(() => toggleDone(i.id), 'Marcado como hecho', () => toggleDone(i.id))}
        onArchive={(i) =>
          act(() => moveItem(i.id, { status: 'archivado' }), 'Archivado', () => moveItem(i.id, { status: 'pendiente' }))
        }
        onDelete={(i) => act(() => deleteItem(i.id), 'Eliminado', () => undoDelete(i.id))}
      />
      <LibroSheet
        open={sheet.open && item?.type === 'libro'}
        mode={item?.type === 'libro' ? { kind: 'edit', item } : { kind: 'new', state: 'por_leer' }}
        photos={item ? photos[item.id] : undefined}
        onClose={closeSheet}
        onSaved={(_state, notice) => {
          if (notice) showToast(notice);
          refresh();
        }}
        onArchive={(b) => act(() => moveItem(b.id, { status: 'archivado' }), 'Archivado', () => moveItem(b.id, { status: 'pendiente' }))}
        onDelete={(b) => act(() => deleteItem(b.id), 'Eliminado', () => undoDelete(b.id))}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
