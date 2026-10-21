import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { TrashScreen } from '@/components/items/TrashScreen';
import { listPapelera } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';

export const metadata: Metadata = { title: 'Papelera' };

export default function PapeleraPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Papelera" />}>
      <Papelera />
    </Suspense>
  );
}

async function Papelera() {
  const deps = await getDeps();
  const [items, people] = await Promise.all([listPapelera(deps), deps.people.listPeople()]);
  return <TrashScreen today={madridToday()} items={items} people={people} />;
}
