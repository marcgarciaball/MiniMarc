'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { addPerson, updatePerson } from '@/app/actions/items';
import { InsetList, Sheet } from '@/components/ui';
import { personFormError } from '@/lib/actions/forms';
import { settle } from '@/lib/actions/result';
import type { Person } from '@/lib/db/types';

export type PersonSheetProps = {
  open: boolean;
  /** Edit this person; omit to add a new one. */
  person?: Person;
  onClose: () => void;
};

const FORM_ID = 'person-sheet-form';

/** Add a person or change their name, birthday and notes. */
export function PersonSheet({ open, person, onClose }: PersonSheetProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Blocks a second submit (double tap, Enter) before `pending` re-renders the button.
  const inFlight = useRef(false);

  // onSubmit, not <form action>: React resets an action form's fields when the action ends,
  // which would wipe the typed text on failure. The fields reset only when the sheet closes.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const fd = new FormData(e.currentTarget);
    const invalid = personFormError(fd);
    if (invalid) return setError(invalid);
    setError(null);
    inFlight.current = true;
    startTransition(async () => {
      const result = await settle(
        () => (person ? updatePerson(person.id, fd) : addPerson(fd)),
        'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.',
      );
      inFlight.current = false;
      startTransition(() => {
        if (result.ok) onClose();
        else setError(result.error);
      });
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={person ? person.name : 'Nueva persona'}
      leading={
        <button type="button" className="ui-bar-button" onClick={onClose}>
          Cancelar
        </button>
      }
      trailing={
        <button type="submit" form={FORM_ID} className="ui-bar-button ui-bar-button--strong" disabled={pending}>
          {person ? 'OK' : 'Añadir'}
        </button>
      }
    >
      <form id={FORM_ID} key={`${person?.id ?? 'new'}-${String(open)}`} onSubmit={handleSubmit} className="app-form">
        <InsetList>
          <input
            className="app-input app-input--title"
            name="name"
            defaultValue={person?.name}
            placeholder="Nombre"
            aria-label="Nombre"
            autoComplete="off"
          />
          <label className="app-field">
            <span>Cumpleaños</span>
            <input className="app-input" type="date" name="birthday" defaultValue={person?.birthday ?? undefined} />
          </label>
        </InsetList>
        <InsetList>
          <textarea
            className="app-input app-input--notes app-input--person-notes"
            name="notes"
            defaultValue={person?.notes ?? undefined}
            placeholder="Notas (gustos, tallas, lo que te contó…)"
            aria-label="Notas"
            rows={4}
          />
        </InsetList>
        {error && (
          <p className="app-form__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
