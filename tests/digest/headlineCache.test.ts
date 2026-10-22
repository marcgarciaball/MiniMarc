import { describe, expect, it } from 'vitest';
import type { AiProvider } from '@/lib/ai/provider';
import type { Settings, SettingsRepo } from '@/lib/db/settings';
import { cachedHeadlineOnly, noHeadline, weekHeadlineMode, withHeadlineCache } from '@/lib/digest/headlineCache';

function setup(initial: Partial<Settings> = {}, reply: string | Error = 'Día de pan.') {
  const state: Settings = { digestHour: 8, tz: 'Europe/Madrid', lastDigestDate: null, headline: null, headlineDate: null, weeklyDigest: 'lunes', lastWeeklyDate: null, weekHeadline: null, weekHeadlineWeek: null, ...initial };
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

describe('withHeadlineCache · semana', () => {
  it('guarda la línea semanal aparte, con el lunes; no toca el titular del día', async () => {
    const t = setup({ headline: 'Día', headlineDate: '2026-10-22' }, 'Semana de pan.');
    const ai = withHeadlineCache(t.ai, '2026-10-26', t.repo, { ...t.state }, 'week');
    expect(await ai.generateText('p')).toBe('Semana de pan.');
    expect(t.state).toMatchObject({ weekHeadline: 'Semana de pan.', weekHeadlineWeek: '2026-10-26', headline: 'Día', headlineDate: '2026-10-22' });
  });

  it('con la línea de esa semana: la devuelve sin llamar a la IA; con la de otra semana, llama', async () => {
    const t = setup({ weekHeadline: 'Ya está', weekHeadlineWeek: '2026-10-26' });
    expect(await withHeadlineCache(t.ai, '2026-10-26', t.repo, { ...t.state }, 'week').generateText('p')).toBe('Ya está');
    expect(t.calls()).toBe(0);
    await withHeadlineCache(t.ai, '2026-11-02', t.repo, { ...t.state }, 'week').generateText('p');
    expect(t.calls()).toBe(1);
  });

  it('cachedHeadlineOnly de semana: solo la guardada', async () => {
    const t = setup({ weekHeadline: 'Ya está', weekHeadlineWeek: '2026-10-26', headline: 'Día', headlineDate: '2026-10-19' });
    expect(await cachedHeadlineOnly('2026-10-26', { ...t.state }, 'week').generateText('p')).toBe('Ya está');
    await expect(cachedHeadlineOnly('2026-10-19', { ...t.state }, 'week').generateText('p')).rejects.toThrow();
  });
});

describe('cachedHeadlineOnly (GET /api/hoy, nunca gasta una llamada a la IA)', () => {
  const base: Settings = { digestHour: 8, tz: 'Europe/Madrid', lastDigestDate: null, headline: null, headlineDate: null, weeklyDigest: 'lunes', lastWeeklyDate: null, weekHeadline: null, weekHeadlineWeek: null };

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

describe('weekHeadlineMode (/semana, M-3)', () => {
  // Jueves 22-10-2026: esta semana empieza el 19, la siguiente el 26.
  it('con «lunes» o desactivado: solo esta semana genera; la siguiente reutiliza la caché', () => {
    for (const w of ['lunes', 'off'] as const) {
      expect(weekHeadlineMode('2026-10-19', '2026-10-22', w)).toBe('generate');
      expect(weekHeadlineMode('2026-10-26', '2026-10-22', w)).toBe('cached');
    }
  });

  it('con «domingo»: el domingo genera la semana siguiente (la del aviso); el resto de días, esta', () => {
    expect(weekHeadlineMode('2026-10-26', '2026-10-25', 'domingo')).toBe('generate');
    expect(weekHeadlineMode('2026-10-19', '2026-10-25', 'domingo')).toBe('cached');
    expect(weekHeadlineMode('2026-10-19', '2026-10-22', 'domingo')).toBe('generate');
    expect(weekHeadlineMode('2026-10-26', '2026-10-22', 'domingo')).toBe('cached');
  });

  it('otras semanas (pasadas o más adelante): solo recuentos, nunca la IA', () => {
    expect(weekHeadlineMode('2026-10-12', '2026-10-22', 'lunes')).toBe('none');
    expect(weekHeadlineMode('2026-11-02', '2026-10-22', 'lunes')).toBe('none');
    expect(weekHeadlineMode('2026-11-02', '2026-10-25', 'domingo')).toBe('none');
  });

  it('alternar entre esta semana y la siguiente llama a la IA una sola vez', async () => {
    const t = setup({}, 'Semana con pan.');
    const today = '2026-10-22';
    for (const week of ['2026-10-19', '2026-10-26', '2026-10-19', '2026-10-26', '2026-10-19']) {
      const settings = await t.repo.get();
      const mode = weekHeadlineMode(week, today, settings.weeklyDigest);
      const ai = mode === 'generate' ? withHeadlineCache(t.ai, week, t.repo, settings, 'week') : mode === 'cached' ? cachedHeadlineOnly(week, settings, 'week') : noHeadline();
      await ai.generateText('p').catch(() => null);
    }
    expect(t.calls()).toBe(1);
  });
});

describe('noHeadline', () => {
  it('nunca da una línea', async () => {
    await expect(noHeadline().generateText('p')).rejects.toThrow();
  });
});
