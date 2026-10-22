import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { TrashScreen } from '@/components/items/TrashScreen';
import { readPapelera } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Papelera' };

export default function PapeleraPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Papelera" />}>
      <Papelera />
    </Suspense>
  );
}

async function Papelera() {
  const { items, people, today } = await readPapelera();
  return <TrashScreen today={today} items={items} people={people} />;
}
