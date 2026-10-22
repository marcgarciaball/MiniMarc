/**
 * The hourly cron (/api/cron/morning), testable. Every run:
 *   1. Morning digest, once a day from the chosen hour (shouldSendDigest): build it, push it to
 *      every subscription, save last_digest_date (also with no subscriptions). If building fails
 *      the date is not saved, so the next hourly run retries.
 *   2. Maintenance, capped per run and never blocking the digest:
 *      a. Calendar sync retry for items with a syncError, and removal of events left on done,
 *         archived or deleted items (orphaned reminders, review I-3). Deleted items included.
 *      b. Purge of items soft-deleted more than 30 days ago, deleting their event and their photos'
 *         storage objects first (the item_photos rows go with the item, on delete cascade). If
 *         either fails, the item stays and the next hourly run retries.
 *      c. Link previews never stored (the save's `after` failed or 0009 came later), capped.
 *   3. Weekly summary, Monday 08:00 or Sunday 20:00 (shouldSendWeekly), after the daily one and
 *      apart from it: its own settings read, its own tag, and a failure never touches the daily
 *      result. last_weekly_date is saved before sending, so a week is never pushed twice.
 * The response holds counts only: no titles, no headline.
 */
import { timingSafeEqual, createHash } from 'node:crypto';
import type { CalendarGateway } from '@/lib/calendar/client';
import { taskSyncHook, wantsEvent } from '@/lib/calendar/taskSync';
import type { ItemsRepo } from '@/lib/db/items';
import type { PhotosRepo } from '@/lib/db/photos';
import type { PushSub } from '@/lib/db/push';
import type { Settings, SettingsRepo } from '@/lib/db/settings';
import type { Item } from '@/lib/db/types';
import type { Digest } from '@/lib/digest/build';
import { weekSummaryLine, type WeekDigest } from '@/lib/digest/week';
import type { PhotoStorage } from '@/lib/photos/storage';
import { dateWithPerson } from '@/lib/people/format';
import type { PushPayload } from '@/lib/push/send';
import { toMadrid } from '@/lib/time';
import { shouldSendDigest } from './shouldSendDigest';
import { shouldSendWeekly } from './shouldSendWeekly';

export const MAINTENANCE_CAP = 20;
export const PURGE_AFTER_DAYS = 30;

export interface MorningDeps {
  now: Date;
  settings: SettingsRepo;
  items: ItemsRepo;
  calendar: () => Promise<CalendarGateway>;
  buildDigest: (date: string, settings: Settings) => Promise<Digest>;
  /** The week starting on Monday `weekStart`. */
  buildWeekDigest: (weekStart: string, settings: Settings) => Promise<WeekDigest>;
  subscriptions: () => Promise<PushSub[]>;
  sendPush: (sub: PushSub, payload: PushPayload) => Promise<void>;
  /** Scoped to the user, like `items`. */
  photos: Pick<PhotosRepo, 'listPhotos'>;
  storage: Pick<PhotoStorage, 'remove'>;
  /** Fetches link previews that were never stored (fallback for `after`); returns how many. */
  refreshPreviews?: () => Promise<number>;
}

