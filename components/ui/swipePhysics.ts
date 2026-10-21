/** Distance (px) a finger must travel before a row decides between a horizontal swipe and a scroll. */
export const LOCK_DISTANCE = 8;
/** iOS "fast" deceleration rate per ms, used to project where a flick would come to rest. */
export const DECELERATION = 0.99;
/** Fraction of the row width the projected release must pass to commit the action. */
export const COMMIT_FRACTION = 0.45;
/** Past this fraction of the width the row resists like a rubber band. */
export const RESIST_FRACTION = 0.8;

export type SwipeAxis = 'x' | 'y' | null;
export type SwipeOutcome = 'complete' | 'archive' | null;

/** Decides the gesture once it has moved enough: mostly horizontal → swipe, otherwise leave it to scrolling. */
export function lockAxis(dx: number, dy: number): SwipeAxis {
  if (Math.hypot(dx, dy) < LOCK_DISTANCE) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/** Where a release at `velocity` px/ms would end up after decelerating (UIScrollView projection). */
export function project(velocity: number): number {
  return (velocity * DECELERATION) / (1 - DECELERATION);
}

/** Row offset for a finger offset: 1:1, then rubber-banded past RESIST_FRACTION of the width. */
export function swipeOffset(dx: number, width: number): number {
  const limit = width * RESIST_FRACTION;
  const abs = Math.abs(dx);
  if (abs <= limit) return dx;
  const over = abs - limit;
  const resisted = limit + (over * width * 0.2) / (over + width * 0.2);
  return Math.sign(dx) * resisted;
}

/** Right → complete, left → archive, when the projected rest point passes the threshold in the drag's direction. */
export function swipeOutcome(dx: number, velocity: number, width: number): SwipeOutcome {
  if (width <= 0 || Math.abs(dx) < LOCK_DISTANCE) return null;
  const rest = dx + project(velocity);
  if (Math.sign(rest) !== Math.sign(dx)) return null;
  if (Math.abs(rest) < width * COMMIT_FRACTION) return null;
  return dx > 0 ? 'complete' : 'archive';
}
