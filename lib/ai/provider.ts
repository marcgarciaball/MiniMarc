import type { ZodType } from 'zod';

export type AiCallOptions = {
  timeoutMs?: number;
  /** JSON Schema the answer must match, for providers with a structured-output mode. */
  jsonSchema?: unknown;
};

/** The app's only door to an AI model. Implementations throw on timeout, quota or invalid output. */
export interface AiProvider {
  generateJson<T>(prompt: string, schema: ZodType<T>, opts?: AiCallOptions): Promise<T>;
  generateText(prompt: string, opts?: AiCallOptions): Promise<string>;
}
