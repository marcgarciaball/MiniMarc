import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { classify, ClassifyError } from '@/lib/ai/classify';
import { modelOutputJsonSchema } from '@/lib/ai/schema';
import type { AiProvider } from '@/lib/ai/provider';
import { madridToUtc } from '@/lib/time';

/** Fake provider: answers with `raw` (or throws it), validated with the given schema like the real one. */
function fakeAi(raw: unknown | (() => unknown)) {
  const prompts: string[] = [];
  const schemas: unknown[] = [];
  const ai: AiProvider = {
    async generateJson<T>(prompt: string, schema: ZodType<T>, opts?: { jsonSchema?: unknown }): Promise<T> {
      prompts.push(prompt);
      schemas.push(opts?.jsonSchema);
      const value = typeof raw === 'function' ? (raw as () => unknown)() : raw;
      return schema.parse(value);
    },
    async generateText() {
      throw new Error('not used');
    },
  };
  return { ai, prompts, schemas };
}

// Wednesday 2026-10-21, 12:00 in Madrid (CEST, UTC+2).
const now = madridToUtc('2026-10-21', '12:00');
const ctx = { now, tz: 'Europe/Madrid', people: ['mamá', 'Ainhoa'] };

describe('classify', () => {
  it('splits "comprar leche y llamar a mamá" into 2 items', async () => {
    const { ai, prompts } = fakeAi({
      items: [
        { kind: 'compra', title: '  leche ', confidence: 0.95 },
        { kind: 'tarea', title: 'Llamar a mamá', confidence: 0.9 },
      ],
    });
    const out = await classify('comprar leche y llamar a mamá', ctx, ai);
    expect(out).toEqual([
      { kind: 'compra', title: 'leche', hasTime: false, confidence: 0.95 },
      { kind: 'tarea', title: 'Llamar a mamá', hasTime: false, confidence: 0.9 },
    ]);
    expect(prompts[0]).toContain('comprar leche y llamar a mamá');
    expect(prompts[0]).toContain('mamá');
    expect(prompts[0]).toContain('Ainhoa');
  });

  it('asks the model for the {items: []} envelope, which prose alone does not guarantee', async () => {
    const { ai, schemas } = fakeAi({ items: [] });
    await classify('algo', ctx, ai);
    expect(schemas[0]).toEqual(modelOutputJsonSchema);
    // Only the envelope matters here; zod stays the real validator.
    const root = modelOutputJsonSchema as { type: string; required: string[]; properties: { items: { type: string } } };
    expect(root.type).toBe('object');
    expect(root.required).toEqual(['items']);
    expect(root.properties.items.type).toBe('array');
  });

  it('strips the keywords the model\'s schema dialect rejects', () => {
    const json = JSON.stringify(modelOutputJsonSchema);
    expect(json).not.toContain('$schema');
    expect(json).not.toContain('pattern');
    // The fields the app reads are still described, so the model knows what to fill in.
    expect(json).toContain('confidence');
    expect(json).toContain('yearKnown');
  });

  it('throws ClassifyError on invalid JSON', async () => {
    const { ai } = fakeAi(() => JSON.parse('{no es json'));
    await expect(classify('algo', ctx, ai)).rejects.toBeInstanceOf(ClassifyError);
  });

  it('throws ClassifyError on timeout', async () => {
    const { ai } = fakeAi(() => {
      throw new Error('Tiempo de espera agotado');
    });
    await expect(classify('algo', ctx, ai)).rejects.toBeInstanceOf(ClassifyError);
  });

  it('throws ClassifyError when the output breaks the schema (unknown kind)', async () => {
    const { ai } = fakeAi({ items: [{ kind: 'trabajo', title: 'Informe', confidence: 0.9 }] });
    await expect(classify('algo', ctx, ai)).rejects.toBeInstanceOf(ClassifyError);
  });

  it('returns low-confidence results unchanged (threshold belongs to the caller)', async () => {
    const { ai } = fakeAi({ items: [{ kind: 'idea', title: 'Algo raro', confidence: 0.3 }] });
    const out = await classify('algo raro', ctx, ai);
    expect(out).toEqual([{ kind: 'idea', title: 'Algo raro', hasTime: false, confidence: 0.3 }]);
  });

  it('marks a time already past relative to now with confidence 0', async () => {
    const { ai } = fakeAi({
      items: [{ kind: 'tarea', title: 'Llamar al gestor', date: '2026-10-21', time: '09:00', confidence: 0.9 }],
    });
    const [item] = await classify('hoy a las 9 llamar al gestor', ctx, ai);
    expect(item.startsAt).toBe(madridToUtc('2026-10-21', '09:00').toISOString());
    expect(item.hasTime).toBe(true);
    expect(item.confidence).toBe(0);
  });

  it('keeps a date-only item for today (Madrid midnight, hasTime false)', async () => {
    const { ai } = fakeAi({ items: [{ kind: 'tarea', title: 'Pagar luz', date: '2026-10-21', confidence: 0.8 }] });
    const [item] = await classify('hoy pagar la luz', ctx, ai);
    expect(item).toEqual({
      kind: 'tarea',
      title: 'Pagar luz',
      startsAt: '2026-10-20T22:00:00.000Z',
      hasTime: false,
      confidence: 0.8,
    });
  });

  it('resolves "el jueves a las 10 médico" across the DST change to Madrid local time', async () => {
    // Sunday 2026-10-25, 11:00 Madrid: clocks went back at 03:00 that morning (CEST → CET).
    const sunday = madridToUtc('2026-10-25', '11:00');
    const { ai, prompts } = fakeAi({
      items: [{ kind: 'cita', title: 'Médico', date: '2026-10-29', time: '10:00', confidence: 0.9 }],
    });
    const [item] = await classify('el jueves a las 10 médico', { ...ctx, now: sunday }, ai);
    expect(prompts[0]).toContain('domingo');
    expect(prompts[0]).toContain('2026-10-25');
    expect(item.kind).toBe('cita');
    expect(item.startsAt).toBe('2026-10-29T09:00:00.000Z'); // 10:00 CET = 09:00 UTC
    expect(item.hasTime).toBe(true);
    expect(item.confidence).toBe(0.9);
  });

  it('never returns an area field, drops empty items and keeps regalo personName short', async () => {
    const { ai } = fakeAi({
      items: [
        { kind: 'regalo', title: ' Bufanda ', personName: ' mamá ', area: 'trabajo', confidence: 0.9 },
        { kind: 'idea', title: '   ', confidence: 0.9 },
      ],
    });
    const out = await classify('bufanda para mamá', ctx, ai);
    expect(out).toEqual([{ kind: 'regalo', title: 'Bufanda', personName: 'mamá', hasTime: false, confidence: 0.9 }]);
    expect(out[0]).not.toHaveProperty('area');
  });

  it('marks a cita without time with confidence 0 (doubt → Sin clasificar)', async () => {
    const { ai } = fakeAi({ items: [{ kind: 'cita', title: 'Cena con Ainhoa', date: '2026-10-23', confidence: 0.9 }] });
    const [item] = await classify('cena con Ainhoa el viernes', ctx, ai);
    expect(item.confidence).toBe(0);
  });

  it('fecha: "el 14 de febrero es nuestro aniversario con Ainhoa" → persona, etiqueta y fecha sin año', async () => {
    const { ai, prompts } = fakeAi({
      items: [
        {
          kind: 'fecha',
          title: 'Aniversario con Ainhoa',
          personName: 'Ainhoa',
          label: ' Aniversario ',
          date: '2027-02-14',
          yearKnown: false,
          confidence: 0.9,
        },
      ],
    });
    const out = await classify('el 14 de febrero es nuestro aniversario con Ainhoa', ctx, ai);
    expect(out).toEqual([
      {
        kind: 'fecha',
        title: 'Aniversario con Ainhoa',
        personName: 'Ainhoa',
        label: 'Aniversario',
        date: '1604-02-14',
        hasTime: false,
        confidence: 0.9,
      },
    ]);
    expect(prompts[0]).toMatch(/- fecha:/);
    expect(prompts[0]).toContain('yearKnown');
  });

  it('fecha con año conocido y ya pasada conserva el año y la confianza', async () => {
    const { ai } = fakeAi({
      items: [
        { kind: 'fecha', title: 'Nos conocimos', personName: 'Ainhoa', label: 'Nos conocimos', date: '2019-05-03', yearKnown: true, confidence: 0.85 },
      ],
    });
    const [item] = await classify('conocí a Ainhoa el 3 de mayo de 2019', ctx, ai);
    expect(item).toMatchObject({ kind: 'fecha', date: '2019-05-03', confidence: 0.85 });
    expect(item.startsAt).toBeUndefined();
  });

  it('fecha sin persona, etiqueta o fecha → confianza 0', async () => {
    const { ai } = fakeAi({
      items: [
        { kind: 'fecha', title: 'Aniversario', label: 'Aniversario', date: '2027-02-14', confidence: 0.9 },
        { kind: 'fecha', title: 'Algo de Ainhoa', personName: 'Ainhoa', date: '2027-02-14', confidence: 0.9 },
        { kind: 'fecha', title: 'Santo de Ainhoa', personName: 'Ainhoa', label: 'Santo', confidence: 0.9 },
      ],
    });
    const out = await classify('algo', ctx, ai);
    expect(out.map((o) => o.confidence)).toEqual([0, 0, 0]);
  });
});

