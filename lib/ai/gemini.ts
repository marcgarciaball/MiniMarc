import { GoogleGenAI } from '@google/genai';
import type { ZodType } from 'zod';
import type { AiCallOptions, AiProvider } from '@/lib/ai/provider';
import { DEFAULT_TZ, toMadrid } from '@/lib/time';

// The only module allowed to import the Gemini SDK (enforced by tests/ai/gemini.test.ts).
// Never log prompts, responses or the key here.

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_DAILY_CAP = 200;

export type GenerateRequest = { model: string; prompt: string; json: boolean };
/** One SDK call returning the response text. Injectable so tests never touch the network. */
export type GenerateFn = (req: GenerateRequest, signal: AbortSignal) => Promise<string>;

/** Calls per Madrid day, in memory, per server instance. */
export type DailyCounter = { day: string; count: number };
export const createDailyCounter = (): DailyCounter => ({ day: '', count: 0 });
const sharedCounter = createDailyCounter();

export type GeminiOptions = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  dailyCap?: number;
  generate?: GenerateFn;
  counter?: DailyCounter;
  now?: () => Date;
};

function sdkGenerate(apiKey: string | undefined): GenerateFn {
  let client: GoogleGenAI | undefined;
  return async ({ model, prompt, json }, signal) => {
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY');
    client ??= new GoogleGenAI({ apiKey });
    const res = await client.models.generateContent({
      model,
      contents: prompt,
      config: { abortSignal: signal, ...(json ? { responseMimeType: 'application/json' } : {}) },
    });
    const text = res.text;
    if (!text) throw new Error('Respuesta vacía de Gemini');
    return text;
  };
}

function withTimeout(generate: GenerateFn, req: GenerateRequest, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error('Tiempo de espera agotado'));
    }, timeoutMs);
    generate(req, ctrl.signal).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * HTTP 429 / RESOURCE_EXHAUSTED: quota or rate limit. A retry would only fail again and burn
 * another call of the small free-tier budget, so these are not retried.
 */
export function isQuotaError(err: unknown): boolean {
  const e = (err ?? {}) as { status?: unknown; code?: unknown; message?: unknown };
  if (Number(e.status) === 429 || Number(e.code) === 429) return true;
  return typeof e.message === 'string' && /RESOURCE_EXHAUSTED|"code"\s*:\s*429\b/.test(e.message);
}

function positiveInt(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function createGeminiProvider(opts: GeminiOptions = {}): AiProvider {
  const model = opts.model ?? (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
  const dailyCap = opts.dailyCap ?? positiveInt(process.env.GEMINI_DAILY_CAP) ?? DEFAULT_DAILY_CAP;
  const generate = opts.generate ?? sdkGenerate(opts.apiKey ?? process.env.GEMINI_API_KEY);
  const counter = opts.counter ?? (opts.generate ? createDailyCounter() : sharedCounter);
  const now = opts.now ?? (() => new Date());

  function takeCall() {
    const day = toMadrid(now(), DEFAULT_TZ).date;
    if (counter.day !== day) {
      counter.day = day;
      counter.count = 0;
    }
    if (counter.count >= dailyCap) throw new Error('Tope diario de llamadas a Gemini alcanzado');
    counter.count++;
  }

  async function call(prompt: string, json: boolean, callOpts?: AiCallOptions): Promise<string> {
    const timeoutMs = callOpts?.timeoutMs ?? opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const req = { model, prompt, json };
    takeCall();
    try {
      return await withTimeout(generate, req, timeoutMs);
    } catch (err) {
      if (isQuotaError(err)) throw err;
      takeCall(); // One retry, which also counts against the cap.
      return withTimeout(generate, req, timeoutMs);
    }
  }

  return {
    async generateJson<T>(prompt: string, schema: ZodType<T>, callOpts?: AiCallOptions): Promise<T> {
      const text = await call(prompt, true, callOpts);
      return schema.parse(JSON.parse(text));
    },
    generateText(prompt: string, callOpts?: AiCallOptions) {
      return call(prompt, false, callOpts);
    },
  };
}
