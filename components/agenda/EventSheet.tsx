'use client';

import Link from 'next/link';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { addEvent } from '@/app/actions/events';
import { InsetList, Sheet } from '@/components/ui';
import type { EventActionResult } from '@/lib/actions/events';
import { RECONNECT_HREF } from '@/lib/nav';

const FORM_ID = 'event-sheet-form';

/** The server action call itself failed (no connection, server down). */
const OFFLINE = 'No se ha podido guardar la cita. Revisa la conexión e inténtalo de nuevo.';

export type EventSheetProps = {
  open: boolean;
  /** Madrid "YYYY-MM-DD" the date field starts on (the day shown in the Agenda). */
  date: string;
  onClose: () => void;
};

/** "Nueva cita": title, date, start, optional end and notes. Goes to the primary calendar with 3 h and 1 h popups. */
export function EventSheet({ open, date, onClose }: EventSheetProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Extract<EventActionResult, { ok: false }> | null>(null);
  // Blocks a second submit (double tap, Enter) before `pending` re-renders the button.
  const inFlight = useRef(false);

  function close() {
    setError(null);
    onClose();
  }

  // onSubmit, not <form action>: React would reset the fields when the action ends,
  // wiping what Marc typed on failure.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get('title') ?? '').trim()) return setError({ ok: false, error: 'Escribe un título.' });
    setError(null);
    inFlight.current = true;
    startTransition(async () => {
      let result: EventActionResult;
      try {
        result = await addEvent(fd);
      } catch {
        result = { ok: false, error: OFFLINE };
      }
      inFlight.current = false;
      startTransition(() => {
        if (result.ok) close();
        else setError(result);
      });
    });
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Nueva cita"
      leading={
        <button type="button" className="ui-bar-button" onClick={close}>
          Cancelar
        </button>
      }
      trailing={
        <button type="submit" form={FORM_ID} className="ui-bar-button ui-bar-button--strong" disabled={pending}>
          Añadir
        </button>
      }
    >
      {/* Fresh fields each time the sheet opens after a success; on failure they stay as typed. */}
      <form key={`new-${String(open)}-${date}`} id={FORM_ID} onSubmit={handleSubmit} className="app-form">
        <InsetList>
          <input
            className="app-input app-input--title"
            name="title"
            placeholder="Título"
            aria-label="Título"
            autoComplete="off"
            enterKeyHint="done"
          />
          <textarea className="app-input app-input--notes" name="notes" placeholder="Notas" aria-label="Notas" rows={2} />
        </InsetList>
        <InsetList footer="Avisa 3 horas y 1 hora antes.">
          <label className="app-field">
            <span>Fecha</span>
            <input className="app-input" type="date" name="date" defaultValue={date} required />
          </label>
          <label className="app-field">
            <span>Empieza</span>
            <input className="app-input" type="time" name="start" required />
          </label>
          <label className="app-field">
            <span>Termina</span>
            <input className="app-input" type="time" name="end" />
          </label>
        </InsetList>
        {error && (
          <p className="app-form__error" role="alert">
            {error.error}
            {error.code === 'calendar_auth' && (
              <>
                {' '}
                <Link href={RECONNECT_HREF} className="app-form__error-action">
                  Volver a entrar con Google
                </Link>
              </>
            )}
          </p>
        )}
      </form>
    </Sheet>
  );
}
