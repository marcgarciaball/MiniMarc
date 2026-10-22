import { describe, expect, it } from 'vitest';
import type { AiProvider } from '@/lib/ai/provider';
import type { Settings, SettingsRepo } from '@/lib/db/settings';
import { cachedHeadlineOnly, withHeadlineCache } from '@/lib/digest/headlineCache';

function setup(initial: Partial<Settings> = {}, reply: string | Error = 'Día de pan.') {
  const state: Settings = { digestHour: 8, tz: 'Europe/Madrid', lastDigestDate: null, headline: null, headlineDate: null, ...initial };
  const repo: SettingsRepo = {
    async get() {
      return { ...state };
    },
    async update(p) {
      Object.assign(state, p);
    },
  };
  let calls = 0;
  const ai: AiProvider = {
    async generateJson() {
      throw new Error('no');
    },
    async generateText() {
      calls++;
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { state, repo, ai, calls: () => calls };
}

describe('withHeadlineCache', () => {
  it('sin titular de hoy: llama a la IA una vez y lo guarda con la fecha', async () => {
    const t = setup({ headline: 'viejo', headlineDate: '2026-10-21' });
    const ai = withHeadlineCache(t.ai, '2026-10-22', t.repo, { ...t.state });
    expect(await ai.generateText('p')).toBe('Día de pan.');
    expect(t.calls()).toBe(1);
    expect(t.state).toMatchObject({ headline: 'Día de pan.', headlineDate: '2026-10-22' });
  });

  it('con titular de hoy: lo devuelve sin llamar a la IA', async () => {
    const t = setup({ headline: 'Ya está', headlineDate: '2026-10-22' });
    const ai = withHeadlineCache(t.ai, '2026-10-22', t.repo, { ...t.state });
    expect(await ai.generateText('p')).toBe('Ya está');
    expect(t.calls()).toBe(0);
  });

  it('si la IA falla, propaga el error y no guarda nada', async () => {
    const t = setup({}, new Error('429'));
    const ai = withHeadlineCache(t.ai, '2026-10-22', t.repo, { ...t.state });
    await expect(ai.generateText('p')).rejects.toThrow('429');
    expect(t.state.headline).toBeNull();
  });
});

describe('cachedHeadlineOnly (GET /api/hoy, nunca gasta una llamada a la IA)', () => {
  const base: Settings = { digestHour: 8, tz: 'Europe/Madrid', lastDigestDate: null, headline: null, headlineDate: null };

  it('devuelve el titular guardado de hoy', async () => {
    const ai = cachedHeadlineOnly('2026-10-22', { ...base, headline: 'Ya está', headlineDate: '2026-10-22' });
    expect(await ai.generateText('p')).toBe('Ya está');
  });

  it('sin titular de hoy lanza (buildDigest usa "Buenos días"); generateJson también lanza', async () => {
    const ai = cachedHeadlineOnly('2026-10-22', { ...base, headline: 'viejo', headlineDate: '2026-10-21' });
    await expect(ai.generateText('p')).rejects.toThrow();
    await expect(ai.generateJson('p', {} as never)).rejects.toThrow();
  });
});
