import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { PersonasScreen } from '@/components/people/PersonasScreen';
import { readPersonas } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Personas' };

export default function PersonasPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Personas" />}>
      <Personas />
    </Suspense>
  );
}

async function Personas() {
  const cards = await readPersonas();
  return <PersonasScreen cards={cards} />;
}
