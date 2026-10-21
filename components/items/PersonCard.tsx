'use client';

import { useState } from 'react';
import { InsetList, Row } from '@/components/ui';
import type { Person } from '@/lib/db/types';
import { formatBirthday } from '@/lib/format';
import { PersonSheet } from './PersonSheet';

/** Person page header: birthday (tap to edit name and birthday). */
export function PersonCard({ person }: { person: Person }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <InsetList>
        <Row
          title="Cumpleaños"
          detail={person.birthday ? formatBirthday(person.birthday) : 'Añadir'}
          chevron
          onClick={() => setOpen(true)}
        />
      </InsetList>
      <PersonSheet open={open} person={person} onClose={() => setOpen(false)} />
    </>
  );
}
