import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { listByType } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';

export const metadata: Metadata = { title: 'Compras' };

export default function ComprasPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Compras" />}>
      <Compras />
    </Suspense>
  );
}

async function Compras() {
  const items = await listByType(await getDeps(), 'compra');
  return (
    <ItemsScreen
      title="Compras"
      today={madridToday()}
      sections={[{ key: 'compras', items }]}
      emptyText="No hay nada en la lista de la compra."
      newItem={{ type: 'compra', label: 'Nueva compra' }}
    />
  );
}
