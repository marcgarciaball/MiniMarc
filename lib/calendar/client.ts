/**
 * Google Calendar behind a small gateway. Only this file talks to the Calendar API; the rest of
 * the app (task sync, agenda) uses `CalendarGateway`, which tests replace with a fake.
 * Every API error comes out as a `CalendarError` with a coarse `kind`.
 */
import { calendar as calendarApi, type calendar_v3 } from 'googleapis/build/src/apis/calendar';
import { DEFAULT_TZ, madridToUtc } from '@/lib/time';

export type CalendarName = 'Tareas';

/** Un evento con hora: el caso de siempre (citas y tareas con hora). */
export interface TimedEventInput {
  title: string;
  startsAt: Date;
  /** Defaults to 30 minutes after `startsAt`. */
  endsAt?: Date;
  description?: string;
  allDay?: false;
}

/**
 * Un evento de todo el día: "YYYY-MM-DD" sueltas, sin zona horaria. `endDate` es el último día
 * que ocupa (inclusive); Google quiere el siguiente, y de eso se encarga `eventBody`.
 */
export interface AllDayEventInput {
  title: string;
  allDay: true;
  date: string;
  endDate?: string;
  description?: string;
}

export type EventInput = TimedEventInput | AllDayEventInput;

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  calendarId: string;
  /** Set (true) only for events of Marc's primary calendar. */
  primary?: true;
  /** Only when the event has one. */
  location?: string;
  /** True only with popup reminders at exactly 180 and 60 minutes (others may exist too). */
  hasRequiredReminders: boolean;
}

export interface CalendarGateway {
  createEvent(calendarId: string, e: EventInput): Promise<string>;
  updateEvent(calendarId: string, eventId: string, e: EventInput): Promise<void>;
  /** Replaces the event's reminders with the 180/60 popups (nothing else changes). */
  setRequiredReminders(calendarId: string, eventId: string): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  /** Events from every calendar shown in Google Calendar (plus Marc's own "Tareas"), sorted by start. */
  listEvents(range: { from: Date; to: Date }): Promise<CalendarEvent[]>;
  /** Id of the calendar called `name`, created (in Europe/Madrid) if missing. */
  ensureCalendar(name: CalendarName): Promise<string>;
}

/** The part of `google.calendar('v3')` the gateway uses (tests pass a fake). */
export type CalendarApi = Pick<calendar_v3.Calendar, 'events' | 'calendarList' | 'calendars'>;

type Auth = calendar_v3.Options['auth'];

// ---------- Errors ----------

/** auth: token revoked/expired or no permission (re-login). not_found: 404/410. unavailable: anything else. */
export type CalendarErrorKind = 'auth' | 'not_found' | 'unavailable';

export class CalendarError extends Error {
  override name = 'CalendarError';
  constructor(
    readonly kind: CalendarErrorKind,
    message: string,
  ) {
    super(message);
  }
}

type ErrorLike = {
  message?: unknown;
  status?: unknown;
  code?: unknown;
  errors?: { reason?: string }[];
  response?: { status?: unknown; data?: { error?: unknown } };
};

const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded']);

/** Classifies any error thrown by googleapis / google-auth-library (or a CalendarError). */
export function calendarErrorKind(err: unknown): CalendarErrorKind {
  if (err instanceof CalendarError) return err.kind;
  const e = (err ?? {}) as ErrorLike;
  const data = e.response?.data?.error;
  const oauthError = typeof data === 'string' ? data : '';
  const message = typeof e.message === 'string' ? e.message : '';
  if (/invalid_grant|invalid_client|unauthorized_client|No refresh token/i.test(`${oauthError} ${message}`)) {
    return 'auth';
  }
  const status = [e.status, e.response?.status, e.code].map(Number).find((n) => n >= 100 && n < 600);
  if (status === 401) return 'auth';
  if (status === 403) {
    const reasons = [
      ...(e.errors ?? []),
      ...((typeof data === 'object' && data && (data as { errors?: { reason?: string }[] }).errors) || []),
    ];
    return reasons.some((r) => r.reason && RATE_LIMIT_REASONS.has(r.reason)) ? 'unavailable' : 'auth';
  }
  if (status === 404 || status === 410) return 'not_found';
  return 'unavailable';
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CalendarError) throw err;
    throw new CalendarError(calendarErrorKind(err), err instanceof Error ? err.message : String(err));
  }
}

