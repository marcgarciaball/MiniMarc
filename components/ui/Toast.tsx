'use client';

import { useEffect } from 'react';

export type ToastProps = {
  /** Null hides the toast. Change `id` to restart the timer for a new message. */
  toast: { id: number; message: string; actionLabel?: string; onAction?: () => void } | null;
  onDismiss: () => void;
  /** Milliseconds before it hides itself. */
  duration?: number;
};

/** Glass capsule above the tab bar, e.g. "Eliminado · Deshacer". Announced politely to screen readers. */
export function Toast({ toast, onDismiss, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [toast, onDismiss, duration]);

  return (
    <div className="ui-toast-region" role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className="ui-toast">
          <span className="ui-toast__message">{toast.message}</span>
          {toast.actionLabel && (
            <button
              type="button"
              className="ui-bar-button ui-bar-button--strong"
              onClick={() => {
                toast.onAction?.();
                onDismiss();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
