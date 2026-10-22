/**
 * Asks Gemini to classify one note and shows exactly what came back:
 *   npx tsx scripts/probe-classify.ts "el miércoles que viene tengo un cumpleaños a las 19 en Casa Pepe"
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
  const { DEFAULT_TZ } = await import('@/lib/time');

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  console.log(`Modelo: ${model}`);
  console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'presente' : 'AUSENTE'}`);
  console.log(`Nota: ${text}\n`);

  const ctx = { now: new Date(), tz: DEFAULT_TZ, people: [] };
  const prompt = buildPrompt(text, ctx);

  // The raw answer first, with a generous timeout, so a slow model is not mistaken for a bad one.
  // Asked in JSON mode, like the app: in text mode the model wraps it in a ```json fence.
  const raw = createGeminiProvider({ timeoutMs: 60_000 });
  const started = Date.now();
  let answer: string;
  try {
    answer = await raw.generateJson(prompt, anyJson);
  } catch (err) {
    console.error(`La llamada falló en ${Date.now() - started} ms:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
  const elapsed = Date.now() - started;
  console.log(`Respuesta en ${elapsed} ms (el límite de la app son ${DEFAULT_TIMEOUT_MS} ms${elapsed > DEFAULT_TIMEOUT_MS ? ' → LA APP HABRÍA CORTADO AQUÍ' : ''}):`);
  console.log(answer);

  // Then the same answer through the app's own path, which is where a bad field is rejected.
  console.log('\nLo que la app haría con ella:');
  try {
    console.dir(await classify(text, ctx, createGeminiProvider({ timeoutMs: 60_000 })), { depth: null });
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause;
    console.error('RECHAZADA →', cause instanceof Error ? `${cause.name}: ${cause.message}` : cause);
  }
}

main();
