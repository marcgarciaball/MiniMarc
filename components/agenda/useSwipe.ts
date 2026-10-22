'use client';

import { useRef, type MouseEvent, type PointerEvent } from 'react';

/** Horizontal distance (px) a touch must travel to count as a swipe. */
const THRESHOLD = 56;

type Gesture = { id: number; x: number; y: number; dx: number; locked: 'x' | 'y' | null };

/**
 * Horizontal swipe on touch only (mouse and pen are left alone). The element should have
 * `touch-action: pan-y` so vertical scrolling stays native. `onDrag` follows the finger
 * (callers skip it under reduced motion); `onSwipe(-1)` is a swipe to the left (next).
 */
export function useSwipe(onSwipe: (direction: -1 | 1) => void, onDrag?: (dx: number | null) => void) {
  const g = useRef<Gesture | null>(null);
  // A horizontal drag must not also count as a tap on the day/event under the finger.
  const swipedAt = useRef(0);

  function end(commit: boolean) {
    const cur = g.current;
    g.current = null;
    onDrag?.(null);
    if (cur?.locked === 'x') swipedAt.current = performance.now();
    if (commit && cur?.locked === 'x' && Math.abs(cur.dx) >= THRESHOLD) onSwipe(cur.dx < 0 ? -1 : 1);
  }

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.pointerType !== 'touch' || g.current) return;
      g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, locked: null };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const cur = g.current;
      if (!cur || cur.id !== e.pointerId) return;
      const dx = e.clientX - cur.x;
      const dy = e.clientY - cur.y;
      if (!cur.locked && Math.hypot(dx, dy) > 10) cur.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (cur.locked !== 'x') return;
      cur.dx = dx;
      onDrag?.(dx);
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      if (g.current?.id === e.pointerId) end(true);
    },
    onPointerCancel(e: PointerEvent<HTMLElement>) {
      if (g.current?.id === e.pointerId) end(false);
    },
    onClickCapture(e: MouseEvent<HTMLElement>) {
      if (performance.now() - swipedAt.current < 400) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}

/** True when the user asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
