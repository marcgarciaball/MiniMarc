import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { LibrosScreen } from '@/components/libros/LibrosScreen';
import { readLibros } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Libros' };

export default function LibrosPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Libros" />}>
      <Libros />
    </Suspense>
  );
}

async function Libros() {
  const { books, photos } = await readLibros();
  return <LibrosScreen books={books} photos={photos} />;
}
