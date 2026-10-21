import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { DesignShowcase } from './Showcase';
import '@/components/app/app.css';
import './design.css';

export const metadata: Metadata = { title: 'Sistema visual' };

export default function DesignPage() {
  return (
    <Suspense>
      <Showcase />
    </Suspense>
  );
}

/** The showcase prints today's date, so it renders per request. */
async function Showcase() {
  await connection();
  return <DesignShowcase today={new Date()} />;
}
