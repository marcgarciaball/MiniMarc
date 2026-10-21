import { toMadrid } from '@/lib/time';

/** Today's date in Madrid ("YYYY-MM-DD"). Call after a request read (cookies) so it renders per request. */
export function madridToday(): string {
  return toMadrid(new Date()).date;
}
