'use client';

import { useOptimistic, useRef, useState, useTransition, type ReactNode } from 'react';
import { addItem, deleteItem, moveItem, retrySync, toggleDone, undoDelete } from '@/app/actions/items';
import { PlusIcon } from '@/components/icons';
import { InsetList, LargeTitle, Toast, type ToastProps } from '@/components/ui';
import type { MovePatch } from '@/lib/actions/items';
import { applyListOps, draftItem, fitsNewList, isDraft, staysInList, type ListOp } from '@/lib/actions/optimistic';
import { settle, type ActionResult } from '@/lib/actions/result';
import type { Item, Person } from '@/lib/db/types';
import { formatDue, TYPE_LABELS } from '@/lib/format';
import type { PhotoMap } from '@/lib/photos/view';
import { ItemRow } from './ItemRow';
import { ItemSheet, type NewItemDefaults, type SheetMode } from './ItemSheet';
import { SwipeRow } from './SwipeRow';
import { SyncNotice } from './SyncNotice';

export type ItemSection = { key: string; header?: string; footer?: string; items: Item[] };

export type ItemsScreenProps = {
  title: string;
  /** Madrid "YYYY-MM-DD", from the server, for "Hoy"/"Mañana" labels. */
  today: string;
  sections: ItemSection[];
  /** Quiet text when every section is empty. */
  emptyText?: string;
  /** Enables the + button and its sheet. */
  newItem?: NewItemDefaults;
  people?: Person[];
  /** Sin clasificar: rows show their type, saving files them. */
  reviewMode?: boolean;
  /** On a person's own page "Para Ana" is redundant. */
  hidePerson?: boolean;
  leading?: ReactNode;
  /** Content between the title and the lists (area selector, person card…). */
  before?: ReactNode;
  /** Tareas: rows whose Calendar sync failed say so and offer "Reintentar". */
  syncNotices?: boolean;
  /** itemId → photos (signed URLs), from loadPhotoMap on the server. */
  photos?: PhotoMap;
};

type ToastState = NonNullable<ToastProps['toast']>;

/** Delay between ticking the circle and the row leaving, so the check is seen (as in Reminders). */
const CHECK_DELAY_MS = 450;

/** The server action call itself failed (no connection, server down). */
const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
const ADD_OFFLINE = 'No se ha podido añadir. Revisa la conexión e inténtalo de nuevo.';

