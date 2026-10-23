import { describe, expect, test } from 'vitest';
import { REPEATS, REPEAT_LABELS, isRepeat, nextDue } from '@/lib/recurrence';
import { madridDateTime } from '@/lib/time';

const at = (iso: string) => new Date(iso);

describe('isRepeat / constants', () => {
  test('accepts only the four repeat values', () => {
    for (const r of REPEATS) expect(isRepeat(r)).toBe(true);
    for (const v of ['', 'daily', 'DIARIA', null, undefined, 3, {}]) expect(isRepeat(v)).toBe(false);
  });
  test('every repeat has a Spanish label', () => {
    expect(REPEAT_LABELS).toEqual({
      diaria: 'Cada día',
      semanal: 'Cada semana',
      mensual: 'Cada mes',
      anual: 'Cada año',
    });
  });
});

describe('nextDue', () => {
  // 2026-10-22T07:00:00Z = 09:00 Madrid
  test('diaria avanza un día conservando la hora local', () => {
    expect(nextDue('2026-10-22T07:00:00Z', 'diaria', { after: at('2026-10-22T08:00:00Z'), hasTime: true })).toBe(
      '2026-10-23T07:00:00.000Z',
    );
  });

  test('semanal sobre una tarea vencida salta al futuro', () => {
    // 2026-10-27 is after the 25 Oct change to CET: 09:00 Madrid = 08:00Z (the brief's 07:00Z was a slip)
    expect(nextDue('2026-09-01T07:00:00Z', 'semanal', { after: at('2026-10-22T08:00:00Z'), hasTime: true })).toBe(
      '2026-10-27T08:00:00.000Z',
    );
  });

  test('mantiene las 09:00 de Madrid al cruzar el cambio de hora', () => {
    expect(nextDue('2026-10-24T07:00:00Z', 'semanal', { after: at('2026-10-24T08:00:00Z'), hasTime: true })).toBe(
      '2026-10-31T08:00:00.000Z',
    );
  });

  test('mantiene las 09:00 de Madrid al cruzar el cambio de hora de primavera', () => {
    // 2027-03-27 09:00 CET = 08:00Z; next day is CEST (change on 03-28)
    expect(nextDue('2027-03-27T08:00:00Z', 'diaria', { after: at('2027-03-27T09:00:00Z'), hasTime: true })).toBe(
      '2027-03-28T07:00:00.000Z',
    );
  });

  test('mensual desde el 31 cae en el último día del mes', () => {
    // 2026-01-31 09:00 CET = 08:00Z
    const first = nextDue('2026-01-31T08:00:00Z', 'mensual', { after: at('2026-01-31T09:00:00Z'), hasTime: true });
    expect(madridDateTime(new Date(first)).date).toBe('2026-02-28');
    // Clamping is not sticky: from the ORIGINAL anchor, the next one after February is March 31.
    const second = nextDue('2026-01-31T08:00:00Z', 'mensual', { after: new Date(first), hasTime: true });
    expect(madridDateTime(new Date(second)).date).toBe('2026-03-31');
  });

  test('mensual vencida no arrastra el recorte: desde el 31 salta a abril 30 y luego mayo 31', () => {
    const a = nextDue('2026-01-31T08:00:00Z', 'mensual', { after: at('2026-04-01T00:00:00Z'), hasTime: true });
    expect(madridDateTime(new Date(a)).date).toBe('2026-04-30');
    const b = nextDue('2026-01-31T08:00:00Z', 'mensual', { after: at('2026-05-01T00:00:00Z'), hasTime: true });
    expect(madridDateTime(new Date(b)).date).toBe('2026-05-31');
  });

  test('mensual cruza el fin de año', () => {
    const r = nextDue('2026-12-15T08:00:00Z', 'mensual', { after: at('2026-12-15T09:00:00Z'), hasTime: true });
    expect(madridDateTime(new Date(r)).date).toBe('2027-01-15');
  });

  test('anual desde el 29 de febrero cae en el 28', () => {
    const r = nextDue('2028-02-29T08:00:00Z', 'anual', { after: at('2028-02-29T09:00:00Z'), hasTime: true });
    expect(madridDateTime(new Date(r)).date).toBe('2029-02-28');
  });

  test('anual desde el 29 de febrero vuelve al 29 en el siguiente bisiesto', () => {
    const r = nextDue('2028-02-29T08:00:00Z', 'anual', { after: at('2031-12-01T00:00:00Z'), hasTime: true });
    expect(madridDateTime(new Date(r)).date).toBe('2032-02-29');
  });

  test('sin hora, la siguiente también es sin hora', () => {
    // 2026-10-22 00:00 Madrid (CEST) = 2026-10-21T22:00:00Z
    const r = nextDue('2026-10-21T22:00:00Z', 'diaria', { after: at('2026-10-22T10:00:00Z'), hasTime: false });
    expect(r).toBe('2026-10-22T22:00:00.000Z');
    expect(madridDateTime(new Date(r)).time).toBe('00:00');
  });

  test('sin hora conserva la medianoche de Madrid al cruzar el cambio de hora', () => {
    // 2026-10-24 00:00 CEST = 2026-10-23T22:00Z; a week later 00:00 CET = 2026-10-30T23:00Z
    expect(nextDue('2026-10-23T22:00:00Z', 'semanal', { after: at('2026-10-24T10:00:00Z'), hasTime: false })).toBe(
      '2026-10-30T23:00:00.000Z',
    );
  });

  test('el resultado es estrictamente posterior a after, incluso si coincide con una ocurrencia', () => {
    expect(nextDue('2026-10-22T07:00:00Z', 'diaria', { after: at('2026-10-23T07:00:00Z'), hasTime: true })).toBe(
      '2026-10-24T07:00:00.000Z',
    );
  });

  test('si dueAt ya es posterior a after, avanza un solo periodo', () => {
    expect(nextDue('2026-10-22T07:00:00Z', 'diaria', { after: at('2026-01-01T00:00:00Z'), hasTime: true })).toBe(
      '2026-10-23T07:00:00.000Z',
    );
  });

  test('una tarea vencida desde hace años diaria no agota el tope', () => {
    const r = nextDue('2020-01-01T08:00:00Z', 'diaria', { after: at('2026-10-22T08:00:00Z'), hasTime: true });
    // 09:00 CEST on 2026-10-23
    expect(r).toBe('2026-10-23T07:00:00.000Z');
  });

  test('respeta la zona horaria indicada', () => {
    // 09:00 in New York (EDT, UTC-4) = 13:00Z
    expect(
      nextDue('2026-10-22T13:00:00Z', 'diaria', { after: at('2026-10-22T14:00:00Z'), hasTime: true, tz: 'America/New_York' }),
    ).toBe('2026-10-23T13:00:00.000Z');
  });

  test('rechaza un dueAt no válido', () => {
    expect(() => nextDue('nope', 'diaria', { after: new Date(), hasTime: true })).toThrow();
  });
});
