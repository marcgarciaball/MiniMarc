import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InboxScreen } from '@/components/items/InboxScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { listRecent } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';

export const metadata: Metadata = { title: 'Recién añadido' };

export default function BandejaPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Recién añadido" />}>
      <Bandeja />
    </Suspense>
  );
}

async function Bandeja() {
  const deps = await getDeps();
  // After getDeps (a request read), so the 24 h window is computed per request.
  const [recent, people] = await Promise.all([listRecent(deps, new Date()), deps.people.listPeople()]);
  return <InboxScreen today={madridToday()} personal={recent.personal} trabajo={recent.trabajo} people={people} />;
}
