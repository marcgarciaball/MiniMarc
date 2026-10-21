'use client';

import { useState, useTransition } from 'react';
import { addPerson, updatePerson } from '@/app/actions/items';
import { InsetList, Sheet } from '@/components/ui';
import type { Person } from '@/lib/db/types';

export type PersonSheetProps = {
  open: boolean;
  /** Edit this person; omit to add a new one. */
  person?: Person;
  onClose: () => void;
};

const FORM_ID = 'person-sheet-form';

/** Add a person or change their name and birthday. */
export function PersonSheet({ open, person, onClose }: PersonSheetProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    if (!String(fd.get('name') ?? '').trim()) {
      setError('Escribe un nombre.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await (person ? updatePerson(person.id, fd) : addPerson(fd));
        onClose();
      } catch {
        setError('No se ha podido guardar. Revisa los datos e inténtalo de nuevo.');
      }
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
      <form id={FORM_ID} key={`${person?.id ?? 'new'}-${String(open)}`} action={submit} className="app-form">
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
        {person && <input type="hidden" name="notes" value={person.notes ?? ''} />}
        {error && (
          <p className="app-form__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
