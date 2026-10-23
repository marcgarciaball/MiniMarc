import { DEFAULT_TZ, madridDateTime, madridToUtc } from '@/lib/time';

export const REPEATS = ['diaria', 'semanal', 'mensual', 'anual'] as const;
export type Repeat = (typeof REPEATS)[number];

export const REPEAT_LABELS: Record<Repeat, string> = {
  diaria: 'Cada día',
  semanal: 'Cada semana',
  mensual: 'Cada mes',
  anual: 'Cada año',
};

export function isRepeat(v: unknown): v is Repeat {
  return typeof v === 'string' && (REPEATS as readonly string[]).includes(v);
}

const MAX_STEPS = 1000;
const DAY_MS = 86_400_000;

// Lower bounds (ms) of one period, used only to skip ahead for long-overdue items.
const MIN_PERIOD_MS: Record<Repeat, number> = {
  diaria: DAY_MS,
  semanal: 7 * DAY_MS,
  mensual: 28 * DAY_MS,
  anual: 365 * DAY_MS,
};

const pad = (n: number) => String(n).padStart(2, '0');

function daysInMonth(year: number, month: number): number {
  // month is 1-12; day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Calendar date `k` periods after (y, m, d). Month/year steps clamp to the target month's last day. */
function addPeriods(y: number, m: number, d: number, repeat: Repeat, k: number): string {
  if (repeat === 'diaria' || repeat === 'semanal') {
    const t = new Date(Date.UTC(y, m - 1, d + k * (repeat === 'diaria' ? 1 : 7)));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  const months = (repeat === 'mensual' ? k : 12 * k) + (m - 1);
  const ty = y + Math.floor(months / 12);
  const tm = (((months % 12) + 12) % 12) + 1;
  return `${ty}-${pad(tm)}-${pad(Math.min(d, daysInMonth(ty, tm)))}`;
}

/**
 * Next occurrence of a repeating item: the first one strictly after `opts.after`, ISO UTC.
 * Works on local wall-clock components so the local time survives DST changes, and
 * computes every step from the original day-of-month so month-end clamping is not sticky.
 */
export function nextDue(
  dueAt: string,
  repeat: Repeat,
  opts: { after: Date; hasTime: boolean; tz?: string },
): string {
  const tz = opts.tz ?? DEFAULT_TZ;
  const start = new Date(dueAt);
  if (Number.isNaN(start.getTime())) throw new Error(`Fecha no válida: ${dueAt}`);

  const local = madridDateTime(start, tz);
  const time = opts.hasTime ? local.time : '00:00';
  const [y, m, d] = local.date.split('-').map(Number);

  // Skip ahead without overshooting (periods are never shorter than MIN_PERIOD_MS), then step.
  const elapsed = opts.after.getTime() - start.getTime();
  let k = Math.max(1, Math.floor(elapsed / MIN_PERIOD_MS[repeat]) - 1);
  for (let i = 0; i < MAX_STEPS; i++, k++) {
    const candidate = madridToUtc(addPeriods(y, m, d, repeat, k), time, tz);
    if (candidate.getTime() > opts.after.getTime()) return candidate.toISOString();
  }
  throw new Error('No se pudo calcular la siguiente repetición');
}
