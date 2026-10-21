import { describe, it, expect } from 'vitest';
import { madridToUtc, toMadrid } from '@/lib/time';

describe('madridToUtc', () => {
  it('handles the switch to winter time (2026-10-25)', () => {
    expect(madridToUtc('2026-10-25', '10:00').toISOString()).toBe('2026-10-25T09:00:00.000Z');
  });

  it('handles summer time', () => {
    expect(madridToUtc('2026-07-01', '10:00').toISOString()).toBe('2026-07-01T08:00:00.000Z');
  });
});

describe('toMadrid', () => {
  it('returns local hour on the switch to summer time (2026-03-29)', () => {
    const r = toMadrid(new Date('2026-03-29T00:30:00Z'));
    expect(r.hour).toBe(1);
    expect(r.date).toBe('2026-03-29');
  });
});
