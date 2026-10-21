'use client';

import { usePathname } from 'next/navigation';
import { sectionFor } from '@/lib/nav';
import { AppNav } from './AppNav';

/** AppNav with the section of the current URL highlighted. */
export function CurrentAppNav() {
  return <AppNav active={sectionFor(usePathname())} />;
}
