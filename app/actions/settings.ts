'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { attempt, UserError, type ActionResult } from '@/lib/actions/result';
import { createSettingsRepo, DIGEST_HOURS } from '@/lib/db/settings';
import { createClient, requireUser } from '@/lib/supabase/server';

/** Ajustes → "Resumen de la mañana": the local hour (6–11) of the morning push. */
export async function setDigestHour(hour: number): Promise<ActionResult<void>> {
  const result = await attempt(
    async () => {
      const user = await requireUser();
      if (!(DIGEST_HOURS as readonly number[]).includes(hour)) throw new UserError('Elige una hora entre las 6 y las 11.');
      const repo = createSettingsRepo(await createClient(), user.id);
      await repo.get();
      await repo.update({ digestHour: hour });
    },
    'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.',
    unstable_rethrow,
  );
  if (result.ok) revalidatePath('/ajustes');
  return result;
}
