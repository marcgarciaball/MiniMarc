export const DEFAULT_TZ = 'Europe/Madrid';

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

function wallParts(d: Date, tz: string): Parts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as Parts;
}

/** Offset (ms) of `tz` relative to UTC at instant `d`. */
function offsetMs(d: Date, tz: string): number {
  const p = wallParts(d, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date (YYYY-MM-DD) and hour (0-23) of `d` in `tz`. */
export function toMadrid(d: Date, tz: string = DEFAULT_TZ): { date: string; hour: number } {
  const p = wallParts(d, tz);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, hour: p.hour };
}

/** Converts a wall-clock date ("YYYY-MM-DD") and time ("HH:mm") in `tz` to a UTC instant. */
export function madridToUtc(dateStr: string, time: string, tz: string = DEFAULT_TZ): Date {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dm || !tm) throw new Error(`Fecha u hora no válida: ${dateStr} ${time}`);
  const wall = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);
  // First guess uses the offset at the wall time; refine with the offset at the guessed instant (DST edges).
  const guess = wall - offsetMs(new Date(wall), tz);
  return new Date(wall - offsetMs(new Date(guess), tz));
}

/** "miércoles, 21 de octubre": long Spanish date in the given zone (Madrid by default). */
export function formatLongDate(d: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(d);
}

/** Local date ("YYYY-MM-DD") and time ("HH:mm") of `d` in `tz`; feeds date/time inputs. */
export function madridDateTime(d: Date, tz: string = DEFAULT_TZ): { date: string; time: string } {
  const p = wallParts(d, tz);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** True for a real calendar date written "YYYY-MM-DD". */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Wall-clock date (+ optional "HH:mm") in Madrid → an item's `dueAt` (UTC ISO) and `hasTime`.
 * A date without time is stored as Madrid midnight. Empty date → no due date.
 */
export function toDue(date: string, time: string, tz: string = DEFAULT_TZ): { dueAt: string | null; hasTime: boolean } {
  if (!date) return { dueAt: null, hasTime: false };
  if (!isValidDate(date)) throw new Error(`Fecha no válida: ${date}`);
  return { dueAt: madridToUtc(date, time || '00:00', tz).toISOString(), hasTime: Boolean(time) };
}
