import { madridDateTime } from './time';
import type { Item } from './db/types';

const DAY = 24 * 60 * 60 * 1000;

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

const utcFormat = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' });

const weekday = utcFormat({ weekday: 'long' });
const dayMonth = utcFormat({ day: 'numeric', month: 'long' });
const dayMonthYear = utcFormat({ day: 'numeric', month: 'long', year: 'numeric' });

/** "Hoy", "Mañana", "Ayer", a weekday within the next week, else "23 de octubre" (with year if not this year). */
export function formatDay(date: string, today: string): string {
  const diff = dayDiff(today, date);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  const d = new Date(`${date}T00:00:00Z`);
  if (diff > 1 && diff < 7) {
    const name = weekday.format(d);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return (date.slice(0, 4) === today.slice(0, 4) ? dayMonth : dayMonthYear).format(d);
}

/** Day label and, for items with time, "HH:mm" in Madrid. `today` is Madrid's "YYYY-MM-DD". */
export function formatDue(item: Pick<Item, 'dueAt' | 'hasTime'>, today: string): { day?: string; time?: string } {
  if (!item.dueAt) return {};
  const { date, time } = madridDateTime(new Date(item.dueAt));
  return { day: formatDay(date, today), time: item.hasTime ? time : undefined };
}

/** "2 de noviembre" from a birthday "YYYY-MM-DD" (the year is ignored). */
export function formatBirthday(birthday: string): string {
  return dayMonth.format(new Date(`2000-${birthday.slice(5, 10)}T00:00:00Z`));
}

export const TYPE_LABELS: Record<Item['type'], string> = {
  tarea: 'Tarea',
  idea: 'Idea',
  compra: 'Compra',
  regalo: 'Regalo',
  libro: 'Libro',
};

/**
 * Where a captured item went, as the Bandeja shows it: "Tareas · Personal", "Ideas",
 * "Regalo · Ainhoa", "Sin clasificar"… A task without area counts as Personal.
 */
export function destinationLabel(
  item: Pick<Item, 'type' | 'area' | 'needsReview' | 'personId'>,
  personName?: string,
): string {
  if (item.needsReview) return 'Sin clasificar';
  switch (item.type) {
    case 'tarea':
      return `Tareas · ${item.area === 'trabajo' ? 'Trabajo' : 'Personal'}`;
    case 'idea':
      return 'Ideas';
    case 'compra':
      return 'Compras';
    case 'regalo':
      return personName ? `Regalo · ${personName}` : 'Regalos';
    case 'libro':
      return 'Libros';
  }
}

/** The captured text to show as "Texto original" in the edit sheet, only when it says more than the title. */
export function originalText(item: Pick<Item, 'title' | 'sourceText'>): string | null {
  const source = item.sourceText?.trim();
  if (!source || source === item.title.trim()) return null;
  return source;
}
