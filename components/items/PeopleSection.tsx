'use client';

import { useState } from 'react';
import { PlusIcon } from '@/components/icons';
import { InsetList, Row } from '@/components/ui';
import type { Person } from '@/lib/db/types';
import { formatBirthday } from '@/lib/format';
import { PersonSheet } from './PersonSheet';

export type PeopleSectionProps = { groups: { person: Person; count: number }[] };

/** Regalos: one row per person (birthday and number of gift ideas) plus "Añadir persona". */
export function PeopleSection({ groups }: PeopleSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <InsetList header="Personas" footer={groups.length ? undefined : 'Añade a alguien para guardar ideas de regalo y recordar su cumpleaños.'}>
        {groups.map(({ person, count }) => (
          <Row
            key={person.id}
            href={`/regalos/${person.id}`}
            title={person.name}
            subtitle={person.birthday ? `Cumple el ${formatBirthday(person.birthday)}` : undefined}
            detail={count ? String(count) : undefined}
          />
        ))}
        <Row
          leading={
            <span className="app-add-icon">
              <PlusIcon />
            </span>
          }
          title="Añadir persona"
          onClick={() => setOpen(true)}
        />
      </InsetList>
      <PersonSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
