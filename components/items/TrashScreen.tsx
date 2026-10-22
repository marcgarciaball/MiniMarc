'use client';

import Link from 'next/link';
import { LinkText } from '@/components/links/LinkText';
import { useOptimistic, useRef, useState, useTransition } from 'react';
import { undoDelete } from '@/app/actions/items';
import { ChevronLeftIcon } from '@/components/icons';
import { InsetList, LargeTitle, Toast, type ToastProps } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import type { Item, Person } from '@/lib/db/types';
import { destinationLabel, formatDay } from '@/lib/format';
import { madridDateTime } from '@/lib/time';

export type TrashScreenProps = {
  /** Madrid "YYYY-MM-DD", from the server. */
  today: string;
  items: Item[];
  people: Person[];
};

type ToastState = NonNullable<ToastProps['toast']>;

const OFFLINE = 'No se ha podido restaurar. Revisa la conexión e inténtalo de nuevo.';

/** "Eliminado hoy", "Eliminado ayer", "Eliminado el 2 de octubre". */
function deletedLabel(item: Item, today: string): string {
  const day = formatDay(madridDateTime(new Date(item.deletedAt!)).date, today);
  return day === 'Hoy' || day === 'Ayer' ? `Eliminado ${day.toLowerCase()}` : `Eliminado el ${day}`;
}

/**
 * Papelera: what was deleted in the last 30 days, with "Restaurar". There is no permanent
 * delete here: the hourly job purges items deleted more than 30 days ago.
 */
export function TrashScreen({ today, items, people }: TrashScreenProps) {
  const [, startTransition] = useTransition();
  const [restored, markRestored] = useOptimistic<string[], string>([], (ids, id) => [...ids, id]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);

  const names = new Map(people.map((p) => [p.id, p.name]));
  const visible = items.filter((i) => !restored.includes(i.id));
  const where = (item: Item) => destinationLabel(item, item.personId ? names.get(item.personId) : undefined);

  function showToast(message: string) {
    toastId.current += 1;
    setToast({ id: toastId.current, message });
  }

  function restore(item: Item) {
    startTransition(async () => {
      markRestored(item.id);
      const result = await settle(() => undoDelete(item.id), OFFLINE);
      showToast(result.ok ? `Restaurado en ${where(item)}` : result.error);
    });
  }

  return (
    <>
      <LargeTitle
        title="Papelera"
        leading={
          <Link href="/bandeja" className="ui-bar-button app-back">
            <ChevronLeftIcon />
            Recién añadido
          </Link>
        }
      >
        {visible.length > 0 && (
          <InsetList footer="Lo eliminado se borra para siempre a los 30 días.">
            {visible.map((item) => (
              <div key={item.id} className="ui-row">
                <span className="ui-row__body">
                  <span className="ui-row__text">
                    <span className="ui-row__title">
                      <LinkText text={item.title} />
                    </span>
                    <span className="ui-row__subtitle">
                      {where(item)} · {deletedLabel(item, today)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="ui-bar-button"
                    aria-label={`Restaurar «${item.title}»`}
                    onClick={() => restore(item)}
                  >
                    Restaurar
                  </button>
                </span>
              </div>
            ))}
          </InsetList>
        )}
        {visible.length === 0 && <p className="app-empty">La papelera está vacía.</p>}
      </LargeTitle>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
