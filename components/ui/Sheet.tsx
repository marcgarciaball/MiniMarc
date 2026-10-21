'use client';

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { rubberBand, shouldDismiss } from './sheetPhysics';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Header buttons (`.ui-bar-button`), e.g. "Cancelar" / "Añadir". */
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
};

type Drag = { startY: number; lastY: number; lastT: number; velocity: number };

/**
 * Bottom modal sheet. Drag the grabber or header down to dismiss
 * (distance or flick), tap the backdrop or press Escape.
 */
export function Sheet({ open, onClose, title, leading, trailing, children }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [offset, setOffset] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button, a')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
    setOffset(0);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setOffset(rubberBand(e.clientY - d.startY));
  }

  function onPointerEnd() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const height = sheetRef.current?.offsetHeight ?? 0;
    if (shouldDismiss(d.lastY - d.startY, d.velocity, height)) onClose();
    setOffset(null);
  }

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
  };

  return (
    <>
      <div className="ui-sheet-backdrop" data-open={open} onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        inert={!open}
        className="ui-sheet"
        data-open={open}
        data-dragging={offset !== null}
        style={offset !== null ? { transform: `translateY(${offset}px)` } : undefined}
      >
        <div {...handlers}>
          <div className="ui-sheet__grabber" aria-hidden />
          <div className="ui-sheet__header">
            <div className="ui-navbar__leading">{leading}</div>
            <div className="ui-sheet__title">{title}</div>
            <div className="ui-navbar__trailing">{trailing}</div>
          </div>
        </div>
        <div className="ui-sheet__body">{children}</div>
      </div>
    </>
  );
}
