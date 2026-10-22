/**
 * Words for special dates (birthdays included), shared by the Personas screens, /hoy and the
 * morning push. Pure, no server imports.
 */
import { NO_YEAR, type UpcomingDate } from '@/lib/db/people';

const dayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayMonthYear = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "3 de noviembre de 2021", or "14 de febrero" when the year is unknown (NO_YEAR). */
export function formatPersonDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return (Number(date.slice(0, 4)) === NO_YEAR ? dayMonth : dayMonthYear).format(d);
}

/** Label suggestions in the date sheet ("Otro" = type your own). */
export const DATE_LABEL_SUGGESTIONS = ['Aniversario', 'Santo', 'Nos conocimos'] as const;

/** "hoy", "mañana", "en 12 días". */
export function countdown(daysUntil: number): string {
  if (daysUntil === 0) return 'hoy';
  if (daysUntil === 1) return 'mañana';
  return `en ${daysUntil} días`;
}

/** "1 año", "5 años"; nothing when the years are unknown. */
export function yearsText(years: number | undefined): string | undefined {
  if (!years) return undefined;
  return years === 1 ? '1 año' : `${years} años`;
}

/** "Aniversario · en 12 días · 5 años". */
export function dateSummary(u: Pick<UpcomingDate, 'label' | 'daysUntil' | 'yearsSince'>): string {
  return [u.label, countdown(u.daysUntil), yearsText(u.yearsSince)].filter(Boolean).join(' · ');
}

const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase('es') + s.slice(1);

/** "aniversario con Ainhoa (5 años)", "cumpleaños de Ana (35 años)", "santo de Luis". */
export function dateWithPerson(u: Pick<UpcomingDate, 'kind' | 'label' | 'person' | 'yearsSince'>): string {
  const of = u.kind === 'birthday' || /^(santo|cumpleaños)$/i.test(u.label.trim()) ? 'de' : 'con';
  const years = yearsText(u.yearsSince);
  return `${lowerFirst(u.label)} ${of} ${u.person.name}${years ? ` (${years})` : ''}`;
}
