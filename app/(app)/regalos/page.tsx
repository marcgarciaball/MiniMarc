import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { PeopleSection } from '@/components/items/PeopleSection';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { listRegalos } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';
import { loadPhotoMap } from '@/lib/photos/server';

export const metadata: Metadata = { title: 'Regalos' };

export default function RegalosPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Regalos" />}>
      <Regalos />
    </Suspense>
  );
}

async function Regalos() {
  const { people, unassigned } = await listRegalos(await getDeps());
  const photos = await loadPhotoMap(unassigned);
  return (
    <ItemsScreen
      title="Regalos"
      today={madridToday()}
      before={<PeopleSection groups={people.map((g) => ({ person: g.person, count: g.items.length }))} />}
      sections={[{ key: 'sin-persona', header: 'Sin persona', items: unassigned }]}
      people={people.map((g) => g.person)}
      newItem={{ type: 'regalo', label: 'Nuevo regalo' }}
      photos={photos}
    />
  );
}
