import type { Metadata } from 'next';
import { SearchScreen } from '@/components/buscar/SearchScreen';

export const metadata: Metadata = { title: 'Buscar' };

/** A static shell: the results come from the `search` server action (session, RLS). */
export default function BuscarPage() {
  return <SearchScreen />;
}
