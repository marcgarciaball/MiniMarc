import { addDays } from '@/lib/agenda/week';
import type { WeeklyDigest } from '@/lib/db/settings';
import { toMadrid } from '@/lib/time';

export interface WeeklySchedule {
  weeklyDigest: WeeklyDigest;
  tz: string;
  /** Monday of the last week summarised by the weekly push, or null. */
  lastWeeklyDate: string | null;
}

/** Local weekday (0 = Sunday) and hour from which each option may send. */
export const WEEKLY_SCHEDULE = {
  lunes: { weekday: 1, hour: 8 },
  domingo: { weekday: 0, hour: 20 },
} as const;

/**
 * The Monday of the week to summarise now, or null. Monday from 08:00 summarises that week;
 * Sunday from 20:00, the next one. Local time in `tz` (the hourly cron runs at minute 0 UTC and
 * every zone used has whole-hour offsets, so it also fires on DST days). A failed run is retried
 * by the next hourly one the same day. Keyed by the week, not the day: a week already summarised
 * (also after switching Sunday → Monday) is never sent again.
 */
export function shouldSendWeekly(now: Date, s: WeeklySchedule): string | null {
  if (s.weeklyDigest === 'off') return null;
  const rule = WEEKLY_SCHEDULE[s.weeklyDigest];
  const local = toMadrid(now, s.tz);
  const weekday = new Date(`${local.date}T00:00:00Z`).getUTCDay();
  if (weekday !== rule.weekday || local.hour < rule.hour) return null;
  const week = s.weeklyDigest === 'lunes' ? local.date : addDays(local.date, 1);
  return s.lastWeeklyDate === week ? null : week;
}
