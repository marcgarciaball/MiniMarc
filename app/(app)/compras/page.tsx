import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readByType } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Compras' };

export default function ComprasPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Compras" check subtitle={false} />}>
      <Compras />
    </Suspense>
  );
}

async function Compras() {
  const { items, photos, today } = await readByType('compra');
  return (
    <ItemsScreen
      title="Compras"
      today={today}
      sections={[{ key: 'compras', items }]}
      emptyText="No hay nada en la lista de la compra."
      newItem={{ type: 'compra', label: 'Nueva compra' }}
      photos={photos}
    />
  );
}
