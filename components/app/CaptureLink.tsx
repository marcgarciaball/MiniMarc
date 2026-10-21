'use client';

import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { BANDEJA_HREF, CAPTURE_INPUT_ID } from '@/lib/nav';

/** "Capturar": focuses the CaptureBar's field; if it is not there, opens the Bandeja instead. */
export function CaptureLink({ className, children }: { className?: string; children: ReactNode }) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    const input = document.getElementById(CAPTURE_INPUT_ID);
    if (!input) return;
    e.preventDefault();
    input.scrollIntoView({ block: 'nearest' });
    input.focus();
  }

  return (
    <Link href={BANDEJA_HREF} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
