import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BagIcon, BookIcon, ClockIcon, GiftIcon, IdeaIcon, PersonIcon, TrayIcon } from '@/components/icons';
import { InsetList, LargeTitle, Row } from '@/components/ui';
import { readListCounts } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Listas' };

type Counts = { ideas: number; compras: number; regalos: number; libros: number; sinClasificar: number };

export default function ListasPage() {
  return (
    <LargeTitle title="Listas">
      <Suspense fallback={<Hub counts={null} />}>
        <HubWithCounts />
      </Suspense>
    </LargeTitle>
  );
}

async function HubWithCounts() {
  return <Hub counts={await readListCounts()} />;
}

const tile = (icon: React.ReactNode) => <span className="ui-icon-tile">{icon}</span>;
const count = (n: number | undefined) => (n ? String(n) : undefined);

function Hub({ counts }: { counts: Counts | null }) {
  return (
    <InsetList>
      <Row href="/ideas" leading={tile(<IdeaIcon />)} title="Ideas" detail={count(counts?.ideas)} />
      <Row href="/compras" leading={tile(<BagIcon />)} title="Compras" detail={count(counts?.compras)} />
      <Row href="/regalos" leading={tile(<GiftIcon />)} title="Regalos" detail={count(counts?.regalos)} />
      <Row href="/libros" leading={tile(<BookIcon />)} title="Libros" detail={count(counts?.libros)} />
      <Row href="/personas" leading={tile(<PersonIcon />)} title="Personas" subtitle="Fechas especiales e ideas de regalo" />
      <Row
        href="/sin-clasificar"
        leading={tile(<TrayIcon />)}
        title="Sin clasificar"
        detail={count(counts?.sinClasificar)}
      />
      <Row href="/bandeja" leading={tile(<ClockIcon />)} title="Recién añadido" subtitle="Lo capturado en las últimas 24 h" />
    </InsetList>
  );
}
