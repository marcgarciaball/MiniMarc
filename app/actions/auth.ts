'use server';

import { createClient } from '@/lib/supabase/server';

/** "Cerrar sesión": ends the Supabase session (cookies cleared). The browser then empties the SW caches. */
export async function signOut(): Promise<{ ok: boolean }> {
  const { error } = await (await createClient()).auth.signOut();
  return { ok: !error };
}
