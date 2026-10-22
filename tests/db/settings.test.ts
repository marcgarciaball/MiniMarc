import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSettingsRepo } from '@/lib/db/settings';

/** Minimal client: select(cols).eq().maybeSingle(), answering per column list. */
function fakeClient(answer: (cols: string) => { data: unknown; error: { code?: string; message: string } | null }) {
  const selects: string[] = [];
  const client = {
    from: () => ({
      select: (cols: string) => {
        selects.push(cols);
        return { eq: () => ({ maybeSingle: async () => answer(cols) }) };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, selects };
}

const base = { digest_hour: 7, tz: 'Europe/Madrid', last_digest_date: null, last_digest_headline: null, last_digest_headline_date: null };

describe('createSettingsRepo · resumen semanal', () => {
  it('lee el resumen semanal y su última semana', async () => {
    const { client } = fakeClient(() => ({
      data: { ...base, weekly_digest: 'domingo', last_weekly_date: '2026-10-26', last_week_headline: 'x', last_week_headline_week: '2026-10-26' },
      error: null,
    }));
    expect(await createSettingsRepo(client, 'u').get()).toMatchObject({
      digestHour: 7,
      weeklyDigest: 'domingo',
      lastWeeklyDate: '2026-10-26',
      weekHeadline: 'x',
      weekHeadlineWeek: '2026-10-26',
    });
  });

  it('sin 0007 aplicada (columna inexistente): lo demás funciona y el semanal queda desactivado', async () => {
    const { client, selects } = fakeClient((cols) =>
      cols.includes('weekly_digest')
        ? { data: null, error: { code: '42703', message: 'column settings.weekly_digest does not exist' } }
        : { data: base, error: null },
    );
    const s = await createSettingsRepo(client, 'u').get();
    expect(s).toMatchObject({ digestHour: 7, weeklyDigest: 'off', lastWeeklyDate: null });
    expect(selects).toHaveLength(2);
  });
});
