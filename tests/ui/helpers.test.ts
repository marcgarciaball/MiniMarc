import { describe, expect, it } from 'vitest';
import { destinationLabel, formatBirthday, formatDay, formatDue, originalText } from '@/lib/format';
import { sectionFor, tabFor } from '@/lib/nav';
import { madridDateTime } from '@/lib/time';
import { lockAxis, project, swipeOffset, swipeOutcome } from '@/components/ui/swipePhysics';

describe('formatDay / formatDue', () => {
  const today = '2026-10-21';
  it.each([
    ['2026-10-21', 'Hoy'],
    ['2026-10-22', 'Mañana'],
    ['2026-10-20', 'Ayer'],
    ['2026-10-24', 'Sábado'],
    ['2026-11-02', '2 de noviembre'],
    ['2027-01-08', '8 de enero de 2027'],
  ])('%s → %s', (date, label) => expect(formatDay(date, today)).toBe(label));

  it('shows the Madrid time only for items with time', () => {
    expect(formatDue({ dueAt: '2026-10-21T16:00:00.000Z', hasTime: true }, today)).toEqual({ day: 'Hoy', time: '18:00' });
    expect(formatDue({ dueAt: '2026-10-21T22:00:00.000Z', hasTime: false }, today)).toEqual({ day: 'Mañana', time: undefined });
    expect(formatDue({ dueAt: null, hasTime: false }, today)).toEqual({});
  });

  it('formats birthdays without the year', () => {
    expect(formatBirthday('1990-11-02')).toBe('2 de noviembre');
  });

  it('madridDateTime gives the wall clock in Madrid', () => {
    expect(madridDateTime(new Date('2026-10-22T07:30:00Z'))).toEqual({ date: '2026-10-22', time: '09:30' });
  });
});

describe('navigation sections', () => {
  it.each([
    ['/tareas', 'tareas', 'tareas'],
    ['/agenda', 'agenda', 'agenda'],
    ['/semana', 'semana', 'hoy'],
    ['/ajustes/iphone', 'ajustes', 'ajustes'],
    ['/regalos/abc', 'regalos', 'listas'],
    ['/libros', 'libros', 'listas'],
    ['/personas', 'personas', 'listas'],
    ['/personas/abc', 'personas', 'listas'],
    ['/sin-clasificar', 'sin-clasificar', 'listas'],
    ['/listas', 'listas', 'listas'],
    ['/bandeja', 'bandeja', 'listas'],
    ['/bandeja/papelera', 'bandeja', 'listas'],
    ['/login', null, ''],
  ])('%s', (path, section, tab) => {
    expect(sectionFor(path)).toBe(section);
    expect(tabFor(sectionFor(path))).toBe(tab);
  });
});

describe('swipe physics', () => {
  const w = 360;
  it('locks the axis only after a few px', () => {
    expect(lockAxis(3, 2)).toBeNull();
    expect(lockAxis(12, 3)).toBe('x');
    expect(lockAxis(3, -12)).toBe('y');
  });

  it('follows the finger, then resists', () => {
    expect(swipeOffset(100, w)).toBe(100);
    expect(swipeOffset(-500, w)).toBeLessThan(-w * 0.8);
    expect(swipeOffset(-500, w)).toBeGreaterThan(-w);
  });

  it('commits by distance or by flick, never against the drag', () => {
    expect(swipeOutcome(200, 0, w)).toBe('complete');
    expect(swipeOutcome(-200, 0, w)).toBe('archive');
    expect(swipeOutcome(60, 0, w)).toBeNull();
    expect(swipeOutcome(60, 1.2, w)).toBe('complete');
    expect(swipeOutcome(200, -3, w)).toBeNull();
    expect(project(1)).toBeCloseTo(99);
  });
});

describe('destinationLabel (Bandeja)', () => {
  const base = { needsReview: false, area: null, personId: null } as const;
  it.each([
    [{ ...base, type: 'tarea', area: 'personal' }, undefined, 'Tareas · Personal'],
    [{ ...base, type: 'tarea', area: null }, undefined, 'Tareas · Personal'],
    [{ ...base, type: 'tarea', area: 'trabajo' }, undefined, 'Tareas · Trabajo'],
    [{ ...base, type: 'idea' }, undefined, 'Ideas'],
    [{ ...base, type: 'compra' }, undefined, 'Compras'],
    [{ ...base, type: 'regalo', personId: 'p1' }, 'Ainhoa', 'Regalo · Ainhoa'],
    [{ ...base, type: 'regalo' }, undefined, 'Regalos'],
    [{ ...base, type: 'tarea', area: 'trabajo', needsReview: true }, undefined, 'Sin clasificar'],
  ] as const)('caso %#', (item, person, label) => {
    expect(destinationLabel(item, person)).toBe(label);
  });
});

describe('originalText (hoja de edición, "Texto original")', () => {
  it.each([
    [{ title: 'Leche', sourceText: 'comprar leche y llamar a mamá' }, 'comprar leche y llamar a mamá'],
    [{ title: 'comprar leche', sourceText: 'comprar leche' }, null],
    [{ title: 'Leche', sourceText: null }, null],
    [{ title: 'Leche', sourceText: '   ' }, null],
  ] as const)('caso %#', (item, shown) => {
    expect(originalText(item)).toBe(shown);
  });
});
