import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { listByType } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';
import { loadPhotoMap } from '@/lib/photos/server';

export const metadata: Metadata = { title: 'Ideas' };

export default function IdeasPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Ideas" />}>
      <Ideas />
    </Suspense>
  );
}

async function Ideas() {
  const items = await listByType(await getDeps(), 'idea');
  const photos = await loadPhotoMap(items);
  return (
    <ItemsScreen
      title="Ideas"
      today={madridToday()}
      sections={[{ key: 'ideas', items }]}
      emptyText="Aún no hay ideas."
      newItem={{ type: 'idea', label: 'Nueva idea' }}
      photos={photos}
    />
  );
}
