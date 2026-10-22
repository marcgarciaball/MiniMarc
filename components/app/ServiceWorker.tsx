'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Registers /sw.js (read-only cache) in production builds. When the worker painted this page
 * from its cached copy, it says so once the fresh copy is in (`page-updated`), and the page
 * refreshes its data in place (no reload, no flash).
 */
export function ServiceWorker() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'page-updated') router.refresh();
    };
    sw.addEventListener('message', onMessage);
    // Delivers messages the worker queued before this listener existed.
    sw.startMessages();
    sw.register('/sw.js', { scope: '/' }).catch(() => {
      // Without the worker the app still works online; nothing to tell the user.
    });
    return () => sw.removeEventListener('message', onMessage);
  }, [router]);
  return null;
}
