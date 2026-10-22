'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { addPersonDate, deletePersonDate, updatePersonDate } from '@/app/actions/people';
import { InsetList, Sheet, Switch } from '@/components/ui';
import { dateFormError } from '@/lib/actions/forms';
import { settle, type ActionResult } from '@/lib/actions/result';
import type { PersonDate } from '@/lib/db/types';
import { DATE_LABEL_SUGGESTIONS } from '@/lib/people/format';

export type DateSheetProps = {
  open: boolean;
  personId: string;
  /** Edit this date; omit to add a new one. */
  date?: PersonDate;
  onClose: () => void;
};

const FORM_ID = 'date-sheet-form';
const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
const OTHER = 'Otro';

/** Add or edit a special date: label (suggestions or your own), date, every year, notes. */
export function DateSheet({ open, personId, date, onClose }: DateSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={date ? date.label : 'Nueva fecha'}
      leading={
        <button type="button" className="ui-bar-button" onClick={onClose}>
          Cancelar
        </button>
      }
      trailing={
        <button type="submit" form={FORM_ID} className="ui-bar-button ui-bar-button--strong">
          {date ? 'OK' : 'Añadir'}
        </button>
      }
    >
      {/* Keyed so the fields start fresh every time the sheet opens. */}
      <DateForm key={`${date?.id ?? 'new'}-${String(open)}`} personId={personId} date={date} onDone={onClose} />
    </Sheet>
  );
}

function DateForm({ personId, date, onDone }: { personId: string; date?: PersonDate; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState(date?.label ?? DATE_LABEL_SUGGESTIONS[0]);
  const [yearly, setYearly] = useState(date?.yearly ?? true);
  const labelRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const suggested = (DATE_LABEL_SUGGESTIONS as readonly string[]).includes(label);

  function send(call: () => Promise<ActionResult<unknown>>) {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      const result = await settle(call, OFFLINE);
      inFlight.current = false;
      startTransition(() => {
        if (result.ok) onDone();
        else setError(result.error);
      });
    });
  }

  // onSubmit, not <form action>: an action form resets its fields, wiping the text on failure.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const invalid = dateFormError(fd);
    if (invalid) return setError(invalid);
    setError(null);
    send(() => (date ? updatePersonDate(date.id, fd) : addPersonDate(personId, fd)));
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} className="app-form" aria-busy={pending}>
      <div role="radiogroup" aria-label="Tipo de fecha" className="app-date-chips">
        {[...DATE_LABEL_SUGGESTIONS, OTHER].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={s === OTHER ? !suggested : label === s}
            className="app-date-chip"
            onClick={() => {
              if (s === OTHER) {
                setLabel('');
                labelRef.current?.focus();
              } else setLabel(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <InsetList>
        <input
          ref={labelRef}
          className="app-input app-input--title"
          name="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Etiqueta"
          aria-label="Etiqueta"
          autoComplete="off"
        />
        <label className="app-field">
          <span>Fecha</span>
          <input className="app-input" type="date" name="date" defaultValue={date?.date} />
        </label>
        <div className="app-field app-field--switch">
          <span>Cada año</span>
          <Switch label="Cada año" checked={yearly} onChange={setYearly} />
          <input type="hidden" name="yearly" value={String(yearly)} />
        </div>
      </InsetList>
      <InsetList>
        <textarea
          className="app-input app-input--notes"
          name="notes"
          defaultValue={date?.notes ?? undefined}
          placeholder="Notas"
          aria-label="Notas"
          rows={3}
        />
      </InsetList>
      {error && (
        <p className="app-form__error" role="alert">
          {error}
        </p>
      )}
      {date && (
        <InsetList>
          <button
            type="button"
            className="ui-row app-action app-action--destructive"
            disabled={pending}
            onClick={() => send(() => deletePersonDate(date.id))}
          >
            Eliminar fecha
          </button>
        </InsetList>
      )}
    </form>
  );
}
