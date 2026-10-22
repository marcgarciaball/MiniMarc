import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ChevronLeftIcon } from '@/components/icons';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { PersonDetail, type PersonDetailProps } from '@/components/people/PersonDetail';
import { listRegalos } from '@/lib/actions/items';
import { NEXT_DATE_WINDOW_DAYS } from '@/lib/actions/people';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';
import { loadPhotoMap } from '@/lib/photos/server';

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
    <Suspense fallback={<ScreenFallback title="" leading={back} />}>
      <Persona params={params} />
    </Suspense>
  );
}

/** A person: notes, dates (birthday included) and their gift ideas (also reached from /regalos/[id]). */
async function Persona({ params }: { params: Params }) {
  const { id } = await params;
  const deps = await getDeps();
  const today = madridToday();
  const [{ people }, dates, upcoming] = await Promise.all([
    listRegalos(deps),
    deps.people.listDates(id),
    deps.people.upcomingDates(today, NEXT_DATE_WINDOW_DAYS),
  ]);
  const group = people.find((g) => g.person.id === id);
  if (!group) notFound();
  const { person, items } = group;
  const next: PersonDetailProps['next'] = {};
  for (const u of upcoming) {
    if (u.person.id !== id) continue;
    const key = u.dateId ?? 'birthday';
    next[key] ??= { daysUntil: u.daysUntil, yearsSince: u.yearsSince };
  }
  const photos = await loadPhotoMap(items);
  return (
    <ItemsScreen
      key={person.id}
      title={person.name}
      leading={back}
      today={today}
      before={<PersonDetail person={person} dates={dates} next={next} />}
      sections={[{ key: 'regalos', header: 'Ideas de regalo', items }]}
      emptyText={`Sin ideas de regalo para ${person.name}.`}
      people={people.map((g) => g.person)}
      hidePerson
      photos={photos}
      newItem={{ type: 'regalo', personId: person.id, label: 'Nuevo regalo' }}
    />
  );
}