// ---------- Timeout ----------

/** Longest wait for one Google API request; Siri gives up soon after, so a hang must not stall a capture. */
export const CALENDAR_TIMEOUT_MS = 8000;

/** Rejects with CalendarError('unavailable') if `request` takes longer than `ms`. */
function withDeadline<T>(request: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CalendarError('unavailable', 'Calendar no responde (tiempo de espera agotado)')), ms);
    request.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// ---------- Reminders ----------

/** Appointments and timed tasks always warn 180 and 60 minutes before, as a popup. */
export const REQUIRED_REMINDERS = [
  { method: 'popup', minutes: 180 },
  { method: 'popup', minutes: 60 },
] as const;

/**
 * El aviso de un evento de todo el día. Google cuenta los minutos desde el inicio, que para
 * estos eventos es la medianoche, y no admite valores negativos (0 a 40320), así que "ese día
 * a las 9" no se puede expresar: 180 minutos es la víspera a las 21:00, y con uno basta.
 */
export const ALL_DAY_REMINDERS = [{ method: 'popup', minutes: 180 }] as const;

export function hasRequiredReminders(reminders: calendar_v3.Schema$Event['reminders'] | undefined): boolean {
  if (!reminders || reminders.useDefault) return false;
  const popups = (reminders.overrides ?? []).filter((o) => o.method === 'popup').map((o) => o.minutes);
  return REQUIRED_REMINDERS.every((r) => popups.includes(r.minutes));
}

// ---------- Gateway ----------

const DEFAULT_DURATION_MS = 30 * 60_000;

function requiredReminders(): calendar_v3.Schema$Event['reminders'] {
  return { useDefault: false, overrides: REQUIRED_REMINDERS.map((r) => ({ ...r })) };
}

/** "YYYY-MM-DD" + 1 día, en aritmética de calendario (sin zona horaria de por medio). */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function eventBody(e: EventInput): calendar_v3.Schema$Event {
  const common = { summary: e.title, ...(e.description !== undefined && { description: e.description }) };
  if (e.allDay) {
    return {
      ...common,
      // Google toma el fin como exclusivo: un día suelto acaba el día siguiente.
      start: { date: e.date },
      end: { date: nextDay(e.endDate ?? e.date) },
      reminders: { useDefault: false, overrides: ALL_DAY_REMINDERS.map((r) => ({ ...r })) },
    };
  }
  const endsAt = e.endsAt ?? new Date(e.startsAt.getTime() + DEFAULT_DURATION_MS);
  return {
    ...common,
    start: { dateTime: e.startsAt.toISOString(), timeZone: DEFAULT_TZ },
    end: { dateTime: endsAt.toISOString(), timeZone: DEFAULT_TZ },
    reminders: requiredReminders(),
  };
}

/** A `dateTime`, or an all-day `date` taken as Madrid midnight. */
function eventTime(t: calendar_v3.Schema$EventDateTime | undefined): Date | null {
  if (t?.dateTime) return new Date(t.dateTime);
  if (t?.date) return madridToUtc(t.date, '00:00');
  return null;
}

const isOwned = (c: calendar_v3.Schema$CalendarListEntry, name: CalendarName) =>
  c.summary === name && c.accessRole === 'owner';

/**
 * Gateway over the Calendar API. `auth` is an OAuth2 client holding Marc's refresh token
 * (see getCalendarGateway in lib/calendar/server.ts); `opts.api` replaces the API in tests.
 * Every request times out after `opts.timeoutMs` (8 s): gaxios aborts it, and the deadline
 * turns a hang into CalendarError('unavailable') → `calendar_unavailable`.
 */
