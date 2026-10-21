'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { attempt, UserError, type ActionResult } from '@/lib/actions/result';
import { createApiToken, revokeApiToken } from '@/lib/auth/tokens';
import { requireUser } from '@/lib/supabase/server';

/*
 * "Tokens de acceso" in Ajustes. Server actions rather than an /api/tokens route: same-origin
 * only, protected by Next's action checks, and every call goes through requireUser().
 * The plain token travels back once, in the create result; it is never logged or stored.
 */

const NAME_MAX = 60;

/** Creates a token named after the form's `name`. Returns the plain token: show it once. */
export async function createToken(formData: FormData): Promise<ActionResult<{ id: string; token: string }>> {
  const result = await attempt(
    async () => {
      await requireUser();
      const raw = formData.get('name');
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (!name) throw new UserError('Escribe un nombre.');
      if (name.length > NAME_MAX) throw new UserError(`El nombre no puede pasar de ${NAME_MAX} caracteres.`);
      return createApiToken(name);
    },
    'No se ha podido crear el token. Revisa la conexión e inténtalo de nuevo.',
    unstable_rethrow,
  );
  if (result.ok) revalidatePath('/ajustes');
  return result;
}

/** Revokes one of Marc's tokens; Siri or the extension using it get 401 from then on. */
export async function revokeToken(id: string): Promise<ActionResult<void>> {
  const result = await attempt(
    async () => {
      await requireUser();
      await revokeApiToken(id);
    },
    'No se ha podido revocar. Revisa la conexión e inténtalo de nuevo.',
    unstable_rethrow,
  );
  if (result.ok) revalidatePath('/ajustes');
  return result;
}
