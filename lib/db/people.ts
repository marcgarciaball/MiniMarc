import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBackend, type DbBackend, type Row } from './backend';
import type { Person } from './types';

export interface PeopleRepo {
  upsertPersonByName(name: string): Promise<Person>;
  listPeople(): Promise<Person[]>;
  /** Cumpleaños (solo mes/día) entre `from` y `from + days`, ambos inclusive. */
  upcomingBirthdays(from: string, days: number): Promise<Person[]>;
}

export function rowToPerson(row: Row): Person {
  return {
    id: String(row.id),
    name: String(row.name),
    birthday: row.birthday == null ? null : String(row.birthday).slice(0, 10),
    notes: (row.notes as string | null) ?? null,
  };
}

const DAY = 24 * 60 * 60 * 1000;

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

    async upcomingBirthdays(from, days) {
      const start = Date.parse(`${from}T00:00:00Z`);
      if (Number.isNaN(start)) throw new Error(`Fecha inválida: ${from}`);
      const offsetByMonthDay = new Map<string, number>();
      for (let d = 0; d <= days; d++) {
        const md = new Date(start + d * DAY).toISOString().slice(5, 10);
        if (!offsetByMonthDay.has(md)) offsetByMonthDay.set(md, d);
      }
      const rows = await backend.select('people', { notNull: ['birthday'] });
      return rows
        .map(rowToPerson)
        .filter((p) => p.birthday && offsetByMonthDay.has(p.birthday.slice(5, 10)))
        .sort(
          (a, b) =>
            offsetByMonthDay.get(a.birthday!.slice(5, 10))! -
            offsetByMonthDay.get(b.birthday!.slice(5, 10))!,
        );
    },
  };
}

export function createSupabasePeopleRepo(
  client: SupabaseClient,
  opts: { userId?: string } = {},
): PeopleRepo {
  return createPeopleRepo(createSupabaseBackend(client, opts));
}
