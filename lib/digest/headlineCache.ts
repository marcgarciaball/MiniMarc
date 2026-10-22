/**
 * Keeps the free Gemini quota safe: the digest headline is generated at most once per local
 * day and stored in settings (last_digest_headline / _date). The cron and /hoy share it, so the
 * morning push usually pays the only call of the day. Failures are not cached (buildDigest falls
 * back to "Buenos días"; Gemini's own daily cap still applies).
 */
import type { AiProvider } from '@/lib/ai/provider';
import type { Settings, SettingsRepo } from '@/lib/db/settings';

export function withHeadlineCache(ai: AiProvider, date: string, repo: SettingsRepo, current: Settings): AiProvider {
  return {
    generateJson: (prompt, schema, opts) => ai.generateJson(prompt, schema, opts),
    async generateText(prompt, opts) {
      if (current.headlineDate === date && current.headline) return current.headline;
      const text = await ai.generateText(prompt, opts);
      await repo.update({ headline: text, headlineDate: date }).catch(() => {});
      return text;
    },
  };
}

/**
 * For GET /api/hoy (the extension): today's cached headline, or an error so buildDigest falls
 * back to "Buenos días". Never calls the AI, so the extension never spends the day's quota.
 */
export function cachedHeadlineOnly(date: string, current: Settings): AiProvider {
  return {
    async generateJson() {
      throw new Error('AI disabled');
    },
    async generateText() {
      if (current.headlineDate === date && current.headline) return current.headline;
      throw new Error('no cached headline');
    },
  };
}
