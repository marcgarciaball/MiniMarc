'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PlusIcon } from '@/components/icons';
import { PersonSheet } from '@/components/items/PersonSheet';
import { LargeTitle } from '@/components/ui';
import type { PersonaCard } from '@/lib/actions/people';
import { dateSummary } from '@/lib/people/format';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Card({ card }: { card: PersonaCard }) {
  const { person, next, notesLine, giftCount, photoCount } = card;
  const meta = [
    giftCount ? plural(giftCount, 'idea de regalo', 'ideas de regalo') : '',
    photoCount ? plural(photoCount, 'foto', 'fotos') : '',
  ].filter(Boolean);
  return (
    <Link href={`/personas/${person.id}`} className="ui-glass app-person-card">
      <span className="app-person-card__name">{person.name}</span>
      {next ? (
        <span className={next.daysUntil === 0 ? 'app-person-card__next app-person-card__next--today' : 'app-person-card__next'}>
          {dateSummary(next)}
        </span>
      ) : (
        <span className="app-person-card__next app-person-card__next--none">Sin fechas</span>
      )}
      {notesLine && <span className="app-person-card__notes">{notesLine}</span>}
      {meta.length > 0 && <span className="app-person-card__meta">{meta.join(' · ')}</span>}
    </Link>
  );
}

/** Personas: one glass card per person, nearest date first, and "+ Persona". */
export function PersonasScreen({ cards }: { cards: PersonaCard[] }) {
  const [open, setOpen] = useState(false);
  return (
    <LargeTitle
      title="Personas"
      trailing={
        <button type="button" className="ui-bar-button" aria-label="Nueva persona" onClick={() => setOpen(true)}>
          <PlusIcon />
        </button>
      }
    >
      {cards.length === 0 ? (
        <p className="app-empty">Añade a alguien para recordar sus fechas y guardar ideas de regalo.</p>
      ) : (
        <ul className="app-person-cards">
          {cards.map((c) => (
            <li key={c.person.id}>
              <Card card={c} />
            </li>
          ))}
        </ul>
      )}
      <PersonSheet open={open} onClose={() => setOpen(false)} />
    </LargeTitle>
  );
}
