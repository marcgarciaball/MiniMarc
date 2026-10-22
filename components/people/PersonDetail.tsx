'use client';

import { useState } from 'react';
import { PlusIcon } from '@/components/icons';
import { PersonSheet } from '@/components/items/PersonSheet';
import { InsetList, Row } from '@/components/ui';
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
        <button type="button" className="ui-row app-person-notes" onClick={() => setPersonOpen(true)}>
          <span className={person.notes ? 'app-person-notes__text' : 'app-person-notes__text app-person-notes__text--empty'}>
            {person.notes || 'Añadir notas'}
          </span>
        </button>
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
