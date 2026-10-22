import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { PeopleSection } from '@/components/items/PeopleSection';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readRegalos } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Regalos' };

export default function RegalosPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Regalos" check />}>
      <Regalos />
    </Suspense>
  );
}

async function Regalos() {
  const { people, unassigned, photos, today } = await readRegalos();
  return (
    <ItemsScreen
      title="Regalos"
      today={today}
      before={<PeopleSection groups={people.map((g) => ({ person: g.person, count: g.items.length }))} />}
      sections={[{ key: 'sin-persona', header: 'Sin persona', items: unassigned }]}
      people={people.map((g) => g.person)}
      newItem={{ type: 'regalo', label: 'Nuevo regalo' }}
      photos={photos}
    />
  );
}
