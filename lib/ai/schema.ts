import { z } from 'zod';
import { isValidDate } from '@/lib/time';

export const CLASSIFICATION_KINDS = ['tarea', 'idea', 'compra', 'regalo', 'libro', 'cita', 'fecha'] as const;
export type ClassificationKind = (typeof CLASSIFICATION_KINDS)[number];

const optionalText = z
  .string()
  .nullish()
  .transform((s) => s?.trim() || undefined);

/** What the model must return. Unknown keys (e.g. an `area`) are stripped by zod. */
export const modelItemSchema = z.object({
  kind: z.enum(CLASSIFICATION_KINDS),
  title: z.string(),
  notes: optionalText,
  personName: optionalText,
  /** The address or place, as said ("Avinguda del Cardenal Benlloch, 4, Valencia"). */
  location: optionalText,
  /** libro: the author, as written ("Harari"). */
  author: optionalText,
  /** fecha: "Aniversario", "Santo", "Nos conocimos"… */
  label: optionalText,
  /** fecha: whether `date` carries the original year. */
  yearKnown: z.boolean().nullish(),
  /** Local date in the user's zone, "YYYY-MM-DD". */
  date: z.string().refine(isValidDate, 'Fecha no válida').nullish(),
  /** Local time in the user's zone, "HH:mm". */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida')
    .nullish(),
  confidence: z.number().min(0).max(1),
});

export const modelOutputSchema = z.object({ items: z.array(modelItemSchema) });
export type ModelOutput = z.infer<typeof modelOutputSchema>;

/**
 * The same shape as JSON Schema, for the model's structured-output mode. Asking for the shape in
 * prose is not enough: the model sometimes answers with a bare array instead of `{"items": […]}`,
 * and zod then rejects the whole note, which lands it in "Sin clasificar". Derived from the zod
 * schema so the two can never drift.
 *
 * Only the envelope is guaranteed here; zod stays the real validator. Keywords the model's schema
 * dialect does not accept (`$schema`, `pattern`) are stripped, so a tightening of the zod schema
 * can never turn into a rejected request.
 */
function forModel(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forModel);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema' || key === 'pattern') continue;
    out[key] = forModel(value);
  }
  return out;
}

export const modelOutputJsonSchema = forModel(
  z.toJSONSchema(modelOutputSchema, { io: 'input', unrepresentable: 'any' }),
);
