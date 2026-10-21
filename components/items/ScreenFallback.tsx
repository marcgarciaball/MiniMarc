import type { ReactNode } from 'react';
import { LargeTitle } from '@/components/ui';

/** What a list screen shows while its data streams in: the same title, no rows, no spinner. */
export function ScreenFallback({ title, leading }: { title: string; leading?: ReactNode }) {
  return <LargeTitle title={title} leading={leading} />;
}
