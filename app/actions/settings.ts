'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { attempt, UserError, type ActionResult } from '@/lib/actions/result';
import { createSettingsRepo, DIGEST_HOURS, WEEKLY_OPTIONS, type WeeklyDigest } from '@/lib/db/settings';
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

/** Ajustes → "Resumen semanal": Monday 08:00, Sunday 20:00 or off. */
export async function setWeeklyDigest(value: WeeklyDigest): Promise<ActionResult<void>> {
  const result = await attempt(
    async () => {
      const user = await requireUser();
      if (!(WEEKLY_OPTIONS as readonly string[]).includes(value)) throw new UserError('Elige lunes, domingo o desactivado.');
      const repo = createSettingsRepo(await createClient(), user.id);
      await repo.get();
      await repo.update({ weeklyDigest: value });
    },
    'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.',
    unstable_rethrow,
  );
  if (result.ok) revalidatePath('/ajustes');
  return result;
}
