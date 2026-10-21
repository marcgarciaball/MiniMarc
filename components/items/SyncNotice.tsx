'use client';

import Link from 'next/link';
import { RECONNECT_HREF } from '@/lib/nav';

export type SyncNoticeProps = {
  /** The item's `syncError` ('calendar_auth' | 'calendar_unavailable'). */
  error: string;
  pending?: boolean;
  onRetry: () => void;
};

/** Quiet line under a task whose Calendar reminder could not be saved, with "Reintentar". */
export function SyncNotice({ error, pending, onRetry }: SyncNoticeProps) {
  return (
    <p className="app-item__notice" role="status">
      <span className="app-item__notice-text">No se pudo avisar en Calendar.</span>
      {error === 'calendar_auth' && (
        <Link href={RECONNECT_HREF} className="app-item__notice-action">
          Vuelve a entrar con Google
        </Link>
      )}
      <button type="button" className="app-item__notice-action" onClick={onRetry} disabled={pending}>
        Reintentar
      </button>
    </p>
  );
}
