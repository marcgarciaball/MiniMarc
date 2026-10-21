import { describe, expect, it } from 'vitest';
import { rubberBand, shouldDismiss } from '@/components/ui/sheetPhysics';

describe('shouldDismiss', () => {
  const height = 500;

  it('closes on a fast downward flick even if short', () => {
    expect(shouldDismiss(20, 0.8, height)).toBe(true);
  });

  it('closes on a slow release past 30 % of the height', () => {
    expect(shouldDismiss(200, 0.1, height)).toBe(true);
  });

  it('snaps back on a slow, short release', () => {
    expect(shouldDismiss(100, 0.1, height)).toBe(false);
  });

  it('snaps back when the finger is moving up at release', () => {
    expect(shouldDismiss(300, -0.2, height)).toBe(false);
  });

  it('never closes when dragged above the resting position', () => {
    expect(shouldDismiss(-10, 1, height)).toBe(false);
  });
});

describe('rubberBand', () => {
  it('follows the finger downwards', () => {
    expect(rubberBand(120)).toBe(120);
  });

  it('resists upwards drags', () => {
    expect(rubberBand(-100)).toBeCloseTo(-20);
    expect(Math.abs(rubberBand(-400))).toBeLessThan(400);
  });
});
