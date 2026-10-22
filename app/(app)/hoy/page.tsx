import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HoyScreen } from '@/components/hoy/HoyScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { createSettingsRepo, DEFAULT_DIGEST_HOUR, defaultTz, type Settings, type SettingsRepo } from '@/lib/db/settings';
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

/** Without readable settings the digest still shows (default hour and zone, headline not cached). */
async function loadSettings(repo: SettingsRepo): Promise<{ settings: Settings; repo: SettingsRepo }> {
  try {
    return { settings: await repo.get(), repo };
  } catch {
    const settings = { digestHour: DEFAULT_DIGEST_HOUR, tz: defaultTz(), lastDigestDate: null, headline: null, headlineDate: null };
    return { settings, repo: { get: async () => settings, update: async () => {} } };
  }
}

async function Hoy() {
  const user = await requireUser();
  const client = await createClient();
  const { settings, repo } = await loadSettings(createSettingsRepo(client, user.id));
  const now = new Date();
  const date = toMadrid(now, settings.tz).date;
  const digest = await buildDigestFor({ client, userId: user.id, date, now, settings, settingsRepo: repo });
  return <HoyScreen digest={digest} tz={settings.tz} vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? ''} />;
}
