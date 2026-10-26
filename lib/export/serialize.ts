/**
 * "Tus datos" (Ajustes): everything of Marc's, as JSON (all of it) or CSV (the items).
 * Pure; the route (app/api/export/route.ts) reads the data with the session client.
 */
import type { DbBackend } from '@/lib/db/backend';
import { rowToItem } from '@/lib/db/items';
import { rowToPerson, rowToPersonDate } from '@/lib/db/people';
import { rowToPhoto, type ItemPhoto } from '@/lib/db/photos';
import type { WeeklyDigest } from '@/lib/db/settings';
import type { Item, Person, PersonDate } from '@/lib/db/types';

export type ExportFormat = 'json' | 'csv';

/** User preferences only: no caches, no credentials. */
export interface ExportSettings {
  digestHour: number;
  tz: string;
  weeklyDigest: WeeklyDigest;
}

/** A token's name and dates; the hash never leaves the database. */
export interface ExportToken {
  name: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface ExportData {
  exportedAt: string;
  /** All of them, deleted ones (Papelera) included with their deletedAt. */
  items: Item[];
  people: Person[];
  personDates: PersonDate[];
  /** Storage paths in the private `photos` bucket, not signed URLs. */
  photos: ItemPhoto[];
  settings: ExportSettings | null;
  apiTokens: ExportToken[];
}

/** CSV column order: stable, one per Item field. */
export const CSV_COLUMNS = [
  'id',
  'type',
  'title',
  'notes',
  'area',
  'dueAt',
  'hasTime',
  'status',
  'personId',
  'origin',
  'needsReview',
  'confidence',
  'calendarEventId',
  'syncError',
  'sourceText',
  'author',
  'readingState',
  'link',
  'linkTitle',
  'linkImage',
  'linkSite',
  'location',
  'aiState',
  'createdAt',
  'deletedAt',
] as const satisfies readonly (keyof Item)[];

/** Spreadsheets run a cell starting with one of these as a formula (CSV injection): prefix «'». */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(v: unknown): string {
  if (v == null) return '';
  const raw = String(v);
  const s = FORMULA_START.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Whitelists the fields, so nothing extra (a token hash, a cache) can slip in. */
function clean(data: ExportData): ExportData {
  return {
    exportedAt: data.exportedAt,
    items: data.items.map((i) => Object.fromEntries(CSV_COLUMNS.map((c) => [c, i[c] ?? null])) as unknown as Item),
    people: data.people.map(({ id, name, birthday, notes }) => ({ id, name, birthday, notes })),
    personDates: data.personDates.map(({ id, personId, label, date, yearly, notes, createdAt }) => ({ id, personId, label, date, yearly, notes, createdAt })),
    photos: data.photos.map(({ id, itemId, path, width, height, createdAt }) => ({ id, itemId, path, width, height, createdAt })),
    settings: data.settings && { digestHour: data.settings.digestHour, tz: data.settings.tz, weeklyDigest: data.settings.weeklyDigest },
    apiTokens: data.apiTokens.map(({ name, createdAt, revokedAt }) => ({ name, createdAt, revokedAt })),
  };
}

export function serializeExport(data: ExportData, fmt: ExportFormat): string {
  if (fmt === 'json') return JSON.stringify(clean(data), null, 2);
  // RFC 4180: CRLF between records. The route adds the UTF-8 BOM (Excel and accents).
  const lines = [CSV_COLUMNS.join(','), ...data.items.map((i) => CSV_COLUMNS.map((c) => csvCell(i[c])).join(','))];
  return `${lines.join('\r\n')}\r\n`;
}

export function exportFilename(day: string, fmt: ExportFormat): string {
  return `agente-personal-${day}.${fmt}`;
}

export interface CollectDeps {
  /** Session backend (RLS: only Marc's rows). */
  backend: DbBackend;
  settings: () => Promise<ExportSettings>;
  tokens: () => Promise<ExportToken[]>;
  now?: () => Date;
}

/** Optional parts (later migrations, settings, tokens) export as empty if they cannot be read. */
async function orEmpty<T>(what: string, read: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await read();
  } catch (err) {
    console.error(`export: ${what}:`, err instanceof Error ? err.message : 'unknown error');
    return empty;
  }
}

export async function collectExport(deps: CollectDeps): Promise<ExportData> {
  const { backend } = deps;
  const [items, people, personDates, photos, settings, tokens] = await Promise.all([
    backend.select('items').then((rows) => rows.map(rowToItem).sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
    backend.select('people').then((rows) => rows.map(rowToPerson).sort((a, b) => a.name.localeCompare(b.name, 'es'))),
    orEmpty('person_dates', async () => (await backend.select('person_dates')).map(rowToPersonDate), [] as PersonDate[]),
    orEmpty('item_photos', async () => (await backend.select('item_photos')).map(rowToPhoto), [] as ItemPhoto[]),
    orEmpty<ExportSettings | null>('settings', deps.settings, null),
    orEmpty('api_tokens', deps.tokens, [] as ExportToken[]),
  ]);
  return {
    exportedAt: (deps.now?.() ?? new Date()).toISOString(),
    items,
    people,
    personDates,
    photos,
    settings: settings && { digestHour: settings.digestHour, tz: settings.tz, weeklyDigest: settings.weeklyDigest },
    apiTokens: tokens.map(({ name, createdAt, revokedAt }) => ({ name, createdAt, revokedAt })),
  };
}
