import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AreaSelector } from '@/components/items/AreaSelector';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readTareas } from '@/lib/cache/reads';
import type { Area } from '@/lib/db/types';

export const metadata: Metadata = { title: 'Tareas' };

type SearchParams = Promise<{ area?: string | string[] }>;

export default function TareasPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenFallback title="Tareas" segmented check detail />}>
      <Tareas searchParams={searchParams} />
    </Suspense>
  );
}

async function Tareas({ searchParams }: { searchParams: SearchParams }) {
  const area: Area = (await searchParams).area === 'trabajo' ? 'trabajo' : 'personal';
  const { items, photos, today } = await readTareas(area);
  return (
    <ItemsScreen
      // A fresh screen per area: the two lists never share state.
      key={area}
      title="Tareas"
      today={today}
      before={<AreaSelector area={area} />}
      sections={[{ key: area, items }]}
      syncNotices
      photos={photos}
      emptyText={area === 'trabajo' ? 'No hay tareas de trabajo pendientes.' : 'No hay tareas personales pendientes.'}
      newItem={{ type: 'tarea', area, label: area === 'trabajo' ? 'Nueva tarea de trabajo' : 'Nueva tarea' }}
    />
  );
}
