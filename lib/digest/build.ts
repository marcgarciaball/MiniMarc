/**
 * Morning digest: today's Calendar events, pending tasks (overdue + today) per area, upcoming
 * birthdays with gift ideas, and a one-line headline.
 *
 * Privacy: the headline prompt only ever holds personal tasks due today (titles), birthday names
 * with days left, and the date. Nothing from Trabajo, no event titles, no notes, no source text.
 */
import type { AiProvider } from '@/lib/ai/provider';
import { calendarErrorKind, type CalendarGateway } from '@/lib/calendar/client';
import type { ItemsRepo } from '@/lib/db/items';
import type { PeopleRepo } from '@/lib/db/people';
import type { Area, Item, Person } from '@/lib/db/types';
import { formatLongDate, madridToUtc } from '@/lib/time';

export const MAX_TASKS_PER_AREA = 5;
export const BIRTHDAY_WINDOW_DAYS = 14;
export const HEADLINE_TIMEOUT_MS = 6000;
export const HEADLINE_MAX = 140;
/** Headline when the AI fails, or when there is something to show but nothing personal to say. */
export const FALLBACK_HEADLINE = 'Buenos días';
/** Headline when the day is empty: no AI call. */
export const CALM_HEADLINE = 'Buenos días. Día tranquilo.';

export interface DigestDeps {
  items: ItemsRepo;
  people: PeopleRepo;
  /** Loads the Calendar gateway (lazy, like the capture pipeline). */
  calendar: () => Promise<CalendarGateway>;
  ai: AiProvider;
  tz: string;
  now: Date;
  /** Overrides HEADLINE_TIMEOUT_MS (tests). */
  aiTimeoutMs?: number;
}

export interface DigestEvent {
  id: string;
  title: string;
  /** ISO 8601 (UTC). */
  startsAt: string;
  endsAt: string;
}

export interface DigestTask {
  item: Item;
  /** Due before today (Madrid); otherwise due today. */
  overdue: boolean;
}

export interface DigestArea {
  items: DigestTask[];
  /** Tasks beyond MAX_TASKS_PER_AREA ("+N"). */
  more: number;
}

export interface DigestBirthday {
  person: Person;
  /** This year's (or next year's) occurrence, "YYYY-MM-DD". */
  date: string;
  daysLeft: number;
  /** The person's pending `regalo` items. */
  giftIdeas: Item[];
}

export type DigestCalendarError = 'calendar_auth' | 'calendar_unavailable';

export interface Digest {
  /** The Madrid day, "YYYY-MM-DD". */
  date: string;
  events: DigestEvent[];
  calendarError: DigestCalendarError | null;
  tasks: Record<Area, DigestArea>;
  /** Pending items waiting in "Sin clasificar" (left out of the lists). */
  unclassified: number;
  birthdays: DigestBirthday[];
  headline: string;
}

const DAY = 24 * 60 * 60 * 1000;

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** Builds the digest for the Madrid day `date` ("YYYY-MM-DD"). Never throws for Calendar or AI failures. */
export async function buildDigest(date: string, deps: DigestDeps): Promise<Digest> {
  const dayStart = madridToUtc(date, '00:00', deps.tz);
  const dayEnd = madridToUtc(addDays(date, 1), '00:00', deps.tz);

  const [eventsResult, pending, birthdays] = await Promise.all([
    loadEvents(deps, dayStart, dayEnd),
    deps.items.listItems({ status: 'pendiente' }),
    loadBirthdays(date, deps),
  ]);

  const dueTasks: Record<Area, DigestTask[]> = { personal: [], trabajo: [] };
  let unclassified = 0;
  for (const item of pending) {
    if (item.needsReview) {
      unclassified++;
      continue;
    }
    if (item.type !== 'tarea' || !item.dueAt) continue;
    const t = Date.parse(item.dueAt);
    if (t >= dayEnd.getTime()) continue;
    dueTasks[item.area ?? 'personal'].push({ item, overdue: t < dayStart.getTime() });
  }

  const todayPersonal = dueTasks.personal.filter((t) => !t.overdue).sort(byOrder);
  const headline = await buildHeadline(date, deps, todayPersonal, birthdays, {
    anything: eventsResult.events.length > 0 || dueTasks.personal.length + dueTasks.trabajo.length > 0,
  });

  return {
    date,
    events: eventsResult.events,
    calendarError: eventsResult.error,
    tasks: { personal: toArea(dueTasks.personal), trabajo: toArea(dueTasks.trabajo) },
    unclassified,
    birthdays,
    headline,
  };
}

