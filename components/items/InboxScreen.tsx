'use client';

import Link from 'next/link';
import { useOptimistic, useRef, useState, useTransition } from 'react';
import { deleteItem, moveItem, undoDelete } from '@/app/actions/items';
import { InsetList, LargeTitle, Toast, type ToastProps } from '@/components/ui';
import type { MovePatch } from '@/lib/actions/items';
import { settle, type ActionResult } from '@/lib/actions/result';
import type { Item, ItemStatus, Person } from '@/lib/db/types';
import { destinationLabel, formatDay } from '@/lib/format';
import { madridDateTime } from '@/lib/time';
import { ItemSheet, type SheetMode } from './ItemSheet';

export type InboxScreenProps = {
  /** Madrid "YYYY-MM-DD", from the server. */
  today: string;
  personal: Item[];
  trabajo: Item[];
  people: Person[];
};

type ToastState = NonNullable<ToastProps['toast']>;

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

const STATUS_LABELS: Partial<Record<ItemStatus, string>> = { hecho: 'Hecho', archivado: 'Archivado' };

/** "09:41" today, "Ayer 21:30" otherwise. */
function createdLabel(item: Item, today: string): string {
  const { date, time } = madridDateTime(new Date(item.createdAt));
  return date === today ? time : `${formatDay(date, today)} ${time}`;
}

/**
 * Bandeja "Recién añadido": what came in during the last 24 h, Personal and Trabajo apart.
 * Each row says where the item went; "Mover" opens the usual edit sheet to correct it.
 * Rows stay after completing or archiving (this is a log of arrivals); deleting hides the row
 * and offers "Deshacer".
 */
export function InboxScreen({ today, personal, trabajo, people }: InboxScreenProps) {
  const [, startTransition] = useTransition();
  const [removed, removeOptimistic] = useOptimistic<string[], string>([], (ids, id) => [...ids, id]);
  const [sheet, setSheet] = useState<{ open: boolean; item: Item | null }>({ open: false, item: null });
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);

  const names = new Map(people.map((p) => [p.id, p.name]));
  const sections = [
    { key: 'personal', header: 'Personal', items: personal.filter((i) => !removed.includes(i.id)) },
    { key: 'trabajo', header: 'Trabajo', items: trabajo.filter((i) => !removed.includes(i.id)) },
  ];
  const isEmpty = sections.every((s) => s.items.length === 0);

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

  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));

  /** Sets the status (idempotent, unlike a toggle) and offers to put the previous one back. */
  function setStatus(item: Item, status: ItemStatus, message: string) {
    closeSheet();
    startTransition(async () => {
      if (await run(() => moveItem(item.id, { status }))) {
        showToast(message, () => moveItem(item.id, { status: item.status }));
      }
    });
  }

  function remove(item: Item) {
    closeSheet();
    startTransition(async () => {
      removeOptimistic(item.id);
      if (await run(() => deleteItem(item.id))) showToast('Eliminado', () => undoDelete(item.id));
    });
  }

  function subtitle(item: Item): string {
    const where = destinationLabel(item, item.personId ? names.get(item.personId) : undefined);
    const status = STATUS_LABELS[item.status];
    return status ? `${where} · ${status}` : where;
  }

  // Only edit mode is ever opened here; the 'new' placeholder just keeps the closed sheet mounted.
  const mode: SheetMode = sheet.item ? { kind: 'edit', item: sheet.item } : { kind: 'new', defaults: { type: 'tarea', label: '' } };

  return (
    <>
      <LargeTitle
        title="Recién añadido"
        trailing={
          <Link href="/bandeja/papelera" className="ui-bar-button">
            Papelera
          </Link>
        }
      >
        {sections.map(
          (section) =>
            section.items.length > 0 && (
              <InsetList key={section.key} header={section.header}>
                {section.items.map((item) => (
                  <div key={item.id} className="ui-row app-item app-inbox-row">
                    <button
                      type="button"
                      className="ui-row__body app-item__body"
                      onClick={() => setSheet({ open: true, item })}
                    >
                      <span className="ui-row__text">
                        <span className="ui-row__title">{item.title}</span>
                        <span className="ui-row__subtitle">{subtitle(item)}</span>
                      </span>
                      <span className="ui-row__detail">{createdLabel(item, today)}</span>
                    </button>
                    <button
                      type="button"
                      className="ui-bar-button app-inbox-row__move"
                      aria-label={`Mover «${item.title}»`}
                      onClick={() => setSheet({ open: true, item })}
                    >
                      Mover
                    </button>
                  </div>
                ))}
              </InsetList>
            ),
        )}
        {isEmpty && <p className="app-empty">No has capturado nada en las últimas 24 horas.</p>}
      </LargeTitle>

      <ItemSheet
        open={sheet.open}
        mode={mode}
        people={people}
        // An unclassified item is filed by saving it, as in Sin clasificar.
        reviewMode={sheet.item?.needsReview}
        onClose={closeSheet}
        onCreate={async () => ({ ok: false, error: OFFLINE })}
        onSave={(item: Item, patch: MovePatch) => settle(() => moveItem(item.id, patch), OFFLINE)}
        onComplete={(item) => setStatus(item, 'hecho', 'Marcado como hecho')}
        onArchive={(item) => setStatus(item, 'archivado', 'Archivado')}
        onDelete={remove}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
