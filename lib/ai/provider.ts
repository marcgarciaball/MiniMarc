import type { ZodType } from 'zod';

export type AiCallOptions = { timeoutMs?: number };

/** The app's only door to an AI model. Implementations throw on timeout, quota or invalid output. */
export interface AiProvider {
  generateJson<T>(prompt: string, schema: ZodType<T>, opts?: AiCallOptions): Promise<T>;
  generateText(prompt: string, opts?: AiCallOptions): Promise<string>;
}
