import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ChevronLeftIcon } from '@/components/icons';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { PersonCard } from '@/components/items/PersonCard';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { listRegalos } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';
import { loadPhotoMap } from '@/lib/photos/server';

export const metadata: Metadata = { title: 'Regalos' };

type Params = Promise<{ personId: string }>;

const back = (
  <Link href="/regalos" className="ui-bar-button app-back">
    <ChevronLeftIcon />
    Regalos
  </Link>
);

export default function PersonPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ScreenFallback title="" leading={back} />}>
      <Person params={params} />
    </Suspense>
  );
}

async function Person({ params }: { params: Params }) {
  const { personId } = await params;
  const { people } = await listRegalos(await getDeps());
  const group = people.find((g) => g.person.id === personId);
  if (!group) notFound();
  const { person, items } = group;
  const photos = await loadPhotoMap(items);
  return (
    <ItemsScreen
      key={person.id}
      title={person.name}
      leading={back}
      today={madridToday()}
      before={<PersonCard person={person} />}
      sections={[{ key: 'regalos', header: 'Ideas de regalo', items }]}
      emptyText={`Sin ideas de regalo para ${person.name}.`}
      people={people.map((g) => g.person)}
      hidePerson
      photos={photos}
      newItem={{ type: 'regalo', personId: person.id, label: 'Nuevo regalo' }}
    />
  );
}
