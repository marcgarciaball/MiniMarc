import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { PersonasScreen } from '@/components/people/PersonasScreen';
import { listPersonas } from '@/lib/actions/people';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';
import { countPhotos } from '@/lib/photos/server';

export const metadata: Metadata = { title: 'Personas' };

export default function PersonasPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Personas" />}>
      <Personas />
    </Suspense>
  );
}

async function Personas() {
  const cards = await listPersonas(await getDeps(), madridToday(), countPhotos);
  return <PersonasScreen cards={cards} />;
}
