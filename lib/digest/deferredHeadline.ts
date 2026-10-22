/**
 * Lets /hoy and /semana paint before the AI answers: the digest is built with a provider that
 * returns an already-cached line at once, and otherwise records the prompt and answers
 * DEFERRED_HEADLINE. The page then streams the real line in its own Suspense boundary
 * (askOneLine with the real, cached provider). Pure: unit-tested.
 */
import type { AiProvider } from '@/lib/ai/provider';

/** Placeholder headline: "the line is still to be generated" (never shown). */
export const DEFERRED_HEADLINE = '__headline_pending__';

export function deferHeadline(cachedOnly: AiProvider): { ai: AiProvider; prompt: () => string | null } {
  let captured: string | null = null;
  return {
    ai: {
      generateJson: (prompt, schema, opts) => cachedOnly.generateJson(prompt, schema, opts),
      async generateText(prompt, opts) {
        try {
          return await cachedOnly.generateText(prompt, opts);
        } catch {
          captured = prompt;
          return DEFERRED_HEADLINE;
        }
      },
    },
    prompt: () => captured,
  };
}
