'use client';

import { useEffect } from 'react';

/** Registers /sw.js (read-only cache) in production builds. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Without the worker the app still works online; nothing to tell the user.
    });
  }, []);
  return null;
}
