import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ChevronLeftIcon } from '@/components/icons';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { PersonDetail, type PersonDetailProps } from '@/components/people/PersonDetail';
import { readPersona } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Personas' };

type Params = Promise<{ id: string }>;

const back = (
  <Link href="/personas" className="ui-bar-button app-back">
    <ChevronLeftIcon />
    Personas
  </Link>
);

export default function PersonaPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ScreenFallback title="" leading={back} rows={4} check />}>
      <Persona params={params} />
    </Suspense>
  );
}

/** A person: notes, dates (birthday included) and their gift ideas (also reached from /regalos/[id]). */
async function Persona({ params }: { params: Params }) {
  const { id } = await params;
  const data = await readPersona(id);
  if (!data) notFound();
  const { group, people, dates, upcoming, photos, today } = data;
  const { person, items } = group;
  const next: PersonDetailProps['next'] = {};
  for (const u of upcoming) {
    const key = u.dateId ?? 'birthday';
    next[key] ??= { daysUntil: u.daysUntil, yearsSince: u.yearsSince };
  }
  return (
    <ItemsScreen
      key={person.id}
      title={person.name}
      leading={back}
      today={today}
      before={<PersonDetail person={person} dates={dates} next={next} />}
      sections={[{ key: 'regalos', header: 'Ideas de regalo', items }]}
      emptyText={`Sin ideas de regalo para ${person.name}.`}
      people={people}
      hidePerson
      photos={photos}
      newItem={{ type: 'regalo', personId: person.id, label: 'Nuevo regalo' }}
    />
  );
}
