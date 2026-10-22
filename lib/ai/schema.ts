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
