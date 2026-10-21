import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AreaSelector } from '@/components/items/AreaSelector';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { listTareas } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';
import type { Area } from '@/lib/db/types';

export const metadata: Metadata = { title: 'Tareas' };

type SearchParams = Promise<{ area?: string | string[] }>;

export default function TareasPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenFallback title="Tareas" />}>
      <Tareas searchParams={searchParams} />
    </Suspense>
  );
}

async function Tareas({ searchParams }: { searchParams: SearchParams }) {
  const area: Area = (await searchParams).area === 'trabajo' ? 'trabajo' : 'personal';
  const deps = await getDeps();
  const items = await listTareas(deps, area);
  return (
    <ItemsScreen
      // A fresh screen per area: the two lists never share state.
      key={area}
      title="Tareas"
      today={madridToday()}
      before={<AreaSelector area={area} />}
      sections={[{ key: area, items }]}
      syncNotices
      emptyText={area === 'trabajo' ? 'No hay tareas de trabajo pendientes.' : 'No hay tareas personales pendientes.'}
      newItem={{ type: 'tarea', area, label: area === 'trabajo' ? 'Nueva tarea de trabajo' : 'Nueva tarea' }}
    />
  );
}
