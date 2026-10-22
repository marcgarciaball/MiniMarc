import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DigestSection } from '@/components/ajustes/DigestSection';
import { SignOutButton } from '@/components/ajustes/SignOutButton';
import { TokensSection } from '@/components/ajustes/TokensSection';
import { WeeklySection } from '@/components/ajustes/WeeklySection';
import { InsetList, LargeTitle, Row } from '@/components/ui';
import { madridToday } from '@/lib/actions/today';
import { listApiTokens } from '@/lib/auth/tokens';
import { createSettingsRepo } from '@/lib/db/settings';
import { createClient, requireUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Ajustes' };

/** The four checks of docs/iphone.md (steps 1–4), each linking to its section of the guide. */
const IPHONE_CHECKS = [
  {
    step: 1,
    title: 'Avisos de 3 h y 1 h en Google Calendar',
    hint: 'En calendar.google.com, añade avisos de 3 h y 1 h al calendario principal y a «Tareas».',
  },
  {
    step: 2,
    title: 'Cuenta de Google en Calendario',
    hint: 'Ajustes → Apps → Calendario → Cuentas de calendario → Añadir cuenta → Google.',
  },
  {
    step: 3,
    title: '«Tareas» sincronizado con el iPhone',
    hint: 'Márcalo en calendar.google.com/calendar/syncselect y compruébalo en Calendario.',
  },
  {
    step: 4,
    title: 'Avisos en una sola app',
    hint: 'Notificaciones activas en Calendario; desactivadas en la app Google Calendar.',
  },
] as const;

const step = (n: number) => <span className="ui-icon-tile">{n}</span>;

export default function AjustesPage() {
  return (
    <LargeTitle title="Ajustes">
      <InsetList header="Configurar el iPhone" footer="Así llegan al iPhone los avisos de 3 h y 1 h, una sola vez.">
        {IPHONE_CHECKS.map((c) => (
          <Row key={c.step} href={`/ajustes/iphone#paso-${c.step}`} leading={step(c.step)} title={c.title} subtitle={c.hint} />
        ))}
        <Row href="/ajustes/iphone" title="Guía completa" />
      </InsetList>

      <Suspense
        fallback={
          <>
            <DigestSection hour={null} tz={null} />
            <WeeklySection value={null} />
          </>
        }
      >
        <Digest />
      </Suspense>

      <Suspense fallback={<TokensSection tokens={null} today="" />}>
        <Tokens />
      </Suspense>

      <InsetList header="Cuenta">
        <Suspense fallback={<Row title="Correo" />}>
          <Email />
        </Suspense>
        <SignOutButton />
      </InsetList>
    </LargeTitle>
  );
}

async function Email() {
  const user = await requireUser();
  return <Row title="Correo" detail={user.email} />;
}

async function Tokens() {
  // The session first: it makes this a request-time render (and redirects without one).
  await requireUser();
  const tokens = await listApiTokens();
  return <TokensSection tokens={tokens} today={madridToday()} />;
}

async function Digest() {
  const user = await requireUser();
  const settings = await createSettingsRepo(await createClient(), user.id).get();
  return (
    <>
      <DigestSection hour={settings.digestHour} tz={settings.tz} />
      <WeeklySection value={settings.weeklyDigest} />
    </>
  );
}