describe('classify: ubicación', () => {
  it('saca la ubicación de una nota que la trae escrita', async () => {
    const { ai } = fakeAi({
      items: [{ kind: 'cita', title: 'Renovar carnet de conducir', location: 'Avinguda del Cardenal Benlloch, 4, Valencia',
                date: '2026-11-04', time: '17:40', confidence: 0.95 }],
    });
    const [c] = await classify('Renovar carnet de conducir Fecha: 04-11-2026 17:40 Ubicación: Avinguda del Cardenal Benlloch, 4, Valencia', ctx, ai);
    expect(c.location).toBe('Avinguda del Cardenal Benlloch, 4, Valencia');
    expect(c.title).toBe('Renovar carnet de conducir');
  });

  it('la lista de claves del contrato JSON incluye location', async () => {
    const { ai, prompts } = fakeAi({ items: [] });
    await classify('algo', ctx, ai);
    expect(prompts[0]).toMatch(/\{"items":\[\{"kind".*"location".*\}\]\}/);
  });

  it('no inventa ubicación cuando no se dice ninguna', async () => {
    const { ai } = fakeAi({ items: [{ kind: 'compra', title: 'leche', confidence: 0.9 }] });
    expect((await classify('comprar leche', ctx, ai))[0].location).toBeUndefined();
  });
});