export function createCalendarClient(
  auth: Auth | null,
  opts: { api?: CalendarApi; timeoutMs?: number } = {},
): CalendarGateway {
  const timeoutMs = opts.timeoutMs ?? CALENDAR_TIMEOUT_MS;
  const api: CalendarApi = opts.api ?? calendarApi({ version: 'v3', auth: auth ?? undefined, timeout: timeoutMs });
  const timed = <T>(request: Promise<T>) => withDeadline(request, timeoutMs);

  async function listCalendars(): Promise<calendar_v3.Schema$CalendarListEntry[]> {
    const items: calendar_v3.Schema$CalendarListEntry[] = [];
    let pageToken: string | undefined;
    do {
      const { data } = await timed(api.calendarList.list({ pageToken }));
      items.push(...(data.items ?? []));
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
    return items;
  }

  async function listCalendarEvents(calendarId: string, primary: boolean, from: Date, to: Date): Promise<CalendarEvent[]> {
    const out: CalendarEvent[] = [];
    let pageToken: string | undefined;
    do {
      const { data } = await timed(
        api.events.list({
          calendarId,
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
          pageToken,
        }),
      );
      for (const ev of data.items ?? []) {
        const startsAt = eventTime(ev.start);
        if (!ev.id || ev.status === 'cancelled' || !startsAt) continue;
        out.push({
          id: ev.id,
          title: ev.summary ?? '',
          startsAt,
          endsAt: eventTime(ev.end) ?? startsAt,
          calendarId,
          ...(primary && { primary: true as const }),
          ...(ev.location && { location: ev.location }),
          hasRequiredReminders: hasRequiredReminders(ev.reminders),
        });
      }
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  return {
    createEvent: (calendarId, e) =>
      call(async () => {
        const { data } = await timed(api.events.insert({ calendarId, requestBody: eventBody(e) }));
        if (!data.id) throw new CalendarError('unavailable', 'Calendar no devolvió el id del evento');
        return data.id;
      }),

    updateEvent: (calendarId, eventId, e) =>
      call(async () => {
        await timed(api.events.patch({ calendarId, eventId, requestBody: eventBody(e) }));
      }),

    setRequiredReminders: (calendarId, eventId) =>
      call(async () => {
        await timed(api.events.patch({ calendarId, eventId, requestBody: { reminders: requiredReminders() } }));
      }),

    deleteEvent: (calendarId, eventId) =>
      call(async () => {
        await timed(api.events.delete({ calendarId, eventId }));
      }),

    listEvents: ({ from, to }) =>
      call(async () => {
        const calendars = (await listCalendars()).filter(
          (c) => c.id && (c.selected || c.primary || isOwned(c, 'Tareas')),
        );
        const lists = await Promise.all(calendars.map((c) => listCalendarEvents(c.id!, Boolean(c.primary), from, to)));
        return lists.flat().sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      }),

    ensureCalendar: (name) =>
      call(async () => {
        const existing = (await listCalendars()).find((c) => isOwned(c, name));
        if (existing?.id) return existing.id;
        const { data } = await timed(api.calendars.insert({ requestBody: { summary: name, timeZone: DEFAULT_TZ } }));
        if (!data.id) throw new CalendarError('unavailable', 'Calendar no devolvió el id del calendario');
        return data.id;
      }),
  };
}

/** Where the "Tareas" calendar id is remembered (google_credentials.calendar_tasks_id). */
export interface CalendarIdCache {
  get(): Promise<string | null>;
  set(id: string): Promise<void>;
}

/**
 * Remembers the "Tareas" calendar id so a sync costs no lookup. If Marc deleted that calendar in
 * Google, creating an event in it gives 404: the calendar is recreated, the new id saved and the
 * event created there. (Updates fall back to a create, and deletes of a gone event succeed.)
 */
export function withCachedCalendar(gw: CalendarGateway, cache: CalendarIdCache): CalendarGateway {
  let known: string | null | undefined;

  async function refresh(name: CalendarName): Promise<string> {
    const id = await gw.ensureCalendar(name);
    known = id;
    // Not saving it only costs a lookup next time; the sync itself has worked.
    await cache.set(id).catch(() => {});
    return id;
  }

  return {
    ...gw,
    async ensureCalendar(name) {
      if (known === undefined) known = await cache.get();
      return known ?? refresh(name);
    },
    async createEvent(calendarId, e) {
      try {
        return await gw.createEvent(calendarId, e);
      } catch (err) {
        if (calendarErrorKind(err) !== 'not_found' || calendarId !== known) throw err;
        return gw.createEvent(await refresh('Tareas'), e);
      }
    },
  };
}
