import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { LibrosScreen } from '@/components/libros/LibrosScreen';
import { listLibros } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import { loadPhotoMap } from '@/lib/photos/server';

export const metadata: Metadata = { title: 'Libros' };

export default function LibrosPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Libros" />}>
      <Libros />
    </Suspense>
  );
}

async function Libros() {
  const books = await listLibros(await getDeps());
  const photos = await loadPhotoMap(books);
  return <LibrosScreen books={books} photos={photos} />;
}
