import { toMadrid } from '@/lib/time';

export interface DigestSchedule {
  /** Local hour (0-23) from which the morning digest may go out. */
  digestHour: number;
  tz: string;
  /** Local date ("YYYY-MM-DD") of the last digest sent, or null. */
  lastDigestDate: string | null;
}

/**
 * True once per local day, from `digestHour` on. The cron runs hourly at minute 0 UTC; every
 * zone the app uses has whole-hour offsets, so the run at local `digestHour`:00 fires, also on
 * DST days. A failed run is retried by the next hourly one (later the same day).
 */
export function shouldSendDigest(now: Date, s: DigestSchedule): boolean {
  const local = toMadrid(now, s.tz);
  return local.hour >= s.digestHour && s.lastDigestDate !== local.date;
}
