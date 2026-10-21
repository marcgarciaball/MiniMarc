import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { listSinClasificar } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';

export const metadata: Metadata = { title: 'Sin clasificar' };

export default function SinClasificarPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Sin clasificar" />}>
      <SinClasificar />
    </Suspense>
  );
}

async function SinClasificar() {
  const deps = await getDeps();
  const [items, people] = await Promise.all([listSinClasificar(deps), deps.people.listPeople()]);
  return (
    <ItemsScreen
      title="Sin clasificar"
      today={madridToday()}
      sections={[
        {
          key: 'sin-clasificar',
          items,
          footer: 'Toca un elemento para revisarlo y moverlo a su lista.',
        },
      ]}
      emptyText="Todo está clasificado."
      people={people}
      reviewMode
    />
  );
}