/** Overdue first (oldest first), then timed tasks by time, then untimed ones. */
function byOrder(a: DigestTask, b: DigestTask): number {
  const rank = (t: DigestTask) => (t.overdue ? 0 : t.item.hasTime ? 1 : 2);
  return rank(a) - rank(b) || a.item.dueAt!.localeCompare(b.item.dueAt!) || a.item.title.localeCompare(b.item.title, 'es');
}

function toArea(tasks: DigestTask[]): DigestArea {
  const sorted = [...tasks].sort(byOrder);
  return { items: sorted.slice(0, MAX_TASKS_PER_AREA), more: Math.max(0, sorted.length - MAX_TASKS_PER_AREA) };
}

async function loadEvents(
  deps: DigestDeps,
  from: Date,
  to: Date,
): Promise<{ events: DigestEvent[]; error: DigestCalendarError | null }> {
  try {
    const gw = await deps.calendar();
    const events = await gw.listEvents({ from, to });
    return {
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
      })),
      error: null,
    };
  } catch (err) {
    return { events: [], error: calendarErrorKind(err) === 'auth' ? 'calendar_auth' : 'calendar_unavailable' };
  }
}

async function loadBirthdays(date: string, deps: DigestDeps): Promise<DigestBirthday[]> {
  const people = await deps.people.upcomingBirthdays(date, BIRTHDAY_WINDOW_DAYS);
  if (people.length === 0) return [];
  const gifts = await deps.items.listItems({ type: 'regalo', status: 'pendiente' });
  return people.map((person) => {
    let daysLeft = 0;
    while (addDays(date, daysLeft).slice(5) !== person.birthday!.slice(5) && daysLeft < BIRTHDAY_WINDOW_DAYS) daysLeft++;
    return {
      person,
      date: addDays(date, daysLeft),
      daysLeft,
      giftIdeas: gifts.filter((g) => g.personId === person.id),
    };
  });
}

async function buildHeadline(
  date: string,
  deps: DigestDeps,
  todayPersonal: DigestTask[],
  birthdays: DigestBirthday[],
  ctx: { anything: boolean },
): Promise<string> {
  if (todayPersonal.length === 0 && birthdays.length === 0) {
    return ctx.anything ? FALLBACK_HEADLINE : CALM_HEADLINE;
  }
  const prompt = headlinePrompt(date, deps.tz, todayPersonal, birthdays);
  const timeoutMs = deps.aiTimeoutMs ?? HEADLINE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reply = await Promise.race([
      deps.ai.generateText(prompt, { timeoutMs }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    const line = reply.trim().split('\n')[0].trim().replace(/^["'«“]+|["'»”]+$/g, '').trim();
    return line && line.length <= HEADLINE_MAX ? line : FALLBACK_HEADLINE;
  } catch {
    return FALLBACK_HEADLINE;
  } finally {
    clearTimeout(timer);
  }
}

/** Only personal data: today's personal task titles, birthday names + days left, and the date. */
function headlinePrompt(date: string, tz: string, todayPersonal: DigestTask[], birthdays: DigestBirthday[]): string {
  const lines = [
    'Escribe una sola frase corta en español (máximo 120 caracteres) que resuma el día de Marc.',
    'Sin frases motivacionales, sin consejos de productividad, sin emojis, sin comillas.',
    `Hoy es ${formatLongDate(madridToUtc(date, '12:00', tz), tz)}.`,
    `Tareas personales para hoy: ${todayPersonal.length}.`,
    ...todayPersonal.map((t) => `- ${t.item.title}`),
  ];
  if (birthdays.length > 0) {
    lines.push('Cumpleaños próximos:');
    for (const b of birthdays) {
      lines.push(`- ${b.person.name}: ${b.daysLeft === 0 ? 'hoy' : `dentro de ${b.daysLeft} días`}`);
    }
  }
  return lines.join('\n');
}
