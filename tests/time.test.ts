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

describe('madridToUtc en los bordes del cambio de hora', () => {
  it('hueco de primavera (2026-03-29): 02:30 no existe y se adelanta a las 03:30 CEST', () => {
    const d = madridToUtc('2026-03-29', '02:30');
    expect(d.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(toMadrid(d)).toEqual({ date: '2026-03-29', hour: 3 });
  });

  it('justo antes y después del hueco de primavera', () => {
    expect(madridToUtc('2026-03-29', '01:59').toISOString()).toBe('2026-03-29T00:59:00.000Z');
    expect(madridToUtc('2026-03-29', '03:00').toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  it('solape de otoño (2026-10-25): 02:30 ocurre dos veces y se elige la segunda (CET, UTC+1)', () => {
    const d = madridToUtc('2026-10-25', '02:30');
    expect(d.toISOString()).toBe('2026-10-25T01:30:00.000Z');
    expect(toMadrid(d)).toEqual({ date: '2026-10-25', hour: 2 });
  });

  it('justo antes y después del solape de otoño', () => {
    expect(madridToUtc('2026-10-25', '01:59').toISOString()).toBe('2026-10-24T23:59:00.000Z');
    expect(madridToUtc('2026-10-25', '03:00').toISOString()).toBe('2026-10-25T02:00:00.000Z');
  });
});
