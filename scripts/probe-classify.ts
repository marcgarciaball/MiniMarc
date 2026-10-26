/**
 * Asks Gemini to classify one note and shows exactly what came back, and how long it took:
 *   npx tsx scripts/probe-classify.ts "el miércoles que viene tengo un cumpleaños a las 19 en Casa Pepe"
 *   MODELS=gemini-3.5-flash-lite,gemini-2.5-flash-lite ROUNDS=3 npx tsx scripts/probe-classify.ts "…"
 *   (MODELS compares candidates, interleaved round by round; ROUNDS is how many turns each takes)
 *   (if the tsx CLI cannot open its IPC pipe: node --import tsx scripts/probe-classify.ts "…")
 *
 * Diagnostic only, never imported by the app: it is the one place that prints the model's raw
 * answer, so a capture that lands in "Sin clasificar" says why. Reads .env.local like `next dev`.
 * Prints the note and the answer (both local), never the API key.
 */
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { z } from 'zod';

loadEnvConfig(path.resolve(__dirname, '..'));

/** `--list`: the models this key may actually call, so a retired or unavailable one is obvious. */
async function listModels() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('Falta GEMINI_API_KEY');
    process.exit(1);
  }
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': key },
  });
  if (!res.ok) {
    console.error(`${res.status} ${res.statusText}:`, await res.text());
    process.exit(1);
  }
  const { models } = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const usable = (models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent'));
  console.log(`${usable.length} modelos que aceptan generateContent:`);
  for (const m of usable) console.log(`  ${m.name.replace(/^models\//, '')}`);
}

/** Whatever the model sent, pretty-printed: the point is to read it, not to validate it. */
const anyJson = z.unknown().transform((v) => JSON.stringify(v, null, 2));

async function main() {
  if (process.argv[2] === '--list') return listModels();

  const text = process.argv.slice(2).join(' ').trim();
  if (!text) {
    console.error('Escribe la nota: npx tsx scripts/probe-classify.ts "comprar leche mañana a las 9" (o --list)');
    process.exit(1);
  }

  // Imported after loadEnvConfig so the provider reads the key it just loaded.
  const { buildPrompt, classify } = await import('@/lib/ai/classify');
  const { createGeminiProvider, DEFAULT_GEMINI_MODEL, DEFAULT_TIMEOUT_MS } = await import('@/lib/ai/gemini');
  const { modelOutputJsonSchema } = await import('@/lib/ai/schema');
  const { DEFAULT_TZ } = await import('@/lib/time');

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  console.log(`Modelo: ${model}`);
  console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'presente' : 'AUSENTE'}`);
  console.log(`Nota: ${text}\n`);

  const ctx = { now: new Date(), tz: DEFAULT_TZ, people: [] };
  const prompt = buildPrompt(text, ctx);

  // Candidate models, measured against each other. Timings on this API swing by more than an
  // order of magnitude and drift upwards as calls pile up, so measuring one model per run (or one
  // sample per model) says more about the order than about the models. Rounds are interleaved:
  // every model takes its turn in each round, so throttling hits them all alike.
  const models = (process.env.MODELS?.split(',').map((m) => m.trim()).filter(Boolean) ?? [model]);
  const rounds = Number(process.env.ROUNDS) || 5;
  const times = new Map<string, number[]>(models.map((m) => [m, []]));
  const fits = new Map<string, number>(models.map((m) => [m, 0]));

  // One raw answer first, from the first candidate, so the model's own output can be read.
  // Skipped when comparing models: it would cost a minute and say nothing about speed.
  if (models.length === 1) {
    const raw = createGeminiProvider({ model: models[0], timeoutMs: 60_000 });
    const started = Date.now();
    try {
      const answer = await raw.generateJson(prompt, anyJson, { jsonSchema: modelOutputJsonSchema });
      console.log(`Respuesta en ${Date.now() - started} ms:`);
      console.log(answer);
    } catch (err) {
      console.error(`La llamada falló en ${Date.now() - started} ms:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nLo que la app haría con ella · ${rounds} rondas · presupuesto ${DEFAULT_TIMEOUT_MS} ms`);
  for (let i = 1; i <= rounds; i++) {
    for (const candidate of models) {
      const t0 = Date.now();
      let verdict: string;
      try {
        const out = await classify(text, ctx, createGeminiProvider({ model: candidate, timeoutMs: 60_000 }));
        verdict = out.map((c) => `${c.kind}/${c.title}${c.startsAt ? ` @${c.startsAt}` : ''}`).join(' | ') || '(sin elementos)';
      } catch (err) {
        const cause = (err as { cause?: unknown }).cause;
        verdict = `RECHAZADA → ${cause instanceof Error ? `${cause.name}: ${cause.message.slice(0, 100)}` : cause}`;
      }
      const ms = Date.now() - t0;
      times.get(candidate)!.push(ms);
      const ok = ms <= DEFAULT_TIMEOUT_MS && !verdict.startsWith('RECHAZADA');
      if (ok) fits.set(candidate, fits.get(candidate)! + 1);
      console.log(`  ronda ${i} · ${candidate}: ${ms} ms ${ok ? '✓' : '✗'} → ${verdict}`);
    }
  }

  console.log('\nResumen (✓ = clasificada y dentro del presupuesto):');
  for (const candidate of models) {
    const sorted = [...times.get(candidate)!].sort((a, b) => a - b);
    console.log(
      `  ${candidate}: ${fits.get(candidate)}/${rounds} ✓ · ` +
        `min ${sorted[0]} ms · mediana ${sorted[Math.floor(sorted.length / 2)]} ms · max ${sorted.at(-1)} ms`,
    );
  }
}

main();
