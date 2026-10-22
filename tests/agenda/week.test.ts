import { describe, expect, it } from 'vitest';
import {
  addDays,
  blockPosition,
  dayDots,
  dayTitle,
  eventDates,
  isAllDay,
  layoutColumns,
  layoutDay,
  monthTitle,
  nowMinutes,
  parseDayParam,
  parseWeekParam,
  weekLabel,
  toAgendaItems,
  weekRange,
  type AgendaItem,
} from '@/lib/agenda/week';
import type { CalendarEvent } from '@/lib/calendar/client';
import { madridToUtc } from '@/lib/time';

const at = (date: string, time: string) => madridToUtc(date, time).toISOString();

function item(over: Partial<AgendaItem> & { id: string }): AgendaItem {
  return {
    calendarId: 'primary',
    title: 'Cita',
    startsAt: at('2026-10-27', '09:00'),
    endsAt: at('2026-10-27', '10:00'),
    allDay: false,
    isTask: false,
    isPrimary: true,
    hasRequiredReminders: true,
    ...over,
  };
}

describe('weekRange', () => {
  it('de lunes 00:00 a lunes 00:00 en Madrid', () => {
    const w = weekRange('2026-10-29');
    expect(w.start).toBe('2026-10-26');
    expect(w.days).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(w.from.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-11-01T23:00:00.000Z');
  });

  it('la semana del cambio de hora (domingo 2026-10-25) empieza en verano y acaba en invierno', () => {
    const w = weekRange('2026-10-25');
    expect(w.start).toBe('2026-10-19');
    expect(w.days[6]).toBe('2026-10-25');
    expect(w.from.toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    // 7 days and one extra hour.
    expect(w.to.getTime() - w.from.getTime()).toBe((7 * 24 + 1) * 3_600_000);
  });

  it('un lunes es el inicio de su propia semana', () => {
    expect(weekRange('2026-10-26').start).toBe('2026-10-26');
  });

  it('cruza fin de año', () => {
    const w = weekRange('2027-01-01');
    expect(w.start).toBe('2026-12-28');
    expect(w.days).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    expect(w.to.toISOString()).toBe('2027-01-03T23:00:00.000Z');
  });

  it('cruza fin de mes (y el cambio de hora de marzo)', () => {
    const w = weekRange('2026-04-01');
    expect(w.start).toBe('2026-03-30');
    expect(w.from.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(weekRange('2026-03-29').from.toISOString()).toBe('2026-03-22T23:00:00.000Z');
  });
});

describe('addDays / parseDayParam / títulos', () => {
  it('suma días de calendario', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('acepta una fecha válida y si no, hoy', () => {
    expect(parseDayParam('2026-11-03', '2026-10-22')).toBe('2026-11-03');
    expect(parseDayParam('2026-02-30', '2026-10-22')).toBe('2026-10-22');
    expect(parseDayParam(['2026-11-03'], '2026-10-22')).toBe('2026-10-22');
    expect(parseDayParam(undefined, '2026-10-22')).toBe('2026-10-22');
  });

  it('mes y año, y el día como en Calendario', () => {
    expect(monthTitle('2026-10-27')).toBe('Octubre 2026');
    expect(monthTitle('2027-01-02')).toBe('Enero 2027');
    expect(dayTitle('2026-10-27')).toBe('Martes 27');
    expect(dayTitle('2026-11-01')).toBe('Domingo 1');
  });
});

describe('parseWeekParam / weekLabel (/semana)', () => {
  it('?w= da el lunes de su semana; si no es una fecha válida, la semana de hoy', () => {
    expect(parseWeekParam('2026-10-26', '2026-10-22')).toBe('2026-10-26');
    expect(parseWeekParam('2026-10-29', '2026-10-22')).toBe('2026-10-26');
    expect(parseWeekParam('2026-11-01', '2026-10-22')).toBe('2026-10-26');
    expect(parseWeekParam('2026-13-01', '2026-10-22')).toBe('2026-10-19');
    expect(parseWeekParam(['2026-10-26'], '2026-10-22')).toBe('2026-10-19');
    expect(parseWeekParam(undefined, '2026-10-25')).toBe('2026-10-19');
  });

  it('rango corto de la semana', () => {
    expect(weekLabel('2026-10-19')).toBe('19–25 de octubre');
    expect(weekLabel('2026-10-26')).toBe('26 de octubre – 1 de noviembre');
    expect(weekLabel('2026-12-28')).toBe('28 de diciembre – 3 de enero');
  });
});

describe('isAllDay / eventDates', () => {
  it('de medianoche a medianoche de Madrid es de día completo', () => {
    expect(isAllDay({ startsAt: at('2026-10-25', '00:00'), endsAt: at('2026-10-26', '00:00') })).toBe(true);
    expect(isAllDay({ startsAt: at('2026-10-25', '00:00'), endsAt: at('2026-10-25', '01:00') })).toBe(false);
  });

  it('días de Madrid que toca un evento (el fin a medianoche no cuenta)', () => {
    expect(eventDates({ startsAt: at('2026-10-27', '22:00'), endsAt: at('2026-10-28', '01:00') })).toEqual([
      '2026-10-27',
      '2026-10-28',
    ]);
    expect(eventDates({ startsAt: at('2026-10-27', '00:00'), endsAt: at('2026-10-29', '00:00') })).toEqual([
      '2026-10-27',
      '2026-10-28',
    ]);
    expect(eventDates({ startsAt: at('2026-10-27', '09:00'), endsAt: at('2026-10-27', '09:00') })).toEqual([
      '2026-10-27',
    ]);
  });
});

describe('blockPosition', () => {
  it('posición y alto en minutos desde la medianoche de Madrid', () => {
    expect(blockPosition({ startsAt: at('2026-10-27', '09:00'), endsAt: at('2026-10-27', '10:30') }, '2026-10-27')).toEqual({
      top: 540,
      height: 90,
    });
  });

  it('el día del cambio de hora usa la hora de reloj, no las horas transcurridas', () => {
    expect(blockPosition({ startsAt: at('2026-10-25', '10:00'), endsAt: at('2026-10-25', '11:00') }, '2026-10-25')).toEqual({
      top: 600,
      height: 60,
    });
  });

  it('un evento que cruza la medianoche se corta en cada día', () => {
    const ev = { startsAt: at('2026-10-27', '23:00'), endsAt: at('2026-10-28', '01:30') };
    expect(blockPosition(ev, '2026-10-27')).toEqual({ top: 1380, height: 60 });
    expect(blockPosition(ev, '2026-10-28')).toEqual({ top: 0, height: 90 });
    expect(blockPosition(ev, '2026-10-29')).toBeNull();
  });

  it('los eventos muy cortos tienen un alto mínimo legible', () => {
    expect(blockPosition({ startsAt: at('2026-10-27', '09:00'), endsAt: at('2026-10-27', '09:00') }, '2026-10-27')).toEqual({
      top: 540,
      height: 20,
    });
  });
});

describe('layoutColumns', () => {
  it('los eventos que se solapan van en columnas, uno al lado del otro', () => {
    const out = layoutColumns([
      { id: 'a', top: 540, height: 60 },
      { id: 'b', top: 570, height: 60 },
      { id: 'c', top: 630, height: 30 },
    ]);
    expect(out.map(({ id, col, cols }) => ({ id, col, cols }))).toEqual([
      { id: 'a', col: 0, cols: 2 },
      { id: 'b', col: 1, cols: 2 },
      { id: 'c', col: 0, cols: 1 },
    ]);
  });

  it('reutiliza una columna libre dentro del mismo grupo', () => {
    const out = layoutColumns([
      { id: 'b', top: 540, height: 60 },
      { id: 'a', top: 540, height: 120 },
      { id: 'c', top: 600, height: 60 },
    ]);
    expect(Object.fromEntries(out.map((o) => [o.id, [o.col, o.cols]]))).toEqual({
      a: [0, 2],
      b: [1, 2],
      c: [1, 2],
    });
  });

  it('tres a la vez → tres columnas', () => {
    const out = layoutColumns([
      { id: 'a', top: 0, height: 60 },
      { id: 'b', top: 10, height: 60 },
      { id: 'c', top: 20, height: 60 },
    ]);
    expect(out.map((o) => [o.col, o.cols])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
  });
});

describe('layoutDay', () => {
  it('separa los de día completo y coloca el resto', () => {
    const day = layoutDay(
      [
        item({ id: 'fiesta', allDay: true, startsAt: at('2026-10-27', '00:00'), endsAt: at('2026-10-28', '00:00') }),
        item({ id: 'medico' }),
        item({ id: 'otro', startsAt: at('2026-10-28', '09:00'), endsAt: at('2026-10-28', '10:00') }),
      ],
      '2026-10-27',
    );
    expect(day.allDay.map((e) => e.id)).toEqual(['fiesta']);
    expect(day.blocks.map((b) => [b.item.id, b.top, b.height, b.col, b.cols])).toEqual([['medico', 540, 60, 0, 1]]);
  });
});

describe('dayDots', () => {
  it('hasta 3 puntos por día, con las tareas aparte', () => {
    const dots = dayDots(
      [
        item({ id: '1' }),
        item({ id: '2', isTask: true, startsAt: at('2026-10-27', '11:00'), endsAt: at('2026-10-27', '11:30') }),
        item({ id: '3', startsAt: at('2026-10-27', '12:00'), endsAt: at('2026-10-27', '13:00') }),
        item({ id: '4', startsAt: at('2026-10-27', '18:00'), endsAt: at('2026-10-27', '19:00') }),
        item({ id: '5', startsAt: at('2026-10-29', '18:00'), endsAt: at('2026-10-29', '19:00') }),
        item({ id: '6', startsAt: at('2026-10-31', '23:00'), endsAt: at('2026-11-01', '01:00') }),
      ],
      weekRange('2026-10-27').days,
    );
    expect(dots).toEqual({
      '2026-10-26': [],
      '2026-10-27': ['event', 'task', 'event'],
      '2026-10-28': [],
      '2026-10-29': ['event'],
      '2026-10-30': [],
      '2026-10-31': ['event'],
      '2026-11-01': ['event'],
    });
  });
});

describe('nowMinutes', () => {
  it('minutos de reloj de Madrid si es ese día, si no null', () => {
    expect(nowMinutes(new Date(at('2026-10-27', '16:42')), '2026-10-27')).toBe(1002);
    expect(nowMinutes(new Date(at('2026-10-27', '16:42')), '2026-10-28')).toBeNull();
  });
});

describe('toAgendaItems', () => {
  const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
    id: 'e',
    title: 'Cita',
    startsAt: new Date(at('2026-10-27', '09:00')),
    endsAt: new Date(at('2026-10-27', '10:00')),
    calendarId: 'marc@gmail.com',
    hasRequiredReminders: true,
    ...over,
  });

  it('marca tareas, calendario principal y día completo; título vacío → (Sin título)', () => {
    const items = toAgendaItems(
      [
        ev({ id: 'a', primary: true, location: 'Clínica' }),
        ev({ id: 'b', calendarId: 'tareas-id', title: '' }),
        ev({ id: 'c', startsAt: new Date(at('2026-10-27', '00:00')), endsAt: new Date(at('2026-10-28', '00:00')) }),
      ],
      'tareas-id',
    );
    expect(items).toEqual([
      {
        id: 'a',
        calendarId: 'marc@gmail.com',
        title: 'Cita',
        location: 'Clínica',
        startsAt: at('2026-10-27', '09:00'),
        endsAt: at('2026-10-27', '10:00'),
        allDay: false,
        isTask: false,
        isPrimary: true,
        hasRequiredReminders: true,
      },
      expect.objectContaining({ id: 'b', calendarId: 'tareas-id', title: '(Sin título)', isTask: true, isPrimary: false }),
      expect.objectContaining({ id: 'c', allDay: true }),
    ]);
  });
});
