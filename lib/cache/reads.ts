/**
 * Marc's data as the pages read it, cached per session with `'use cache: private'`.
 *
 * Private caches read the session cookies inside the scope and are never stored on the server
 * across requests: they dedupe within a request, and the client router keeps the rendered result
 * for the profile's `stale` time (next.config.ts `cacheLife`), so going back to a screen, or a
 * prefetched one, paints without a server round-trip. With a stale time of at least 5 minutes
 * ('userData') the content is part of the per-session App Shell that links prefetch.
 *
 * Every read is tagged with the scopes it shows (lib/cache/tags.ts) and every write action
 * invalidates them (lib/actions/run.ts); a Server Action that invalidates also clears the whole
 * client router cache, so Marc never sees stale data after his own write. Writes from elsewhere
 * (Siri, the extension, the hourly job, after() previews) call revalidateTag for the user's tags,
 * and the app refreshes its screen when it returns to the foreground (RefreshOnReturn), since
 * the private results live in the client router where a server-side revalidation cannot reach.
 */
import { cacheLife } from 'next/cache';
import { listByType, listLibros, listPapelera, listRecent, listRegalos, listSinClasificar, listTareas } from '@/lib/actions/items';
import { listPersonas, NEXT_DATE_WINDOW_DAYS } from '@/lib/actions/people';
import { sessionDeps } from '@/lib/actions/server';
import { parseWeekParam, weekRange } from '@/lib/agenda/week';
import { madridToday } from '@/lib/actions/today';
import { weekHeadlineMode } from '@/lib/digest/headlineCache';
import { buildDigestDeferred, buildWeekDigestDeferred } from '@/lib/digest/server';
import type { CalendarEvent } from '@/lib/calendar/client';
import { calendarGatewayFor } from '@/lib/calendar/server';
import { toSyncError, type SyncErrorCode } from '@/lib/calendar/taskSync';
import { createSettingsRepo, loadSettingsOrDefaults } from '@/lib/db/settings';
import type { Area, ItemType } from '@/lib/db/types';
import { countPhotos, loadPhotoMap } from '@/lib/photos/server';
import { createClient, requireUser } from '@/lib/supabase/server';
import { toMadrid } from '@/lib/time';
import { tagUserData } from './server';

// ---------- Item lists ----------

export async function readRecent() {
  'use cache: private';
  cacheLife('userData');
  const { userId, deps } = await sessionDeps();
  tagUserData(userId, ['items', 'people']);
  const [recent, people] = await Promise.all([listRecent(deps, new Date()), deps.people.listPeople()]);
  const photos = await loadPhotoMap([...recent.personal, ...recent.trabajo]);
  return { ...recent, people, photos, today: madridToday() };
}

export async function readTareas(area: Area) {
  'use cache: private';
  cacheLife('userData');
  const { userId, deps } = await sessionDeps();
  tagUserData(userId, ['items']);
  const items = await listTareas(deps, area);
  return { items, photos: await loadPhotoMap(items), today: madridToday() };
}

export async function readByType(type: ItemType) {
  'use cache: private';
  cacheLife('userData');
  const { userId, deps } = await sessionDeps();
  tagUserData(userId, ['items']);
  const items = await listByType(deps, type);
  return { items, photos: await loadPhotoMap(items), today: madridToday() };
}

export async function readLibros() {
  'use cache: private';
  cacheLife('userData');
  const { userId, deps } = await sessionDeps();
  tagUserData(userId, ['items']);
  const books = await listLibros(deps);
  return { books, photos: await loadPhotoMap(books) };
}

export async function readRegalos() {
  'use cache: private';
  cacheLife('userData');
  const { userId, deps } = await sessionDeps();
  tagUserData(userId, ['items', 'people']);
  const { people, unassigned } = await listRegalos(deps);
  return { people, unassigned, photos: await loadPhotoMap(unassigned), today: madridToday() };
}

export async function readSinClasificar(area: Area) {
  'use cache: private';
  cacheLife('userData');
  const { userId, deps } = await sessionDeps();
  tagUserData(userId, ['items', 'people']);
  const [items, people] = await Promise.all([listSinClasificar(deps, area), deps.people.listPeople()]);
  return { items, people, photos: await loadPhotoMap(items), today: madridToday() };
}

export async function readPapelera() {
  'use cache: private';
  cacheLife('userData');
  const { userId, deps } = await sessionDeps();
  tagUserData(userId, ['items', 'people']);
  const [items, people] = await Promise.all([listPapelera(deps), deps.people.listPeople()]);
  return { items, people, today: madridToday() };
}

