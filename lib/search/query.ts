/**
 * The search, independent of the database: parsing the query, escaping it for LIKE and for a
 * PostgREST or=() list, and grouping the results as the app's lists are (Tareas Personal and
 * Trabajo never together). The sources (memory for tests, Supabase in production) only filter.
 */
import type { Item, Person } from '@/lib/db/types';
import { normalizeSearch } from './normalize';

/** Longest query read, words used and results per table. */
export const QUERY_MAX = 100;
export const TERMS_MAX = 6;
export const RESULTS_MAX = 100;

/** `terms`: normalised (for search_text); `raw`: lower case with accents (fallback before 0009). */
export type SearchTerms = { terms: string[]; raw: string[] };

export interface SearchSource {
  /** Items containing every term; with `includeDeleted`, soft-deleted ones too. */
  items(q: SearchTerms, opts: { includeDeleted: boolean }): Promise<Item[]>;
  /** People containing every term in their name or notes. */
  people(q: SearchTerms): Promise<Person[]>;
}

export type SearchGroupKey =
  | 'tareas-personal'
  | 'tareas-trabajo'
  | 'ideas'
  | 'compras'
  | 'regalos'
  | 'libros'
  | 'personas'
  | 'sin-clasificar'
  | 'sin-clasificar-trabajo'
  | 'papelera'
  | 'papelera-trabajo';

export type SearchGroup =
  | { key: Exclude<SearchGroupKey, 'personas'>; label: string; kind: 'items'; items: Item[] }
  | { key: 'personas'; label: string; kind: 'people'; people: Person[] };

export type SearchResults = { query: string; groups: SearchGroup[]; total: number };

/**
 * Words of the query, at most TERMS_MAX. `*` separates words: PostgREST reads it as a wildcard
 * in like/ilike filters, so it never reaches a pattern.
 */
export function parseQuery(q: string): SearchTerms {
  const words = q
    .slice(0, QUERY_MAX)
    .toLowerCase()
    .split(/[\s*]+/)
    .filter(Boolean)
    .slice(0, TERMS_MAX);
  return { terms: words.map(normalizeSearch), raw: words };
}

/** The term as a literal inside a LIKE pattern: %, _ and \ escaped with a backslash. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** `%term%`, escaped for LIKE. */
export const containsPattern = (term: string) => `%${escapeLike(term)}%`;

/**
 * A PostgREST or=() list: `col.ilike."%term%"` for each column. The value is double-quoted (with
 * \ and " escaped) so commas, parentheses and dots typed by the user stay part of the value.
 */
export function orFilter(columns: string[], term: string): string {
  const quoted = `"${containsPattern(term).replace(/[\\"]/g, (c) => `\\${c}`)}"`;
  return columns.map((c) => `${c}.ilike.${quoted}`).join(',');
}

/** Does `text` (already normalised) contain every term? For the memory source. */
export function matchesAll(text: string, terms: string[]): boolean {
  return terms.every((t) => text.includes(t));
}

const LABELS: Record<SearchGroupKey, string> = {
  'tareas-personal': 'Tareas · Personal',
  'tareas-trabajo': 'Tareas · Trabajo',
  ideas: 'Ideas',
  compras: 'Compras',
  regalos: 'Regalos',
  libros: 'Libros',
  personas: 'Personas',
  'sin-clasificar': 'Sin clasificar',
  'sin-clasificar-trabajo': 'Sin clasificar · Trabajo',
  papelera: 'Papelera',
  'papelera-trabajo': 'Papelera · Trabajo',
};

const ORDER = Object.keys(LABELS) as SearchGroupKey[];

const TYPE_GROUP = { idea: 'ideas', compra: 'compras', regalo: 'regalos', libro: 'libros' } as const;

/** Where an item goes. No area counts as Personal; Trabajo always has its own group. */
function groupOf(item: Item): Exclude<SearchGroupKey, 'personas'> {
  const trabajo = item.area === 'trabajo';
  if (item.deletedAt) return trabajo ? 'papelera-trabajo' : 'papelera';
  if (item.needsReview) return trabajo ? 'sin-clasificar-trabajo' : 'sin-clasificar';
  if (item.type === 'tarea') return trabajo ? 'tareas-trabajo' : 'tareas-personal';
  return TYPE_GROUP[item.type];
}

/** Non-empty groups in the app's order; items newest first, people by name. */
export function groupResults(items: Item[], people: Person[]): SearchGroup[] {
  const byKey = new Map<SearchGroupKey, Item[]>();
  const newest = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const item of newest) {
    const key = groupOf(item);
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }
  const groups: SearchGroup[] = [];
  for (const key of ORDER) {
    if (key === 'personas') {
      if (people.length > 0) {
        const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name, 'es'));
        groups.push({ key, label: LABELS[key], kind: 'people', people: sorted });
      }
      continue;
    }
    const list = byKey.get(key);
    if (list?.length) groups.push({ key, label: LABELS[key], kind: 'items', items: list });
  }
  return groups;
}

/** Runs the query against a source and groups the results. An empty query finds nothing. */
export async function runSearch(source: SearchSource, q: string, opts: { includeDeleted: boolean }): Promise<SearchResults> {
  const parsed = parseQuery(q);
  const query = parsed.raw.join(' ');
  if (parsed.terms.length === 0) return { query: '', groups: [], total: 0 };
  const [items, people] = await Promise.all([source.items(parsed, opts), source.people(parsed)]);
  const groups = groupResults(items, people);
  return { query, groups, total: items.length + people.length };
}