describe('classify: libros', () => {
  it('"quiero leer Sapiens de Harari" → libro con título y autor', async () => {
    const { ai, prompts } = fakeAi({
      items: [{ kind: 'libro', title: ' Sapiens ', author: ' Harari ', notes: null, date: null, time: null, confidence: 0.9 }],
    });
    const out = await classify('quiero leer Sapiens de Harari', ctx, ai);
    expect(out).toEqual([{ kind: 'libro', title: 'Sapiens', author: 'Harari', hasTime: false, confidence: 0.9 }]);
    expect(prompts[0]).toContain('- libro:');
    expect(prompts[0]).toContain('"author"');
  });

  it('un libro sin autor no lleva author', async () => {
    const { ai } = fakeAi({ items: [{ kind: 'libro', title: 'Dune', author: null, confidence: 0.8 }] });
    expect(await classify('leer Dune', ctx, ai)).toEqual([{ kind: 'libro', title: 'Dune', hasTime: false, confidence: 0.8 }]);
  });

  it('el autor solo se conserva en los libros', async () => {
    const { ai } = fakeAi({ items: [{ kind: 'idea', title: 'Algo', author: 'Alguien', confidence: 0.8 }] });
    expect(await classify('algo', ctx, ai)).toEqual([{ kind: 'idea', title: 'Algo', hasTime: false, confidence: 0.8 }]);
  });
});
