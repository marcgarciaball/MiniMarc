/** Search over the memory backend (tests): the same normalisation as search_text in 0009. */
import type { DbBackend } from '@/lib/db/backend';
import { rowToItem } from '@/lib/db/items';
import { rowToPerson } from '@/lib/db/people';
import { normalizeSearch } from './normalize';
import { matchesAll, RESULTS_MAX, type SearchSource } from './query';

const text = (...parts: unknown[]) => normalizeSearch(parts.map((p) => (typeof p === 'string' ? p : '')).join(' '));

export function createMemorySearch(backend: DbBackend): SearchSource {
  return {
    async items({ terms }, { includeDeleted }) {
      const rows = await backend.select('items', includeDeleted ? {} : { isNull: ['deleted_at'] });
      return rows
        .filter((r) => matchesAll(text(r.title, r.notes, r.source_text, r.author, r.link_title), terms))
        .map(rowToItem)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, RESULTS_MAX);
    },
    async people({ terms }) {
      const rows = await backend.select('people');
      return rows.filter((r) => matchesAll(text(r.name, r.notes), terms)).map(rowToPerson).slice(0, RESULTS_MAX);
    },
  };
}
