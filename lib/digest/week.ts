/**
 * Weekly digest (/semana and the Monday or Sunday push): the 7 Madrid days from a Monday, with
 * each day's events and tasks, the week's tasks per area plus overdue ones, the week's special
 * dates with gift ideas, the "Sin clasificar" count and at most one AI line. Built from the
 * daily digest's pieces (lib/digest/build.ts).
 *
 * Privacy, as in the daily digest: the AI prompt only holds the week's personal task titles with
 * their weekday, each date's person name, label and weekday, and the week's dates. Nothing from
 * Trabajo, no event titles, no notes (of items, people or dates), no gift ideas, no source text.
 */
import { addDays, eventDates, weekRange } from '@/lib/agenda/week';
import type { Area } from '@/lib/db/types';
import { formatLongDate, madridToUtc, toMadrid } from '@/lib/time';
import {
  askOneLine,
  byOrder,
  collectTasks,
  loadEvents,
  toArea,
  withGiftIdeas,
  type DigestArea,
  type DigestCalendarError,
  type DigestDate,
  type DigestDeps,
  type DigestEvent,
  type DigestTask,
} from './build';

export const MAX_WEEK_TASKS_PER_AREA = 8;
/** Summary line of a week with nothing in it. */
export const CALM_WEEK = 'Semana tranquila.';

export interface WeekDay {
  /** Madrid "YYYY-MM-DD". */
  date: string;
  /** Events touching this day (an event across days is on each one), by start. */
  events: DigestEvent[];
  /** Pending tasks due this day, both areas, timed first. */
  tasks: DigestTask[];
}

export interface WeekDigest {
  /** The Monday, "YYYY-MM-DD". */
  weekStart: string;
  /** Today in Madrid (to highlight its row). */
  today: string;
  days: WeekDay[];
  calendarError: DigestCalendarError | null;
  /** Tasks due in the week, plus overdue ones when the week is current or ahead. */
  tasks: Record<Area, DigestArea>;
  unclassified: number;
  /** Birthdays and special dates within the week. */
  dates: DigestDate[];
  /** One AI line, or null (nothing personal to say, or the AI failed). */
  headline: string | null;
}

/** Builds the week holding `weekStart` (normally its Monday). Never throws for Calendar or AI failures. */
export async function buildWeekDigest(weekStart: string, deps: DigestDeps): Promise<WeekDigest> {
  const { start, days } = weekRange(weekStart);
  const from = madridToUtc(start, '00:00', deps.tz);
  const until = madridToUtc(addDays(start, 7), '00:00', deps.tz);
  const today = toMadrid(deps.now, deps.tz).date;
  const todayStart = madridToUtc(today, '00:00', deps.tz);

  const [eventsResult, pending, upcoming] = await Promise.all([
    loadEvents(deps.calendar, from, until),
    deps.items.listItems({ status: 'pendiente' }),
    deps.people.upcomingDates(start, 6),
  ]);

  const { tasks, unclassified } = collectTasks(pending, {
    from,
    until,
    overdueBefore: todayStart,
    earlierOverdue: until > todayStart,
  });
  const dates = withGiftIdeas(upcoming, pending);

  const inWeek = (t: DigestTask) => Date.parse(t.item.dueAt!) >= from.getTime();
  const dayOf = (t: DigestTask) => toMadrid(new Date(t.item.dueAt!), deps.tz).date;
  const weekTasks = [...tasks.personal, ...tasks.trabajo].filter(inWeek);
  const sortedEvents = [...eventsResult.events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const weekDays: WeekDay[] = days.map((date) => ({
    date,
    events: sortedEvents.filter((e) => eventDates(e).includes(date)),
    tasks: weekTasks.filter((t) => dayOf(t) === date).sort(byTime),
  }));

  const personal = tasks.personal.filter(inWeek).sort((a, b) => a.item.dueAt!.localeCompare(b.item.dueAt!));
  const headline =
    personal.length === 0 && dates.length === 0
      ? null
      : await askOneLine(deps, weekPrompt(start, deps.tz, personal, dates), null);

  return {
    weekStart: start,
    today,
    days: weekDays,
    calendarError: eventsResult.error,
    tasks: {
      personal: toArea(tasks.personal, MAX_WEEK_TASKS_PER_AREA),
      trabajo: toArea(tasks.trabajo, MAX_WEEK_TASKS_PER_AREA),
    },
    unclassified,
    dates,
    headline,
  };
}

/** Within a day: timed tasks by time, then untimed ones (overdue or not). */
const byTime = (a: DigestTask, b: DigestTask) => byOrder({ ...a, overdue: false }, { ...b, overdue: false });

const weekday = (date: string, tz: string) =>
  new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: tz }).format(madridToUtc(date, '12:00', tz));

/** Only personal data: the week's personal task titles with their weekday, and each date's name + label + weekday. */
function weekPrompt(start: string, tz: string, personal: DigestTask[], dates: DigestDate[]): string {
  const long = (d: string) => formatLongDate(madridToUtc(d, '12:00', tz), tz);
  const lines = [
    'Escribe una sola frase corta en español (máximo 120 caracteres) que resuma la semana de Marc.',
    'Sin frases motivacionales, sin consejos de productividad, sin emojis, sin comillas.',
    `Semana del ${long(start)} al ${long(addDays(start, 6))}.`,
    `Tareas personales de la semana: ${personal.length}.`,
    ...personal.map((t) => `- ${t.item.title} (${weekday(toMadrid(new Date(t.item.dueAt!), tz).date, tz)})`),
  ];
  if (dates.length > 0) {
    lines.push('Fechas especiales de la semana:');
    for (const d of dates) lines.push(`- ${d.label} · ${d.person.name}: ${weekday(d.date, tz)}`);
  }
  return lines.join('\n');
}

export interface WeekCounts {
  /** Distinct events in the week. */
  events: number;
  /** Tasks in the lists (the week's and overdue ones), both areas. */
  tasks: number;
  dates: number;
  unclassified: number;
}

export function weekCounts(w: WeekDigest): WeekCounts {
  const events = new Set(w.days.flatMap((d) => d.events.map((e) => e.id))).size;
  const area = (a: DigestArea) => a.items.length + a.more;
  return { events, tasks: area(w.tasks.personal) + area(w.tasks.trabajo), dates: w.dates.length, unclassified: w.unclassified };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 citas · 5 tareas · 1 fecha · 2 sin clasificar", or CALM_WEEK. Counts only: no titles. */
export function weekSummaryLine(w: WeekDigest): string {
  const c = weekCounts(w);
  const parts = [
    c.events ? plural(c.events, 'cita', 'citas') : '',
    c.tasks ? plural(c.tasks, 'tarea', 'tareas') : '',
    c.dates ? plural(c.dates, 'fecha', 'fechas') : '',
    c.unclassified ? `${c.unclassified} sin clasificar` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : CALM_WEEK;
}
