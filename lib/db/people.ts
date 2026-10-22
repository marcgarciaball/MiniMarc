import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBackend, type DbBackend, type Row } from './backend';
import { isValidDate } from '@/lib/time';
import type { NewPersonDate, Person, PersonDate, PersonDatePatch } from './types';

export interface PeopleRepo {
  upsertPersonByName(name: string): Promise<Person>;
  listPeople(): Promise<Person[]>;
  getPerson(id: string): Promise<Person | null>;
  /**
   * Cumpleaños y fechas especiales que caen entre `from` y `from + days` (ambos inclusive),
   * ordenados por cercanía. Las anuales se repiten cada año (el 29 de febrero cae el 28 en
   * años no bisiestos); las no anuales solo su día.
   */
  upcomingDates(from: string, days: number): Promise<UpcomingDate[]>;
  /** Fechas especiales de una persona, por mes y día. */
  listDates(personId: string): Promise<PersonDate[]>;
  /** Lanza si la etiqueta queda vacía o la fecha no es válida. */
  addDate(input: NewPersonDate): Promise<PersonDate>;
  updateDate(id: string, patch: PersonDatePatch): Promise<PersonDate>;
  deleteDate(id: string): Promise<void>;
  /** Lanza si no existe o si el nombre queda vacío. */
  updatePerson(id: string, patch: PersonPatch): Promise<Person>;
}

export type PersonPatch = Partial<Pick<Person, 'name' | 'birthday' | 'notes'>>;

export function rowToPerson(row: Row): Person {
  return {
    id: String(row.id),
    name: String(row.name),
    birthday: row.birthday == null ? null : String(row.birthday).slice(0, 10),
    notes: (row.notes as string | null) ?? null,
  };
}

/** Year of a date whose year is unknown (Apple Contacts uses it too; it is a leap year). */
export const NO_YEAR = 1604;
export const BIRTHDAY_LABEL = 'Cumpleaños';

/** One occurrence of a birthday or a person date. */
export interface UpcomingDate {
  person: Person;
  /** 'birthday' = people.birthday; 'date' = a person_dates row (`dateId`). */
  kind: 'birthday' | 'date';
  dateId: string | null;
  label: string;
  /** This occurrence, 'YYYY-MM-DD'. */
  date: string;
  /** 0 = today. */
  daysUntil: number;
  /** Years since the original date, for yearly dates whose year is known (≥ 1). */
  yearsSince?: number;
}

