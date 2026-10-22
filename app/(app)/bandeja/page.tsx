import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InboxScreen } from '@/components/items/InboxScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { listRecent } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';
import { loadPhotoMap } from '@/lib/photos/server';

export const metadata: Metadata = { title: 'Recién añadido' };

type SearchParams = Promise<{ guardado?: string | string[] }>;

export default function BandejaPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenFallback title="Recién añadido" />}>
      <Bandeja searchParams={searchParams} />
    </Suspense>
  );
}

async function Bandeja({ searchParams }: { searchParams: SearchParams }) {
  const deps = await getDeps();
  // After getDeps (a request read), so the 24 h window is computed per request.
  const [recent, people] = await Promise.all([listRecent(deps, new Date()), deps.people.listPeople()]);
  const photos = await loadPhotoMap([...recent.personal, ...recent.trabajo]);
  // Where an Android share was saved (/compartir redirects here with ?guardado=).
  const { guardado } = await searchParams;
  const notice = typeof guardado === 'string' ? guardado.slice(0, 200) : undefined;
  return (
    <InboxScreen
      today={madridToday()}
      personal={recent.personal}
      trabajo={recent.trabajo}
      people={people}
      photos={photos}
      notice={notice}
    />
  );
}
