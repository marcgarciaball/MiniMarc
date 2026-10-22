import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AreaSelector } from '@/components/items/AreaSelector';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readSinClasificar } from '@/lib/cache/reads';
import type { Area } from '@/lib/db/types';

export const metadata: Metadata = { title: 'Sin clasificar' };

type SearchParams = Promise<{ area?: string | string[] }>;

export default function SinClasificarPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenFallback title="Sin clasificar" />}>
      <SinClasificar searchParams={searchParams} />
    </Suspense>
  );
}

async function SinClasificar({ searchParams }: { searchParams: SearchParams }) {
  // Personal and Trabajo are separate views, as on /tareas: they never share a list.
  const area: Area = (await searchParams).area === 'trabajo' ? 'trabajo' : 'personal';
  const { items, people, photos, today } = await readSinClasificar(area);
  return (
    <ItemsScreen
      key={area}
      title="Sin clasificar"
      today={today}
      before={<AreaSelector area={area} basePath="/sin-clasificar" />}
      sections={[
        {
          key: area,
          items,
          footer: 'Toca un elemento para revisarlo y moverlo a su lista.',
        },
      ]}
      emptyText={area === 'trabajo' ? 'No hay nada de trabajo sin clasificar.' : 'Todo lo personal está clasificado.'}
      people={people}
      reviewMode
      photos={photos}
    />
  );
}
