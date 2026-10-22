import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { ShareConfirm } from '@/components/share/ShareConfirm';
import { requireUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Compartido' };

type SearchParams = Promise<{ id?: string | string[]; error?: string | string[] }>;

/**
 * Android share target, confirm step (I-1). The service worker keeps the share on the device
 * and redirects here with `?id=`; nothing is saved until «Guardar». A share POST that reaches
 * the server is answered 303 to this page by the proxy, with no side effects. Session only.
 */
export default function CompartirPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenFallback title="Compartido" />}>
      <Compartir searchParams={searchParams} />
    </Suspense>
  );
}

async function Compartir({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const { id, error } = await searchParams;
  const valid = typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  return <ShareConfirm key={valid ?? 'none'} id={valid} failed={error !== undefined} />;
}
