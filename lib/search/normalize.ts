/**
 * Search normalisation: lower case and no accents. The same table as public.search_normalize in
 * supabase/migrations/0009_link_preview.sql (a test checks they match), so what is stored in
 * search_text and what is searched for are normalised the same way. Pure, client-safe.
 */
export const NORMALIZE_FROM = 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿÁÀÂÄÃÅĀÉÈÊËĒÍÌÎÏĪÓÒÔÖÕØŌÚÙÛÜŪÑÇÝŸ';
export const NORMALIZE_TO = 'aaaaaaaeeeeeiiiiiooooooouuuuuncyyaaaaaaaeeeeeiiiiiooooooouuuuuncyy';

const MAP = new Map([...NORMALIZE_FROM].map((c, i) => [c, NORMALIZE_TO[i]]));

export function normalizeSearch(text: string): string {
  let out = '';
  for (const c of text.toLowerCase()) out += MAP.get(c) ?? c;
  return out;
}
