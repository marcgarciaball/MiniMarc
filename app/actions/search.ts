'use server';

import { unstable_rethrow } from 'next/navigation';
import { attempt, type ActionResult } from '@/lib/actions/result';
import { loadPhotoMap } from '@/lib/photos/server';
import type { PhotoMap } from '@/lib/photos/view';
import { runSearch, type SearchResults } from '@/lib/search/query';
import { createSupabaseSearch } from '@/lib/search/supabase';
import { createClient, requireUser } from '@/lib/supabase/server';

export type SearchResponse = SearchResults & { photos: PhotoMap };

/**
 * /buscar: items (title, notes, original text, author, link title) and people (name, notes),
 * without case or accents, grouped as the lists are. Deleted items only with `includeDeleted`
 * (the Papelera switch). Signed-in user only (session client, RLS). Never logs the query.
 */
export async function search(query: string, includeDeleted: boolean): Promise<ActionResult<SearchResponse>> {
  return attempt(
    async () => {
      await requireUser();
      const results = await runSearch(createSupabaseSearch(await createClient()), String(query ?? ''), {
        includeDeleted: includeDeleted === true,
      });
      const items = results.groups.flatMap((g) => (g.kind === 'items' ? g.items.filter((i) => !i.deletedAt) : []));
      return { ...results, photos: await loadPhotoMap(items) };
    },
    'No se ha podido buscar. Revisa la conexión e inténtalo de nuevo.',
    unstable_rethrow,
  );
}
