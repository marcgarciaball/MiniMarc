import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InboxScreen } from '@/components/items/InboxScreen';
import { InboxFallback } from '@/components/items/ScreenFallback';
import { readRecent } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Recién añadido' };

type SearchParams = Promise<{ guardado?: string | string[] }>;

export default function BandejaPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<InboxFallback />}>
      <Bandeja searchParams={searchParams} />
    </Suspense>
  );
}

async function Bandeja({ searchParams }: { searchParams: SearchParams }) {
  // Where an Android share was saved (/compartir redirects here with ?guardado=).
  const [{ personal, trabajo, people, photos, today }, { guardado }] = await Promise.all([readRecent(), searchParams]);
  const notice = typeof guardado === 'string' ? guardado.slice(0, 200) : undefined;
  return (
    <InboxScreen
      today={today}
      personal={personal}
      trabajo={trabajo}
      people={people}
      photos={photos}
      notice={notice}
    />
  );
}
