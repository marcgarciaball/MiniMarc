import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TZ } from '@/lib/time';

export const DEFAULT_DIGEST_HOUR = 8;
/** Hours offered in Ajustes for the morning digest. */
export const DIGEST_HOURS = [6, 7, 8, 9, 10, 11] as const;

export interface Settings {
  digestHour: number;
  tz: string;
  /** Local date of the last morning push ("YYYY-MM-DD"). */
  lastDigestDate: string | null;
  /** Cached digest headline (one AI call per day) and the local date it belongs to. */
  headline: string | null;
  headlineDate: string | null;
}

export type SettingsPatch = Partial<Settings>;

export interface SettingsRepo {
  /** The user's row; created with the defaults (8 h, APP_TZ or Europe/Madrid) if missing. */
  get(): Promise<Settings>;
  update(patch: SettingsPatch): Promise<void>;
}

const COLUMNS = {
  digestHour: 'digest_hour',
  tz: 'tz',
  lastDigestDate: 'last_digest_date',
  headline: 'last_digest_headline',
  headlineDate: 'last_digest_headline_date',
} as const satisfies Record<keyof Settings, string>;

const SELECT = Object.values(COLUMNS).join(', ');

function rowToSettings(row: Record<string, unknown>): Settings {
  return {
    digestHour: Number(row.digest_hour ?? DEFAULT_DIGEST_HOUR),
    tz: String(row.tz || DEFAULT_TZ),
    lastDigestDate: (row.last_digest_date as string | null) ?? null,
    headline: (row.last_digest_headline as string | null) ?? null,
    headlineDate: (row.last_digest_headline_date as string | null) ?? null,
  };
}

export function defaultTz(): string {
  return process.env.APP_TZ || DEFAULT_TZ;
}

/**
 * Settings of `userId`. Works with the session client (RLS) and with the service-role client
 * (cron); every query is filtered by `user_id` either way.
 */
export function createSettingsRepo(client: SupabaseClient, userId: string): SettingsRepo {
  async function read(): Promise<Settings | null> {
    const res = await client.from('settings').select(SELECT).eq('user_id', userId).maybeSingle();
    if (res.error) throw new Error(`select settings: ${res.error.message}`);
    return res.data ? rowToSettings(res.data as unknown as Record<string, unknown>) : null;
  }
  return {
    async get() {
      const found = await read();
      if (found) return found;
      const ins = await client
        .from('settings')
        .upsert({ user_id: userId, digest_hour: DEFAULT_DIGEST_HOUR, tz: defaultTz() }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (ins.error) throw new Error(`insert settings: ${ins.error.message}`);
      const created = await read();
      if (!created) throw new Error('settings: no se pudo crear la fila');
      return created;
    },
    async update(patch) {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) row[COLUMNS[k as keyof Settings]] = v;
      const res = await client.from('settings').update(row).eq('user_id', userId);
      if (res.error) throw new Error(`update settings: ${res.error.message}`);
    },
  };
}
