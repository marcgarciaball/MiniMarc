import { describe, expect, it } from 'vitest';
import type { AiProvider } from '@/lib/ai/provider';
import { buildDigest, FALLBACK_HEADLINE } from '@/lib/digest/build';
import { deferHeadline, DEFERRED_HEADLINE } from '@/lib/digest/deferredHeadline';

const provider = (text: string | Error): AiProvider => ({
  async generateJson() {
    throw new Error('unused');
  },
  async generateText() {
    if (text instanceof Error) throw text;
    return text;
  },
});

describe('deferHeadline', () => {
  it('answers at once with the cached line', async () => {
    const d = deferHeadline(provider('Día de dentista'));
    expect(await d.ai.generateText('prompt')).toBe('Día de dentista');
    expect(d.prompt()).toBeNull();
  });

  it('without a cached line, records the prompt and answers the placeholder', async () => {
    const d = deferHeadline(provider(new Error('no cached headline')));
    expect(await d.ai.generateText('el prompt')).toBe(DEFERRED_HEADLINE);
    expect(d.prompt()).toBe('el prompt');
  });

  it('survives askOneLine inside buildDigest untouched (the page knows to stream it)', async () => {
    const d = deferHeadline(provider(new Error('no cached headline')));
    const digest = await buildDigest('2026-10-22', {
      items: { listItems: async () => [{ id: 'i1', type: 'tarea', title: 'Llamar', area: 'personal', status: 'pendiente', dueAt: '2026-10-22T08:00:00Z', hasTime: true, needsReview: false }] },
      people: { upcomingDates: async () => [] },
      calendar: async () => ({ listEvents: async () => [] }),
      ai: d.ai,
      tz: 'Europe/Madrid',
      now: new Date('2026-10-22T06:00:00Z'),
    } as never);
    expect(digest.headline).toBe(DEFERRED_HEADLINE);
    expect(d.prompt()).toContain('Llamar');
    expect(DEFERRED_HEADLINE).not.toBe(FALLBACK_HEADLINE);
  });
});