export function rowToPersonDate(row: Row): PersonDate {
  return {
    id: String(row.id),
    personId: String(row.person_id),
    label: String(row.label),
    date: String(row.date).slice(0, 10),
    yearly: row.yearly !== false,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

const DAY = 24 * 60 * 60 * 1000;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const toDay = (s: string) => Date.parse(`${s}T00:00:00Z`) / DAY;

/** The yearly date `original` in `year`; 29 Feb becomes 28 Feb in a non-leap year. */
export function occurrenceIn(original: string, year: number): string {
  const md = original.slice(5, 10);
  const y = String(year).padStart(4, '0');
  return md === '02-29' && !isLeap(year) ? `${y}-02-28` : `${y}-${md}`;
}

/** Occurrences of a date within [from, from + days]. */
function occurrences(
  original: string,
  yearly: boolean,
  from: string,
  days: number,
): { date: string; daysUntil: number; yearsSince?: number }[] {
  const start = toDay(from);
  const inWindow = (d: string) => {
    const n = toDay(d) - start;
    return n >= 0 && n <= days ? n : null;
  };
  if (!yearly) {
    const n = inWindow(original);
    return n === null ? [] : [{ date: original, daysUntil: n }];
  }
  const origYear = Number(original.slice(0, 4));
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(new Date((start + days) * DAY).toISOString().slice(0, 4));
  const out: { date: string; daysUntil: number; yearsSince?: number }[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    const date = occurrenceIn(original, y);
    const n = inWindow(date);
    if (n === null || date < original) continue;
    const years = y - origYear;
    out.push(origYear !== NO_YEAR && years > 0 ? { date, daysUntil: n, yearsSince: years } : { date, daysUntil: n });
  }
  return out;
}

function cleanLabel(label: string): string {
  const clean = label.trim();
  if (!clean) throw new Error('La etiqueta no puede estar vacía');
  return clean;
}

function checkDate(date: string): string {
  if (!isValidDate(date)) throw new Error(`Fecha inválida: ${date}`);
  return date;
}

export function createPeopleRepo(backend: DbBackend): PeopleRepo {
  return {
    async upsertPersonByName(name) {
      const clean = name.trim();
      if (!clean) throw new Error('El nombre no puede estar vacío');
      const found = await backend.select('people', { ieq: { name: clean } });
      if (found.length > 0) return rowToPerson(found[0]);
      return rowToPerson(await backend.insert('people', { name: clean }));
    },

    async listPeople() {
      const rows = await backend.select('people');
      return rows.map(rowToPerson).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    },

    async getPerson(id) {
      const [row] = await backend.select('people', { eq: { id } });
      return row ? rowToPerson(row) : null;
    },

    async upcomingDates(from, days) {
      if (!isValidDate(from)) throw new Error(`Fecha inválida: ${from}`);
      const [peopleRows, dateRows] = await Promise.all([backend.select('people'), backend.select('person_dates')]);
      const byId = new Map(peopleRows.map((r) => [String(r.id), rowToPerson(r)]));
      const out: UpcomingDate[] = [];
      for (const person of byId.values()) {
        if (!person.birthday) continue;
        for (const o of occurrences(person.birthday, true, from, days)) {
          out.push({ person, kind: 'birthday', dateId: null, label: BIRTHDAY_LABEL, ...o });
        }
      }
      for (const d of dateRows.map(rowToPersonDate)) {
        const person = byId.get(d.personId);
        if (!person) continue;
        for (const o of occurrences(d.date, d.yearly, from, days)) {
          out.push({ person, kind: 'date', dateId: d.id, label: d.label, ...o });
        }
      }
      return out.sort(
        (a, b) =>
          a.daysUntil - b.daysUntil ||
          a.person.name.localeCompare(b.person.name, 'es') ||
          a.label.localeCompare(b.label, 'es'),
      );
    },

    async listDates(personId) {
      const rows = await backend.select('person_dates', { eq: { person_id: personId } });
      return rows
        .map(rowToPersonDate)
        .sort((a, b) => a.date.slice(5).localeCompare(b.date.slice(5)) || a.label.localeCompare(b.label, 'es'));
    },

    async addDate({ personId, label, date, yearly = true, notes = null }) {
      const row = await backend.insert('person_dates', {
        person_id: personId,
        label: cleanLabel(label),
        date: checkDate(date),
        yearly,
        notes: notes?.trim() || null,
      });
      return rowToPersonDate(row);
    },

    async updateDate(id, patch) {
      const row: Row = {};
      if (patch.label !== undefined) row.label = cleanLabel(patch.label);
      if (patch.date !== undefined) row.date = checkDate(patch.date);
      if (patch.yearly !== undefined) row.yearly = patch.yearly;
      if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null;
      return rowToPersonDate(await backend.update('person_dates', id, row));
    },

    async deleteDate(id) {
      await backend.remove('person_dates', { eq: { id } });
    },

    async updatePerson(id, patch) {
      const row: Row = {};
      if (patch.name !== undefined) {
        const clean = patch.name.trim();
        if (!clean) throw new Error('El nombre no puede estar vacío');
        row.name = clean;
      }
      if (patch.birthday !== undefined) row.birthday = patch.birthday;
      if (patch.notes !== undefined) row.notes = patch.notes;
      return rowToPerson(await backend.update('people', id, row));
    },
  };
}

export function createSupabasePeopleRepo(
  client: SupabaseClient,
  opts: { userId?: string } = {},
): PeopleRepo {
  return createPeopleRepo(createSupabaseBackend(client, opts));
}
