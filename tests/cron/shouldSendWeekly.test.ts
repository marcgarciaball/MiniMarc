import { describe, expect, it } from 'vitest';
import { shouldSendWeekly, WEEKLY_SCHEDULE } from '@/lib/cron/shouldSendWeekly';
import type { WeeklyDigest } from '@/lib/db/settings';

const TZ = 'Europe/Madrid';
const s = (weeklyDigest: WeeklyDigest, lastWeeklyDate: string | null = null, tz = TZ) => ({ weeklyDigest, tz, lastWeeklyDate });

describe('shouldSendWeekly', () => {
  it('horarios: lunes 08:00 y domingo 20:00', () => {
    expect(WEEKLY_SCHEDULE).toEqual({ lunes: { weekday: 1, hour: 8 }, domingo: { weekday: 0, hour: 20 } });
  });

  it('lunes 08:00 de Madrid → resume la semana que empieza ese lunes', () => {
    // 26 oct 2026: ya en CET (UTC+1) → 08:00 Madrid = 07:00 UTC.
    expect(shouldSendWeekly(new Date('2026-10-26T07:00:00Z'), s('lunes', '2026-10-19'))).toBe('2026-10-26');
    expect(shouldSendWeekly(new Date('2026-10-26T07:00:00Z'), s('lunes'))).toBe('2026-10-26');
  });

  it('lunes antes de las 08:00 → nada; si la de las 08:00 falló, la de las 09:00 lo recupera', () => {
    expect(shouldSendWeekly(new Date('2026-10-26T06:00:00Z'), s('lunes'))).toBeNull();
    expect(shouldSendWeekly(new Date('2026-10-25T23:30:00Z'), s('lunes'))).toBeNull(); // lunes 00:30
    expect(shouldSendWeekly(new Date('2026-10-26T08:00:00Z'), s('lunes'))).toBe('2026-10-26');
  });

  it('esa semana ya enviada → nada (no se repite el resto del lunes)', () => {
    expect(shouldSendWeekly(new Date('2026-10-26T07:00:00Z'), s('lunes', '2026-10-26'))).toBeNull();
    expect(shouldSendWeekly(new Date('2026-10-26T20:00:00Z'), s('lunes', '2026-10-26'))).toBeNull();
  });

  it('otro día de la semana → nada (no se recupera el martes)', () => {
    expect(shouldSendWeekly(new Date('2026-10-27T07:00:00Z'), s('lunes'))).toBeNull();
    expect(shouldSendWeekly(new Date('2026-10-25T19:00:00Z'), s('lunes'))).toBeNull(); // domingo 20:00
  });

  it('domingo 20:00 → resume la semana siguiente; el día del cambio a horario de invierno (25 oct) a las 19:00 UTC', () => {
    expect(shouldSendWeekly(new Date('2026-10-25T18:00:00Z'), s('domingo'))).toBeNull(); // 19:00 local
    expect(shouldSendWeekly(new Date('2026-10-25T19:00:00Z'), s('domingo', '2026-10-19'))).toBe('2026-10-26');
    expect(shouldSendWeekly(new Date('2026-10-25T22:00:00Z'), s('domingo'))).toBe('2026-10-26'); // 23:00, reintento
    expect(shouldSendWeekly(new Date('2026-10-26T07:00:00Z'), s('domingo'))).toBeNull(); // el lunes ya no
  });

  it('el día del cambio a horario de verano (29 mar): domingo 20:00 = 18:00 UTC; lunes 08:00 = 06:00 UTC', () => {
    expect(shouldSendWeekly(new Date('2026-03-29T17:00:00Z'), s('domingo'))).toBeNull();
    expect(shouldSendWeekly(new Date('2026-03-29T18:00:00Z'), s('domingo'))).toBe('2026-03-30');
    expect(shouldSendWeekly(new Date('2026-03-30T05:00:00Z'), s('lunes'))).toBeNull();
    expect(shouldSendWeekly(new Date('2026-03-30T06:00:00Z'), s('lunes'))).toBe('2026-03-30');
  });

  it('pasar de domingo a lunes no repite la semana ya enviada el domingo', () => {
    expect(shouldSendWeekly(new Date('2026-10-26T07:00:00Z'), s('lunes', '2026-10-26'))).toBeNull();
  });

  it('desactivado → nunca', () => {
    expect(shouldSendWeekly(new Date('2026-10-26T07:00:00Z'), s('off'))).toBeNull();
    expect(shouldSendWeekly(new Date('2026-10-25T19:00:00Z'), s('off'))).toBeNull();
  });

  it('usa la zona de los ajustes', () => {
    // Lunes 26 oct, 08:00 en Nueva York (EDT, UTC-4) = 12:00 UTC.
    expect(shouldSendWeekly(new Date('2026-10-26T11:00:00Z'), s('lunes', null, 'America/New_York'))).toBeNull();
    expect(shouldSendWeekly(new Date('2026-10-26T12:00:00Z'), s('lunes', null, 'America/New_York'))).toBe('2026-10-26');
  });
});
