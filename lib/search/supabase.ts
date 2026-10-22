/**
 * Search on Supabase with the query builder (session client: RLS limits it to Marc). Each term is
 * an `ilike '%term%'` on search_text (0009, normalised: no case, no accents), all of them ANDed.
 * Before 0009 (no search_text column) it falls back to an or=() of ilike over the original
 * columns: case-insensitive, but accents must match.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowToItem } from '@/lib/db/items';
import { rowToPerson } from '@/lib/db/people';
import type { Row } from '@/lib/db/backend';
import { containsPattern, orFilter, RESULTS_MAX, type SearchSource } from './query';

const ITEM_COLUMNS = ['title', 'notes', 'source_text', 'author'];
const PEOPLE_COLUMNS = ['name', 'notes'];

/** Postgres "undefined column": 0009 not applied yet. */
const missingColumn = (e: { code?: string; message?: string }) => e.code === '42703' || /search_text/.test(e.message ?? '');

export function createSupabaseSearch(client: SupabaseClient): SearchSource {
  async function find(table: 'items' | 'people', terms: string[], raw: string[], columns: string[], includeDeleted = true) {
    const base = () => {
      let q = client.from(table).select('*');
      if (table === 'items' && !includeDeleted) q = q.is('deleted_at', null);
      return q;
    };
    let q = base();
    for (const t of terms) q = q.ilike('search_text', containsPattern(t));
    let res = await q.order('created_at', { ascending: false }).limit(RESULTS_MAX);
    if (res.error && missingColumn(res.error)) {
      let fb = base();
      for (const t of raw) fb = fb.or(orFilter(columns, t));
      res = await fb.order('created_at', { ascending: false }).limit(RESULTS_MAX);
    }
    if (res.error) throw new Error(`search ${table}: ${res.error.message}`);
    return (res.data ?? []) as Row[];
  }

  return {
    async items({ terms, raw }, { includeDeleted }) {
      return (await find('items', terms, raw, ITEM_COLUMNS, includeDeleted)).map(rowToItem);
    },
    async people({ terms, raw }) {
      return (await find('people', terms, raw, PEOPLE_COLUMNS)).map(rowToPerson);
    },
  };
}
