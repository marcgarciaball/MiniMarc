import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { listByType } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';

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
  return (
    <ItemsScreen
      title="Ideas"
      today={madridToday()}
      sections={[{ key: 'ideas', items }]}
      emptyText="Aún no hay ideas."
      newItem={{ type: 'idea', label: 'Nueva idea' }}
    />
  );
}
