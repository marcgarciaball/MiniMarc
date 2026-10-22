import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HoyScreen } from '@/components/hoy/HoyScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { createSettingsRepo, loadSettingsOrDefaults } from '@/lib/db/settings';
import { buildDigestFor } from '@/lib/digest/server';
import { createClient, requireUser } from '@/lib/supabase/server';
import { toMadrid } from '@/lib/time';

export const metadata: Metadata = { title: 'Hoy' };

export default function HoyPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Hoy" />}>
      <Hoy />
    </Suspense>
  );
}

async function Hoy() {
  const user = await requireUser();
  const client = await createClient();
  const { settings, repo } = await loadSettingsOrDefaults(createSettingsRepo(client, user.id));
  const now = new Date();
  const date = toMadrid(now, settings.tz).date;
  const digest = await buildDigestFor({ client, userId: user.id, date, now, settings, settingsRepo: repo });
  return <HoyScreen digest={digest} tz={settings.tz} vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? ''} />;
}
