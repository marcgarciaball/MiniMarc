'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { PlusIcon } from '@/components/icons';
import { deletePerson } from '@/app/actions/people';
import { PersonSheet } from '@/components/items/PersonSheet';
import { LinkText } from '@/components/links/LinkText';
import { InsetList, Row } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import type { UpcomingDate } from '@/lib/db/people';
import type { Person, PersonDate } from '@/lib/db/types';
import { formatBirthday } from '@/lib/format';
import { countdown, formatPersonDate, yearsText } from '@/lib/people/format';
import { DateSheet } from './DateSheet';

export type PersonDetailProps = {
  person: Person;
  dates: PersonDate[];
  /** Next occurrence of the birthday ('birthday') and of each date (its id), from the server. */
  next: Record<string, Pick<UpcomingDate, 'daysUntil' | 'yearsSince'>>;
};

/** "en 12 días · 5 años" for the row's right side. */
function nextText(n: Pick<UpcomingDate, 'daysUntil' | 'yearsSince'> | undefined): string | undefined {
  if (!n) return undefined;
  const when = countdown(n.daysUntil);
  return [when.charAt(0).toUpperCase() + when.slice(1), yearsText(n.yearsSince)].filter(Boolean).join(' · ');
}

/** A person's page header: notes (tap to edit name, birthday and notes) and their dates. */
export function PersonDetail({ person, dates, next }: PersonDetailProps) {
  const [personOpen, setPersonOpen] = useState(false);
  const [dateSheet, setDateSheet] = useState<{ open: boolean; date?: PersonDate }>({ open: false });

  return (
    <>
      <InsetList header="Notas">
        <div className="ui-row app-person-notes app-press">
          <button
            type="button"
            className="app-press__hit"
            aria-label={person.notes ? 'Editar notas' : 'Añadir notas'}
            onClick={() => setPersonOpen(true)}
          />
          <span className={person.notes ? 'app-person-notes__text' : 'app-person-notes__text app-person-notes__text--empty'}>
            {person.notes ? <LinkText text={person.notes} /> : 'Añadir notas'}
          </span>
        </div>
      </InsetList>

      <InsetList header="Fechas">
        <Row
          title="Cumpleaños"
          subtitle={person.birthday ? formatBirthday(person.birthday) : undefined}
          detail={person.birthday ? nextText(next.birthday) : 'Añadir'}
          chevron
          onClick={() => setPersonOpen(true)}
        />
        {dates.map((d) => (
          <Row
            key={d.id}
            title={d.label}
            subtitle={[formatPersonDate(d.date), d.yearly ? null : 'una vez'].filter(Boolean).join(' · ')}
            detail={nextText(next[d.id])}
            chevron
            onClick={() => setDateSheet({ open: true, date: d })}
          />
        ))}
        <Row
          leading={
            <span className="app-add-icon">
              <PlusIcon />
            </span>
          }
          title="Añadir fecha"
          onClick={() => setDateSheet({ open: true })}
        />
      </InsetList>

      <DeletePerson person={person} />

      <PersonSheet open={personOpen} person={person} onClose={() => setPersonOpen(false)} />
      <DateSheet
        open={dateSheet.open}
        personId={person.id}
        date={dateSheet.date}
        onClose={() => setDateSheet((s) => ({ ...s, open: false }))}
      />
    </>
  );
}

const OFFLINE = 'No se ha podido borrar. Revisa la conexión e inténtalo de nuevo.';

/**
 * Borrar la persona: se lleva sus fechas, y sus ideas de regalo a la papelera. Pide confirmación
 * en el sitio (dos toques) en vez de un diálogo del navegador, que aquí desentonaría.
 */
function DeletePerson({ person }: { person: Person }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      const result = await settle(() => deletePerson(person.id), OFFLINE);
      inFlight.current = false;
      if (result.ok) {
        router.push('/personas');
        return;
      }
      startTransition(() => {
        setAsking(false);
        setError(result.error);
      });
    });
  }

  return (
    <>
      <InsetList>
        {asking ? (
          <>
            <button type="button" className="ui-row app-action app-action--destructive" disabled={pending} onClick={remove}>
              {pending ? 'Borrando…' : `Sí, borrar a ${person.name} y todo lo suyo`}
            </button>
            <button type="button" className="ui-row app-action" disabled={pending} onClick={() => setAsking(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className="ui-row app-action app-action--destructive" onClick={() => setAsking(true)}>
            Eliminar persona
          </button>
        )}
      </InsetList>
      {asking && !error && (
        <p className="app-form__warning" role="status">
          Se borrarán sus fechas. Sus ideas de regalo van a la papelera, donde las puedes recuperar 30 días.
        </p>
      )}
      {error && (
        <p className="app-form__error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
