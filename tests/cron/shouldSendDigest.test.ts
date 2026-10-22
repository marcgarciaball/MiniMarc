import { describe, expect, it } from 'vitest';
import { shouldSendDigest } from '@/lib/cron/shouldSendDigest';

const TZ = 'Europe/Madrid';
const s = (lastDigestDate: string | null, digestHour = 8) => ({ digestHour, tz: TZ, lastDigestDate });

describe('shouldSendDigest', () => {
  it('a las 08:00 de Madrid con digestHour=8 y sin enviar hoy → true', () => {
    // 22 oct 2026: CEST (UTC+2) → 08:00 Madrid = 06:00 UTC.
    expect(shouldSendDigest(new Date('2026-10-22T06:00:00Z'), s('2026-10-21'))).toBe(true);
    expect(shouldSendDigest(new Date('2026-10-22T06:00:00Z'), s(null))).toBe(true);
  });

  it('mismo día ya enviado → false', () => {
    expect(shouldSendDigest(new Date('2026-10-22T06:00:00Z'), s('2026-10-22'))).toBe(false);
    expect(shouldSendDigest(new Date('2026-10-22T09:00:00Z'), s('2026-10-22'))).toBe(false);
  });

  it('a las 07:00 (y 07:59) → false', () => {
    expect(shouldSendDigest(new Date('2026-10-22T05:00:00Z'), s('2026-10-21'))).toBe(false);
    expect(shouldSendDigest(new Date('2026-10-22T05:59:00Z'), s('2026-10-21'))).toBe(false);
  });

  it('si la ejecución de las 08:00 falló, la de las 09:00 lo recupera', () => {
    expect(shouldSendDigest(new Date('2026-10-22T07:00:00Z'), s('2026-10-21'))).toBe(true);
  });

  it('el día del cambio a horario de invierno (25 oct) dispara a las 08:00 locales (07:00 UTC)', () => {
    expect(shouldSendDigest(new Date('2026-10-25T06:00:00Z'), s('2026-10-24'))).toBe(false);
    expect(shouldSendDigest(new Date('2026-10-25T07:00:00Z'), s('2026-10-24'))).toBe(true);
  });

  it('el día del cambio a horario de verano (29 mar) dispara a las 08:00 locales (06:00 UTC)', () => {
    expect(shouldSendDigest(new Date('2026-03-29T05:00:00Z'), s('2026-03-28'))).toBe(false);
    expect(shouldSendDigest(new Date('2026-03-29T06:00:00Z'), s('2026-03-28'))).toBe(true);
  });

  it('usa la fecha local: a las 00:30 de Madrid (22:30 UTC del día anterior) es otro día', () => {
    expect(shouldSendDigest(new Date('2026-10-21T22:30:00Z'), s('2026-10-21', 0))).toBe(true);
  });

  it('respeta otra hora y otra zona', () => {
    expect(shouldSendDigest(new Date('2026-10-22T10:00:00Z'), { digestHour: 6, tz: 'America/New_York', lastDigestDate: null })).toBe(true);
    expect(shouldSendDigest(new Date('2026-10-22T09:00:00Z'), { digestHour: 6, tz: 'America/New_York', lastDigestDate: null })).toBe(false);
  });
});
