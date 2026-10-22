'use client';

import { useOptimistic, useRef, useState, useTransition, type ReactNode } from 'react';
import { addItem, deleteItem, moveItem, retrySync, toggleDone, undoDelete } from '@/app/actions/items';
import { PlusIcon } from '@/components/icons';
import { InsetList, LargeTitle, Toast, type ToastProps } from '@/components/ui';
import type { MovePatch } from '@/lib/actions/items';
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
  const [removed, removeOptimistic] = useOptimistic<string[], string>([], (ids, id) => [...ids, id]);
  const [checked, setChecked] = useState<string[]>([]);
  const [sheet, setSheet] = useState<{ open: boolean; mode: SheetMode }>({
    open: false,
    mode: { kind: 'new', defaults: newItem ?? { type: 'tarea', label: '' } },
  });
  const [toast, setToast] = useState<ToastState | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const toastId = useRef(0);

  const peopleById = new Map(people.map((p) => [p.id, p.name]));
  const visible = sections.map((s) => ({ ...s, items: s.items.filter((i) => !removed.includes(i.id)) }));
  const isEmpty = visible.every((s) => s.items.length === 0);

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

  /** Removes the row at once, runs the action, offers Undo. The row comes back by itself if the action fails. */
  function removeWith(
    item: Item,
    action: () => Promise<ActionResult<unknown>>,
    message: string,
    undo: () => Promise<ActionResult<unknown>>,
  ) {
    startTransition(async () => {
      removeOptimistic(item.id);
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
    setSheet({ open: true, mode: { kind: 'edit', item } });
  }

  function fromSheet(item: Item, then: (item: Item) => void) {
    closeSheet();
    then(item);
  }

  // The sheet keeps the typed text, shows the error and closes itself only on success.
  const create = (fd: FormData) => settle(() => addItem(fd), OFFLINE);
  const save = (item: Item, patch: MovePatch) => settle(() => moveItem(item.id, patch), OFFLINE);

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
                    onCommit={(outcome) => (outcome === 'complete' ? complete(item) : archive(item))}
                  >
                    <ItemRow
                      item={item}
                      {...subtitleFor(item)}
                      checked={checked.includes(item.id)}
                      onToggle={() => tick(item)}
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
