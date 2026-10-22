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
import type { PhotoStorage } from '@/lib/photos/storage';
import type { PushPayload } from '@/lib/push/send';
import { toMadrid } from '@/lib/time';
import { shouldSendDigest } from './shouldSendDigest';

export const MAINTENANCE_CAP = 20;
export const PURGE_AFTER_DAYS = 30;

export interface MorningDeps {
  now: Date;
  settings: SettingsRepo;
  items: ItemsRepo;
  calendar: () => Promise<CalendarGateway>;
  buildDigest: (date: string, settings: Settings) => Promise<Digest>;
  subscriptions: () => Promise<PushSub[]>;
  sendPush: (sub: PushSub, payload: PushPayload) => Promise<void>;
  /** Scoped to the user, like `items`. */
  photos: Pick<PhotosRepo, 'listPhotos'>;
  storage: Pick<PhotoStorage, 'remove'>;
}

export interface MorningResult {
  digest: 'sent' | 'not_due' | 'failed';
  pushed: number;
  pushFailed: number;
  synced: number;
  syncFailed: number;
  purged: number;
  maintenanceFailed: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Short push: "Hoy", the headline and counts. No task or event titles (Trabajo stays private). */
export function digestPayload(d: Digest): PushPayload {
  const tasks = d.tasks.personal.items.length + d.tasks.personal.more + d.tasks.trabajo.items.length + d.tasks.trabajo.more;
  const counts = [
    d.events.length ? plural(d.events.length, 'cita', 'citas') : '',
    tasks ? plural(tasks, 'tarea', 'tareas') : '',
    d.birthdays.length ? `${d.birthdays.length} cumpleaños` : '',
    d.unclassified ? `${d.unclassified} sin clasificar` : '',
  ].filter(Boolean);
  return {
    title: 'Hoy',
    body: counts.length ? `${d.headline}\n${counts.join(' · ')}` : d.headline,
    url: '/hoy',
    tag: `digest-${d.date}`,
  };
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
}

export async function runMorning(deps: MorningDeps): Promise<MorningResult> {
  const r: MorningResult = {
    digest: 'not_due',
    pushed: 0,
    pushFailed: 0,
    synced: 0,
    syncFailed: 0,
    purged: 0,
    maintenanceFailed: false,
  };
  await sendDigest(deps, r);
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
