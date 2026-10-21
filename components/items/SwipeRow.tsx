'use client';

import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { ArchiveIcon, CheckIcon } from '@/components/icons';
import { lockAxis, swipeOffset, swipeOutcome, type SwipeOutcome } from '@/components/ui/swipePhysics';

type Gesture = {
  pointerId: number;
  x0: number;
  y0: number;
  dx: number;
  lastX: number;
  lastT: number;
  velocity: number;
  axis: 'x' | 'y' | null;
};

type Phase = 'idle' | 'drag' | 'settle' | 'leave';

/** Matches the CSS transition of `.app-swipe__content[data-phase="leave"]`. */
const LEAVE_MS = 260;

export type SwipeRowProps = {
  children: ReactNode;
  /** Swipe right → 'complete'; swipe left → 'archive'. */
  onCommit: (outcome: Exclude<SwipeOutcome, null>) => void;
  completeLabel?: string;
};

/**
 * Horizontal swipe on a list row, iOS style: follows the finger, rubber-bands near the edge,
 * and commits by distance or by flick (projected with UIScrollView deceleration); otherwise springs back.
 * Vertical drags are left to the page scroll. With reduced motion the action applies without sliding away.
 */
export function SwipeRow({ children, onCommit, completeLabel = 'Hecho' }: SwipeRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const swallowClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (phase === 'leave' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    swallowClick.current = false;
    gesture.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dx: 0,
      lastX: e.clientX,
      lastT: e.timeStamp,
      velocity: 0,
      axis: null,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.x0;
    if (!g.axis) {
      g.axis = lockAxis(dx, e.clientY - g.y0);
      if (g.axis === 'y') {
        gesture.current = null;
        return;
      }
      if (!g.axis) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      swallowClick.current = true;
      setPhase('drag');
    }
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) g.velocity = 0.8 * ((e.clientX - g.lastX) / dt) + 0.2 * g.velocity;
    g.lastX = e.clientX;
    g.lastT = e.timeStamp;
    g.dx = dx;
    setOffset(swipeOffset(dx, ref.current?.offsetWidth ?? 0));
  }

  function release(cancelled: boolean) {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== 'x') return;
    const width = ref.current?.offsetWidth ?? 0;
    const outcome = cancelled ? null : swipeOutcome(g.dx, g.velocity, width);
    if (!outcome) {
      setPhase('settle');
      setOffset(0);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('idle');
      setOffset(0);
      onCommit(outcome);
      return;
    }
    setPhase('leave');
    setOffset(Math.sign(g.dx) * width);
    setTimeout(() => onCommit(outcome), LEAVE_MS);
  }

  function onClickCapture(e: MouseEvent) {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  const dir = offset > 0 ? 'complete' : offset < 0 ? 'archive' : undefined;

  return (
    <div ref={ref} className="app-swipe" data-dir={dir}>
      <div className="app-swipe__action app-swipe__action--complete" aria-hidden>
        <CheckIcon />
        {completeLabel}
      </div>
      <div className="app-swipe__action app-swipe__action--archive" aria-hidden>
        Archivar
        <ArchiveIcon />
      </div>
      <div
        className="app-swipe__content"
        data-phase={phase}
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => release(false)}
        onPointerCancel={() => release(true)}
        onClickCapture={onClickCapture}
        onTransitionEnd={() => phase === 'settle' && setPhase('idle')}
      >
        {children}
      </div>
    </div>
  );
}
