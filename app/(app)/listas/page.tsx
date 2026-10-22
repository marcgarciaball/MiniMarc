import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BagIcon, BookIcon, ClockIcon, GiftIcon, IdeaIcon, PersonIcon, TrayIcon } from '@/components/icons';
import { InsetList, LargeTitle, Row } from '@/components/ui';
import { listByType, listLibros, listSinClasificar } from '@/lib/actions/items';
import { getDeps } from '@/lib/actions/server';

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
  const deps = await getDeps();
  const [ideas, compras, regalos, libros, sinClasificar] = await Promise.all([
    listByType(deps, 'idea'),
    listByType(deps, 'compra'),
    listByType(deps, 'regalo'),
    listLibros(deps),
    listSinClasificar(deps),
  ]);
  return (
    <Hub
      counts={{
        ideas: ideas.length,
        compras: compras.length,
        regalos: regalos.length,
        // Books still to read or being read; the read ones are a record, not a to-do.
        libros: libros.filter((b) => b.readingState !== 'leido').length,
        sinClasificar: sinClasificar.length,
      }}
    />
  );
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
