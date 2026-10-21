/** Downward flick speed (px/ms) that dismisses the sheet regardless of distance. */
export const DISMISS_VELOCITY = 0.5;
/** Fraction of the sheet height that dismisses it on a slow release. */
export const DISMISS_FRACTION = 0.3;

/** Upward drags resist like iOS rubber-banding; downward drags follow the finger. */
export function rubberBand(dy: number): number {
  return dy >= 0 ? dy : -Math.sqrt(-dy) * 2;
}

/** Whether releasing a drag at `offset` px moving at `velocity` px/ms closes the sheet. */
export function shouldDismiss(offset: number, velocity: number, height: number): boolean {
  if (offset <= 0) return false;
  if (velocity >= DISMISS_VELOCITY) return true;
  if (velocity < 0) return false;
  return offset > height * DISMISS_FRACTION;
}
