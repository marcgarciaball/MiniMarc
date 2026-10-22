import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HoyScreen } from '@/components/hoy/HoyScreen';
import { HoyFallback } from '@/components/items/ScreenFallback';
import { readHoy } from '@/lib/cache/reads';
import type { Settings } from '@/lib/db/settings';
import { FALLBACK_HEADLINE, generateHeadline } from '@/lib/digest/server';
import { createClient, requireUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Hoy' };

export default function HoyPage() {
  return (
    <Suspense fallback={<HoyFallback />}>
      <Hoy />
    </Suspense>
  );
}

async function Hoy() {
  const { digest, headlinePrompt, settings } = await readHoy();
  // The AI line never holds the page: it streams in on its own when it is not cached yet.
  const headline = headlinePrompt ? (
    <Suspense fallback={<span className="app-headline-pending" aria-hidden />}>
      <Headline date={digest.date} settings={settings} prompt={headlinePrompt} />
    </Suspense>
  ) : undefined;
  return (
    <HoyScreen digest={digest} headline={headline} tz={settings.tz} vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? ''} />
  );
}

async function Headline({ date, settings, prompt }: { date: string; settings: Settings; prompt: string }) {
  const [user, client] = await Promise.all([requireUser(), createClient()]);
  return generateHeadline({ client, userId: user.id, key: date, settings, prompt, slot: 'day', fallback: FALLBACK_HEADLINE });
}