export interface MorningResult {
  digest: 'sent' | 'not_due' | 'failed';
  pushed: number;
  pushFailed: number;
  weekly: 'sent' | 'not_due' | 'failed';
  weeklyPushed: number;
  synced: number;
  syncFailed: number;
  purged: number;
  /** Link previews filled in by this run. */
  previews: number;
  maintenanceFailed: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "Hoy", or the date when there is one today: "Hoy: aniversario con Ainhoa (5 años)" (name and
 * label only, never notes). A second date today adds "y 1 más".
 */
export function pushTitle(d: Digest): string {
  const today = d.dates.filter((x) => x.daysUntil === 0);
  if (today.length === 0) return 'Hoy';
  const more = today.length > 1 ? ` y ${today.length - 1} más` : '';
  return `Hoy: ${dateWithPerson(today[0])}${more}`;
}

/** Short push: the title, the headline and counts. No task or event titles (Trabajo stays private). */
export function digestPayload(d: Digest): PushPayload {
  const tasks = d.tasks.personal.items.length + d.tasks.personal.more + d.tasks.trabajo.items.length + d.tasks.trabajo.more;
  const counts = [
    d.events.length ? plural(d.events.length, 'cita', 'citas') : '',
    tasks ? plural(tasks, 'tarea', 'tareas') : '',
    d.dates.length ? plural(d.dates.length, 'fecha', 'fechas') : '',
    d.unclassified ? `${d.unclassified} sin clasificar` : '',
  ].filter(Boolean);
  return {
    title: pushTitle(d),
    body: counts.length ? `${d.headline}\n${counts.join(' · ')}` : d.headline,
    url: '/hoy',
    tag: `digest-${d.date}`,
  };
}

/** "Tu semana": the AI line, or counts when there is none. No task, event or gift titles. Opens /semana. */
export function weeklyPayload(w: WeekDigest): PushPayload {
  return {
    title: 'Tu semana',
    body: w.headline ?? weekSummaryLine(w),
    url: `/semana?w=${w.weekStart}`,
    tag: `weekly-${w.weekStart}`,
  };
}

async function sendWeekly(deps: MorningDeps, r: MorningResult): Promise<void> {
  try {
    const settings = await deps.settings.get();
    const week = shouldSendWeekly(deps.now, settings);
    if (!week) {
      r.weekly = 'not_due';
      return;
    }
    const payload = weeklyPayload(await deps.buildWeekDigest(week, settings));
    const subs = await deps.subscriptions();
    // Saved first: if it cannot be saved, nothing goes out (the next hour retries) rather than
    // a push every hour.
    await deps.settings.update({ lastWeeklyDate: week });
    const results = await Promise.allSettled(subs.map((s) => deps.sendPush(s, payload)));
    r.weeklyPushed = results.filter((x) => x.status === 'fulfilled').length;
    r.weekly = 'sent';
  } catch {
    r.weekly = 'failed';
  }
}

async function sendDigest(deps: MorningDeps, r: MorningResult): Promise<void> {
  let settings: Settings;
  try {
    settings = await deps.settings.get();
  } catch {
    r.digest = 'failed';
    return;
  }
  if (!shouldSendDigest(deps.now, settings)) {
    r.digest = 'not_due';
    return;
  }
  const date = toMadrid(deps.now, settings.tz).date;
  let payload: PushPayload;
  let subs: PushSub[];
  try {
    payload = digestPayload(await deps.buildDigest(date, settings));
    subs = await deps.subscriptions();
  } catch {
    r.digest = 'failed';
    return;
  }
  const results = await Promise.allSettled(subs.map((s) => deps.sendPush(s, payload)));
  r.pushed = results.filter((x) => x.status === 'fulfilled').length;
  r.pushFailed = results.length - r.pushed;
  try {
    await deps.settings.update({ lastDigestDate: date });
    r.digest = 'sent';
  } catch {
    r.digest = 'failed';
  }
}

function memo<T>(load: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | undefined;
  return () => (p ??= load());
}

async function maintain(deps: MorningDeps, r: MorningResult): Promise<void> {
  const sync = taskSyncHook(memo(deps.calendar));

  /** Syncs one item and stores the outcome; true when Calendar now matches the item. */
  async function resync(item: Item): Promise<boolean> {
    const res = await sync(item);
    if (res.eventId !== item.calendarEventId || res.error !== item.syncError) {
      await deps.items.updateItem(item.id, { calendarEventId: res.eventId, syncError: res.error });
    }
    return res.error === null;
  }

  try {
    const pending = (await deps.items.listCalendarState())
      .filter((i) => i.syncError !== null || !wantsEvent(i))
      .slice(0, MAINTENANCE_CAP);
    for (const item of pending) {
      if (await resync(item)) r.synced++;
      else r.syncFailed++;
    }
  } catch {
    r.maintenanceFailed = true;
  }

  try {
    const old = (await deps.items.listDeletedBefore(PURGE_AFTER_DAYS)).slice(0, MAINTENANCE_CAP);
    for (const item of old) {
      if (item.calendarEventId && !(await resync(item))) continue;
      const photos = await deps.photos.listPhotos(item.id);
      if (photos.length > 0) {
        try {
          await deps.storage.remove(photos.map((p) => p.path));
        } catch {
          r.maintenanceFailed = true;
          continue;
        }
      }
      await deps.items.hardDelete(item.id);
      r.purged++;
    }
  } catch {
    r.maintenanceFailed = true;
  }

  if (deps.refreshPreviews) {
    try {
      r.previews = await deps.refreshPreviews();
    } catch {
      // Before 0009 (no link_site column) or a database hiccup: previews are only an extra.
    }
  }
}

export async function runMorning(deps: MorningDeps): Promise<MorningResult> {
  const r: MorningResult = {
    digest: 'not_due',
    pushed: 0,
    pushFailed: 0,
    weekly: 'not_due',
    weeklyPushed: 0,
    synced: 0,
    syncFailed: 0,
    purged: 0,
    previews: 0,
    maintenanceFailed: false,
  };
  await sendDigest(deps, r);
  await sendWeekly(deps, r);
  await maintain(deps, r);
  return r;
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/** `Authorization: Bearer <CRON_SECRET>`, compared in constant time. No secret configured → always false. */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  return timingSafeEqual(digest(header ?? ''), digest(expected));
}

export async function handleMorningRequest(
  req: Request,
  deps: { secret: string | undefined; run: () => Promise<unknown> },
): Promise<Response> {
  if (!isCronAuthorized(req.headers.get('Authorization'), deps.secret)) {
    return Response.json({ message: 'No autorizado' }, { status: 401 });
  }
  try {
    return Response.json(await deps.run());
  } catch {
    return Response.json({ message: 'Error interno' }, { status: 500 });
  }
}
