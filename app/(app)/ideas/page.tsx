import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readByType } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Ideas' };

export default function IdeasPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Ideas" />}>
      <Ideas />
    </Suspense>
  );
}

async function Ideas() {
  const { items, photos, today } = await readByType('idea');
  return (
    <ItemsScreen
      title="Ideas"
      today={today}
      sections={[{ key: 'ideas', items }]}
      emptyText="Aún no hay ideas."
      newItem={{ type: 'idea', label: 'Nueva idea' }}
      photos={photos}
    />
  );
}
