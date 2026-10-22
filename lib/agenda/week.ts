/**
 * Pure helpers behind the Agenda (week strip + day timeline), all in Madrid wall-clock time.
 * Dates are "YYYY-MM-DD"; event instants travel as ISO strings so they cross the
 * server → client boundary as they are.
 */
import type { CalendarEvent } from '@/lib/calendar/client';
import { isValidDate, madridDateTime, madridToUtc } from '@/lib/time';

/** One event as the Agenda screen sees it (serialisable). */
export interface AgendaItem {
  id: string;
  title: string;
  location?: string;
  /** ISO instants. */
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  /** From the "Tareas" calendar (timed tasks synced by the app). */
  isTask: boolean;
  /** From Marc's primary calendar: the only place "Añadir avisos" may write. */
  isPrimary: boolean;
  hasRequiredReminders: boolean;
}

type Span = { startsAt: string | Date; endsAt: string | Date };

const DAY_MINUTES = 24 * 60;
/** Shortest block drawn, so a 0–15 min event still shows its title. */
export const MIN_BLOCK_MINUTES = 20;
export const MAX_DOTS = 3;

/** "YYYY-MM-DD" + n days (calendar arithmetic, no time zone involved). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The Monday-first week holding `date`: its 7 days and Madrid Monday 00:00 → next Monday 00:00. */
export function weekRange(date: string): { start: string; days: string[]; from: Date; to: Date } {
  const start = addDays(date, -weekdayIndex(date));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, days, from: madridToUtc(start, '00:00'), to: madridToUtc(addDays(start, 7), '00:00') };
}

/** The `?d=` search param if it is a real date, else today. */
export function parseDayParam(param: string | string[] | undefined, today: string): string {
  return typeof param === 'string' && isValidDate(param) ? param : today;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });
const weekdayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'UTC' });

/** "Octubre 2026". */
export function monthTitle(date: string): string {
  return `${capitalize(monthFmt.format(utc(date)))} ${date.slice(0, 4)}`;
}

/** "Martes 27". */
export function dayTitle(date: string): string {
  return `${capitalize(weekdayFmt.format(utc(date)))} ${Number(date.slice(8, 10))}`;
}

/** Spanish weekday initials, Monday first. */
export const WEEKDAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

const asDate = (v: string | Date) => (typeof v === 'string' ? new Date(v) : v);

function wall(v: string | Date): { date: string; minutes: number } {
  const { date, time } = madridDateTime(asDate(v));
  return { date, minutes: Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) };
}

/** Madrid midnight to Madrid midnight (how Calendar's all-day events arrive from the gateway). */
export function isAllDay(ev: Span): boolean {
  const s = wall(ev.startsAt);
  const e = wall(ev.endsAt);
  return s.minutes === 0 && e.minutes === 0 && asDate(ev.endsAt) > asDate(ev.startsAt);
}

/** Madrid days the event touches; an end at exactly midnight does not reach the next day. */
export function eventDates(ev: Span): string[] {
  const s = wall(ev.startsAt);
  const e = wall(ev.endsAt);
  let last = e.date;
  if (e.minutes === 0 && asDate(ev.endsAt) > asDate(ev.startsAt)) last = addDays(e.date, -1);
  if (last < s.date) last = s.date;
  const out: string[] = [];
  // Bounded: a runaway multi-month event would otherwise loop for long.
  for (let d = s.date; d <= last && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Where a timed event sits on `date`'s timeline, in wall-clock minutes from Madrid midnight
 * (so on a DST day 10:00 is still at 600). Cut at the day's edges; null if it is not on that day.
 */
export function blockPosition(ev: Span, date: string): { top: number; height: number } | null {
  if (!eventDates(ev).includes(date)) return null;
  const s = wall(ev.startsAt);
  const e = wall(ev.endsAt);
  const top = s.date < date ? 0 : s.minutes;
  const bottom = e.date > date ? DAY_MINUTES : e.minutes;
  const height = Math.max(bottom - top, MIN_BLOCK_MINUTES);
  return { top: Math.min(top, DAY_MINUTES - MIN_BLOCK_MINUTES), height };
}

/**
 * Overlapping blocks side by side: groups of transitively overlapping blocks share a column
 * count, and each block takes the first column free at its start. Output is in start order.
 */
export function layoutColumns<T extends { top: number; height: number }>(
  blocks: T[],
): (T & { col: number; cols: number })[] {
  const sorted = [...blocks].sort((a, b) => a.top - b.top || b.height - a.height);
  const out: (T & { col: number; cols: number })[] = [];
  let group: (T & { col: number; cols: number })[] = [];
  let colEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = () => {
    for (const b of group) b.cols = colEnds.length;
    group = [];
    colEnds = [];
  };

  for (const block of sorted) {
    if (block.top >= groupEnd) {
      closeGroup();
      groupEnd = -Infinity;
    }
    let col = colEnds.findIndex((end) => end <= block.top);
    if (col === -1) col = colEnds.length;
    colEnds[col] = block.top + block.height;
    const placed = { ...block, col, cols: 1 };
    group.push(placed);
    out.push(placed);
    groupEnd = Math.max(groupEnd, block.top + block.height);
  }
  closeGroup();
  return out;
}

export interface DayBlock {
  item: AgendaItem;
  top: number;
  height: number;
  col: number;
  cols: number;
}

/** One day of the timeline: the all-day band and the positioned, column-laid blocks. */
export function layoutDay(items: AgendaItem[], date: string): { allDay: AgendaItem[]; blocks: DayBlock[] } {
  const allDay: AgendaItem[] = [];
  const timed: { item: AgendaItem; top: number; height: number }[] = [];
  for (const item of items) {
    if (item.allDay) {
      if (eventDates(item).includes(date)) allDay.push(item);
      continue;
    }
    const pos = blockPosition(item, date);
    if (pos) timed.push({ item, ...pos });
  }
  return { allDay, blocks: layoutColumns(timed) };
}

export type DotKind = 'event' | 'task';

/** Up to 3 dots per day of `days`, in start order; tasks get their own (lighter) kind. */
export function dayDots(items: AgendaItem[], days: string[]): Record<string, DotKind[]> {
  const dots: Record<string, DotKind[]> = Object.fromEntries(days.map((d) => [d, []]));
  const sorted = [...items].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  for (const item of sorted) {
    for (const d of eventDates(item)) {
      const list = dots[d];
      if (list && list.length < MAX_DOTS) list.push(item.isTask ? 'task' : 'event');
    }
  }
  return dots;
}

/** Wall-clock minutes of `now` in Madrid when it falls on `date`, else null. */
export function nowMinutes(now: Date, date: string): number | null {
  const w = wall(now);
  return w.date === date ? w.minutes : null;
}

/** Calendar's events → what the Agenda screen draws. */
export function toAgendaItems(events: CalendarEvent[], tasksCalendarId: string | null): AgendaItem[] {
  return events.map((ev) => ({
    id: ev.id,
    title: ev.title.trim() || '(Sin título)',
    ...(ev.location && { location: ev.location }),
    startsAt: ev.startsAt.toISOString(),
    endsAt: ev.endsAt.toISOString(),
    allDay: isAllDay(ev),
    isTask: tasksCalendarId !== null && ev.calendarId === tasksCalendarId,
    isPrimary: ev.primary === true,
    hasRequiredReminders: ev.hasRequiredReminders,
  }));
}

/** "09:00" in Madrid. */
export function clockTime(iso: string): string {
  return madridDateTime(new Date(iso)).time;
}
