/**
 * Keeps the free Gemini quota safe: the digest headline is generated at most once per local
 * day and stored in settings (last_digest_headline / _date). The cron and /hoy share it, so the
 * morning push usually pays the only call of the day. Failures are not cached (buildDigest falls
 * back to "Buenos días"; Gemini's own daily cap still applies).
 */
import { addDays, weekRange } from '@/lib/agenda/week';
import type { AiProvider } from '@/lib/ai/provider';
import type { Settings, SettingsRepo, WeeklyDigest } from '@/lib/db/settings';

/**
 * 'day' = the morning digest's headline (key: the local date); 'week' = the weekly line
 * (key: the week's Monday), cached the same way in last_week_headline / _week.
 */
export type HeadlineSlot = 'day' | 'week';

const FIELDS = {
  day: { text: 'headline', key: 'headlineDate' },
  week: { text: 'weekHeadline', key: 'weekHeadlineWeek' },
} as const;

function cached(current: Settings, key: string, slot: HeadlineSlot): string | null {
  const f = FIELDS[slot];
  return current[f.key] === key && current[f.text] ? current[f.text] : null;
}

export function withHeadlineCache(
  ai: AiProvider,
  date: string,
  repo: SettingsRepo,
  current: Settings,
  slot: HeadlineSlot = 'day',
): AiProvider {
  return {
    generateJson: (prompt, schema, opts) => ai.generateJson(prompt, schema, opts),
    async generateText(prompt, opts) {
      const hit = cached(current, date, slot);
      if (hit) return hit;
      const text = await ai.generateText(prompt, opts);
      const f = FIELDS[slot];
      await repo.update({ [f.text]: text, [f.key]: date }).catch(() => {});
      return text;
    },
  };
}

/**
 * For GET /api/hoy (the extension): today's cached headline, or an error so buildDigest falls
 * back to "Buenos días". Never calls the AI, so the extension never spends the day's quota.
 */
export function cachedHeadlineOnly(date: string, current: Settings, slot: HeadlineSlot = 'day'): AiProvider {
  return {
    async generateJson() {
      throw new Error('AI disabled');
    },
    async generateText() {
      const hit = cached(current, date, slot);
      if (hit) return hit;
      throw new Error('no cached headline');
    },
  };
}

/** No AI line at all: the week shows its counts-only summary. */
export function noHeadline(): AiProvider {
  return {
    async generateJson() {
      throw new Error('AI disabled');
    },
    async generateText() {
      throw new Error('AI disabled');
    },
  };
}

/**
 * How /semana gets the week's AI line (M-3). There is a single weekly cache slot, so only one
 * week may generate: the one the weekly push targets now (next week on Sundays with «domingo»,
 * otherwise this week; the cron uses the same week, so they share the call). The other of this
 * and next week only reuses a cached line; any other week is counts-only. Flipping between
 * weeks never pays a second Gemini call.
 */
export type WeekHeadlineMode = 'generate' | 'cached' | 'none';

export function weekHeadlineMode(weekStart: string, today: string, weekly: WeeklyDigest): WeekHeadlineMode {
  const thisWeek = weekRange(today).start;
  const nextWeek = addDays(thisWeek, 7);
  if (weekStart !== thisWeek && weekStart !== nextWeek) return 'none';
  const sunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
  const target = weekly === 'domingo' && sunday ? nextWeek : thisWeek;
  return weekStart === target ? 'generate' : 'cached';
}