/** A list screen: large title, grouped item rows with swipe, add/edit sheet and an undo toast. */
export function ItemsScreen({
  title,
  today,
  sections,
  emptyText,
  newItem,
  people = [],
  reviewMode,
  hidePerson,
  leading,
  before,
  syncNotices,
  photos = {},
}: ItemsScreenProps) {
  const [, startTransition] = useTransition();
  // Pending writes, applied over the server's lists: rows change at once and React drops these
  // when the action ends (the refreshed lists take over, or the row comes back on failure).
  const [ops, addOp] = useOptimistic<ListOp[], ListOp>([], (list, op) => [...list, op]);
  const drafts = useRef(0);
  const [checked, setChecked] = useState<string[]>([]);
  const [sheet, setSheet] = useState<{ open: boolean; mode: SheetMode }>({
    open: false,
    mode: { kind: 'new', defaults: newItem ?? { type: 'tarea', label: '' } },
  });
  const [toast, setToast] = useState<ToastState | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const toastId = useRef(0);

  const peopleById = new Map(people.map((p) => [p.id, p.name]));
  // New rows go to the first section (the screen's own list); the server then sorts them.
  const visible = sections.map((s, i) => ({ ...s, items: applyListOps(s.items, ops, i === 0) }));
  const isEmpty = visible.every((s) => s.items.length === 0);

  function showToast(message: string, undo?: () => Promise<ActionResult<unknown>>, actionLabel = 'Deshacer') {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message,
      actionLabel: undo ? actionLabel : undefined,
      onAction: undo ? () => startTransition(async () => void (await run(undo))) : undefined,
    });
  }

  async function run(fn: () => Promise<ActionResult<unknown>>): Promise<boolean> {
    const result = await settle(fn, OFFLINE);
    if (!result.ok) showToast(result.error);
    return result.ok;
  }

  /** Removes the row at once, runs the action, offers Undo. The row comes back by itself if the action fails. */
  function removeWith(
    item: Item,
    action: () => Promise<ActionResult<unknown>>,
    message: string,
    undo: () => Promise<ActionResult<unknown>>,
  ) {
    startTransition(async () => {
      addOp({ kind: 'remove', id: item.id });
      if (await run(action)) showToast(message, undo);
    });
  }

  const complete = (item: Item) =>
    removeWith(item, () => toggleDone(item.id), 'Marcado como hecho', () => toggleDone(item.id));
  const archive = (item: Item) =>
    removeWith(item, () => moveItem(item.id, { status: 'archivado' }), 'Archivado', () =>
      moveItem(item.id, { status: 'pendiente' }),
    );
  const remove = (item: Item) =>
    removeWith(item, () => deleteItem(item.id), 'Eliminado', () => undoDelete(item.id));

  function retry(item: Item) {
    setRetrying(item.id);
    startTransition(async () => {
      const result = await settle(() => retrySync(item.id), OFFLINE);
      setRetrying(null);
      if (!result.ok) showToast(result.error);
      else if (result.value.syncError) showToast('Calendar sigue sin responder. Inténtalo más tarde.');
    });
  }

  function tick(item: Item) {
    setChecked((ids) => [...ids, item.id]);
    setTimeout(() => {
      complete(item);
      setChecked((ids) => ids.filter((id) => id !== item.id));
    }, CHECK_DELAY_MS);
  }

  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));

  function openNew() {
    if (!newItem) return;
    setSheet({ open: true, mode: { kind: 'new', defaults: newItem } });
  }

  function openEdit(item: Item) {
    if (isDraft(item)) return;
    setSheet({ open: true, mode: { kind: 'edit', item } });
  }

  function fromSheet(item: Item, then: (item: Item) => void) {
    closeSheet();
    then(item);
  }

  /**
   * Optimistic add: the sheet closes and the row shows (dimmed) at once. If the save fails the
   * row goes away and the toast offers to try again with what was typed.
   */
  function create(fd: FormData): Promise<ActionResult<null>> {
    drafts.current += 1;
    const draft = draftItem(fd, drafts.current, new Date());
    startTransition(async () => {
      if (draft && newItem && fitsNewList(draft, newItem)) addOp({ kind: 'add', item: draft });
      const result = await settle(() => addItem(fd), ADD_OFFLINE);
      if (!result.ok) showToast(result.error, () => addItem(fd), 'Reintentar');
    });
    return Promise.resolve({ ok: true, value: null });
  }

  /** Optimistic edit ("Mover a…" included): the row updates, or leaves the list, at once. */
  function save(item: Item, patch: MovePatch): Promise<ActionResult<null>> {
    const stays = staysInList(item, patch, { reviewMode, personId: newItem?.personId });
    startTransition(async () => {
      addOp(stays ? { kind: 'patch', id: item.id, patch } : { kind: 'remove', id: item.id });
      const result = await settle(() => moveItem(item.id, patch), OFFLINE);
      if (!result.ok) showToast(result.error);
    });
    return Promise.resolve({ ok: true, value: null });
  }

  function subtitleFor(item: Item): { subtitle?: string; detail?: string } {
    const parts: string[] = [];
    if (reviewMode) parts.push(TYPE_LABELS[item.type]);
    const { day, time } = formatDue(item, today);
    if (day) parts.push(day);
    if (item.type === 'regalo' && item.personId && !hidePerson) {
      const name = peopleById.get(item.personId);
      if (name) parts.push(`Para ${name}`);
    }
    if (item.area === 'trabajo' && item.type !== 'tarea') parts.push('Trabajo');
    if (!parts.length && item.notes) parts.push(item.notes);
    return { subtitle: parts.join(' · ') || undefined, detail: time };
  }

  return (
    <>
      <LargeTitle
        title={title}
        leading={leading}
        trailing={
          newItem && (
            <button type="button" className="ui-bar-button" aria-label={newItem.label} onClick={openNew}>
              <PlusIcon />
            </button>
          )
        }
      >
        {before}
        {visible.map(
          (section) =>
            section.items.length > 0 && (
              <InsetList key={section.key} header={section.header} footer={section.footer}>
                {section.items.map((item) => (
                  <SwipeRow
                    key={item.id}
                    onCommit={(outcome) => !isDraft(item) && (outcome === 'complete' ? complete(item) : archive(item))}
                  >
                    <ItemRow
                      item={item}
                      {...subtitleFor(item)}
                      pending={isDraft(item)}
                      checked={checked.includes(item.id)}
                      onToggle={() => !isDraft(item) && tick(item)}
                      onOpen={() => openEdit(item)}
                      thumb={photos[item.id]?.[0]?.url}
                      notice={
                        syncNotices &&
                        item.syncError && (
                          <SyncNotice
                            error={item.syncError}
                            pending={retrying === item.id}
                            onRetry={() => retry(item)}
                          />
                        )
                      }
                    />
                  </SwipeRow>
                ))}
              </InsetList>
            ),
        )}
        {isEmpty && emptyText && <p className="app-empty">{emptyText}</p>}
      </LargeTitle>

      <ItemSheet
        open={sheet.open}
        mode={sheet.mode}
        people={people}
        photos={sheet.mode.kind === 'edit' ? photos[sheet.mode.item.id] : undefined}
        reviewMode={reviewMode}
        onClose={closeSheet}
        onCreate={create}
        onSave={save}
        onComplete={(item) => fromSheet(item, complete)}
        onArchive={(item) => fromSheet(item, archive)}
        onDelete={(item) => fromSheet(item, remove)}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
