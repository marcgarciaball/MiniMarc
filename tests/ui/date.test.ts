import { describe, expect, it } from 'vitest';
import { formatLongDate } from '@/lib/time';

describe('formatLongDate', () => {
  it('names 2026-10-21 as a Wednesday in Spanish', () => {
    expect(formatLongDate(new Date('2026-10-21T10:00:00Z'))).toBe('miércoles, 21 de octubre');
  });

  it('uses the Madrid day, not the UTC day, near midnight', () => {
    // 23:30 UTC on the 21st is already 01:30 on the 22nd in Madrid (CEST).
    expect(formatLongDate(new Date('2026-10-21T23:30:00Z'))).toBe('jueves, 22 de octubre');
  });
});
