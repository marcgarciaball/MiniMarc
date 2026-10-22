'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { shouldRefreshOnReturn } from '@/lib/cache/returnRefresh';

/**
 * Refreshes the current screen's data when the app returns to the foreground (tab visible again
 * or window focused), so a capture made from Siri or the extension shows at once instead of
 * after the client cache's stale time.
 */
export function RefreshOnReturn() {
  const router = useRouter();
  useEffect(() => {
    let leftAt: number | null = null;
    const leave = () => {
      leftAt ??= Date.now();
    };
    const back = () => {
      if (document.visibilityState !== 'visible') return leave();
      if (shouldRefreshOnReturn(leftAt, Date.now())) router.refresh();
      leftAt = null;
    };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', back);
    };
  }, [router]);
  return null;
}
