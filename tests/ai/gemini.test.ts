import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createGeminiProvider, type GenerateFn } from '@/lib/ai/gemini';

const ROOT = path.resolve(__dirname, '../..');
const SKIP = new Set(['node_modules', 'docs', 'tests']);

/** App source files; dot-entries (.next, .git, .env*) are skipped. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name) || e.name.startsWith('.')) return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(e.name) ? [full] : [];
  });
}

describe('Gemini isolation', () => {
  it('only lib/ai/gemini.ts imports @google/genai', () => {
    const importers = sourceFiles(ROOT)
      .filter((f) => readFileSync(f, 'utf8').includes('@google/genai'))
      .map((f) => path.relative(ROOT, f));
    expect(importers).toEqual([path.join('lib', 'ai', 'gemini.ts')]);
  });
});

const schema = z.object({ ok: z.boolean() });

/** No network: `generate` is a stub standing in for the SDK call. */
function provider(generate: GenerateFn, opts: { dailyCap?: number; timeoutMs?: number; now?: () => Date } = {}) {
  return createGeminiProvider({ apiKey: 'test', generate, ...opts });
}

describe('GeminiProvider', () => {
  it('parses and validates JSON output', async () => {
    const ai = provider(async () => '{"ok":true}');
    await expect(ai.generateJson('p', schema)).resolves.toEqual({ ok: true });
  });

  it('throws on invalid JSON or schema failure', async () => {
    await expect(provider(async () => '{nope').generateJson('p', schema)).rejects.toThrow();
    await expect(provider(async () => '{"ok":1}').generateJson('p', schema)).rejects.toThrow();
  });

  it('retries once after a timeout, then gives up', async () => {
    let calls = 0;
    const hang: GenerateFn = (_req, signal) => {
      calls++;
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    };
    await expect(provider(hang, { timeoutMs: 10 }).generateText('p')).rejects.toThrow();
    expect(calls).toBe(2);

    let n = 0;
    const flaky: GenerateFn = async () => {
      if (n++ === 0) throw new Error('503');
      return 'hola';
    };
    await expect(provider(flaky).generateText('p')).resolves.toBe('hola');
  });

  it.each([
    ['HTTP 429', Object.assign(new Error('Too Many Requests'), { status: 429 })],
    ['RESOURCE_EXHAUSTED', new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}')],
    ['RESOURCE_EXHAUSTED sin código', new Error('got status: RESOURCE_EXHAUSTED. Quota exceeded')],
  ])('does not retry on quota or rate-limit errors (%s)', async (_n, err) => {
    let calls = 0;
    const quota: GenerateFn = async () => {
      calls++;
      throw err;
    };
    await expect(provider(quota).generateText('p')).rejects.toBe(err);
    expect(calls).toBe(1);
  });

  it('enforces the daily call cap and resets the next Madrid day', async () => {
    let day = new Date('2026-10-21T10:00:00Z');
    const ai = provider(async () => 'x', { dailyCap: 2, now: () => day });
    await ai.generateText('a');
    await ai.generateText('b');
    await expect(ai.generateText('c')).rejects.toThrow(/tope diario/i);
    day = new Date('2026-10-22T10:00:00Z');
    await expect(ai.generateText('d')).resolves.toBe('x');
  });
});