/** Listas: how many items each list holds. */
export async function readListCounts() {
  'use cache: private';
  cacheLife('userData');
  const { userId, deps } = await sessionDeps();
  tagUserData(userId, ['items']);
  const [ideas, compras, regalos, libros, sinClasificar] = await Promise.all([
    listByType(deps, 'idea'),
    listByType(deps, 'compra'),
    listByType(deps, 'regalo'),
    listLibros(deps),
    listSinClasificar(deps),
  ]);
  return {
    ideas: ideas.length,
    compras: compras.length,
    regalos: regalos.length,
    // Books still to read or being read; the read ones are a record, not a to-do.
    libros: libros.filter((b) => b.readingState !== 'leido').length,
    sinClasificar: sinClasificar.length,
  };
}

// ---------- People ----------

export async function readPersonas() {
  'use cache: private';
  cacheLife('userData');
  const { userId, deps } = await sessionDeps();
  tagUserData(userId, ['people', 'items']);
  return listPersonas(deps, madridToday(), countPhotos);
}

/** A person's page, or null when there is no such person. */
export async function readPersona(id: string) {
  'use cache: private';
  cacheLife('userData');
  const { userId, deps } = await sessionDeps();
  tagUserData(userId, ['people', 'items']);
  const today = madridToday();
  const [{ people }, dates, upcoming] = await Promise.all([
    listRegalos(deps),
    deps.people.listDates(id),
    deps.people.upcomingDates(today, NEXT_DATE_WINDOW_DAYS),
  ]);
  const group = people.find((g) => g.person.id === id);
  if (!group) return null;
  return {
    group,
    people: people.map((g) => g.person),
    dates,
    upcoming: upcoming.filter((u) => u.person.id === id),
    photos: await loadPhotoMap(group.items),
    today,
  };
}

// ---------- Calendar, Hoy, Semana ----------

/**
 * Google Calendar events of [from, to) (ISO instants) and the "Tareas" calendar id, or the
 * failure as data (an error object would not keep its kind across the cache boundary).
 */
export async function readEvents(
  from: string,
  to: string,
): Promise<{ events: CalendarEvent[]; tasksCalendarId: string | null; error: null } | { error: SyncErrorCode }> {
  'use cache: private';
  cacheLife('calendar');
  const user = await requireUser();
  tagUserData(user.id, ['calendar']);
  try {
    const gw = await calendarGatewayFor(user.id);
    const [events, tasksCalendarId] = await Promise.all([
      gw.listEvents({ from: new Date(from), to: new Date(to) }),
      // Only to mark tasks; the agenda still shows if this lookup fails.
      gw.ensureCalendar('Tareas').catch(() => null),
    ]);
    return { events, tasksCalendarId, error: null };
  } catch (err) {
    return { error: toSyncError(err) };
  }
}

async function sessionSettings() {
  const [user, client] = await Promise.all([requireUser(), createClient()]);
  const { settings } = await loadSettingsOrDefaults(createSettingsRepo(client, user.id));
  return { user, client, settings };
}

/** Hoy's digest, without waiting on the AI (`headlinePrompt` set when the line is still to come). */
export async function readHoy() {
  'use cache: private';
  // It shows today's citas: the calendar's shorter lifetime.
  cacheLife('calendar');
  const { user, client, settings } = await sessionSettings();
  tagUserData(user.id, ['items', 'people', 'calendar', 'settings']);
  const now = new Date();
  const date = toMadrid(now, settings.tz).date;
  const { digest, headlinePrompt } = await buildDigestDeferred({ client, userId: user.id, date, now, settings });
  return { digest, headlinePrompt, settings };
}

/** The week of `w` (any day of it; default this week), without waiting on the AI. */
export async function readSemana(w: string | undefined) {
  'use cache: private';
  cacheLife('calendar');
  const { user, client, settings } = await sessionSettings();
  tagUserData(user.id, ['items', 'people', 'calendar', 'settings']);
  const now = new Date();
  const today = toMadrid(now, settings.tz).date;
  const weekStart = parseWeekParam(w, today);
  const { week, headlinePrompt } = await buildWeekDigestDeferred({
    client,
    userId: user.id,
    weekStart,
    now,
    settings,
    headline: weekHeadlineMode(weekStart, today, settings.weeklyDigest),
  });
  return { week, headlinePrompt, settings, thisWeek: weekRange(today).start };
}

/** Ajustes: digest hour and weekly summary. */
export async function readSettings() {
  'use cache: private';
  cacheLife('userData');
  const [user, client] = await Promise.all([requireUser(), createClient()]);
  tagUserData(user.id, ['settings']);
  return createSettingsRepo(client, user.id).get();
}
