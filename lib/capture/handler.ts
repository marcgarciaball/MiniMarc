/**
 * `POST /api/capture` (app/api/capture/route.ts), testable: the token check and the pipeline
 * deps come in through `CaptureRouteDeps`. The response is lean because a Siri Shortcut reads
 * it and speaks `message`. Never logs the Authorization header or the text.
 */
import { z } from 'zod';
import { UserError } from '@/lib/actions/result';
import { extensionCors, extensionPreflight } from '@/lib/auth/extensionCors';
import type { VerifiedToken } from '@/lib/auth/tokens';
import { isWorkTokenName } from '@/lib/auth/workToken';
import { WRITES, type DataScope } from '@/lib/cache/tags';
import type { Item } from '@/lib/db/types';
import { captureText, EmptyCaptureError, type CaptureDeps, type CaptureResult } from './pipeline';
import { saveTypedItem } from './typed';

export const MAX_CAPTURE_LENGTH = 2000;

export interface CaptureRouteDeps {
  verify(authHeader: string | null): Promise<VerifiedToken | null>;
  captureDeps(userId: string): Promise<CaptureDeps>;
  /** Expires the user's cached data (revalidateTag on the server) once a capture may have written. */
  invalidate(userId: string, scopes: readonly DataScope[]): void;
}

const bodySchema = z.object({
  text: z.string().max(MAX_CAPTURE_LENGTH),
  area: z.literal('trabajo').optional(),
  origin: z.enum(['siri', 'extension']).default('siri'),
  /** A chosen type (the extension's chips): saved directly, without the AI. Absent = Auto. */
  type: z.enum(['tarea', 'idea', 'compra', 'regalo', 'libro']).optional(),
  /** With `type: 'libro'`: the book's author (optional). */
  author: z.string().max(200).optional(),
});

// ---------- CORS (Task 15's Chrome extension) ----------

const METHODS = 'POST, OPTIONS';

export function captureOptions(req: Request): Response {
  return extensionPreflight(req, METHODS);
}

// ---------- POST ----------

const LABELS: Record<Item['type'], string> = { tarea: 'Tareas', idea: 'Ideas', compra: 'Compras', regalo: 'Regalos', libro: 'Libros' };

function destination(item: Item): string {
  if (item.needsReview) return 'Sin clasificar';
  if (item.type === 'tarea') return `Tareas · ${item.area === 'trabajo' ? 'Trabajo' : 'Personal'}`;
  return LABELS[item.type];
}

/** "Guardado en Compras, Tareas · Personal y Calendar": short, for Siri to speak. */
export function captureMessage(res: CaptureResult): string {
  const places = [
    ...new Set([
      ...res.items.map(destination),
      ...(res.eventIds.length ? ['Calendar'] : []),
      ...(res.dates?.length ? ['Personas'] : []),
    ]),
  ];
  const list = places.length > 1 ? `${places.slice(0, -1).join(', ')} y ${places.at(-1)}` : (places[0] ?? 'Sin clasificar');
  return `Guardado en ${list}`;
}

/** A token whose name contains "trabajo" (any case) is a work token. */
export function isWorkToken(token: VerifiedToken): boolean {
  return isWorkTokenName(token.name);
}

export async function handleCapture(req: Request, deps: CaptureRouteDeps): Promise<Response> {
  const cors = extensionCors(req, METHODS);
  const reply = (status: number, body: unknown) => Response.json(body, { status, headers: cors });

  try {
    const owner = await deps.verify(req.headers.get('Authorization'));
    if (!owner) return reply(401, { message: 'No autorizado' });

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return reply(400, { message: 'El cuerpo no es JSON válido' });
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some((i) => i.code === 'too_big');
      return reply(400, {
        message: tooLong ? `El texto supera los ${MAX_CAPTURE_LENGTH} caracteres` : 'Petición no válida',
      });
    }
    const { text, origin, type } = parsed.data;
    if (!text.trim()) return reply(400, { message: 'El texto está vacío' });
    // A work token ("Siri trabajo") always captures to Trabajo, whatever the body says, so a
    // misconfigured Shortcut can never send work text to the AI.
    const area = isWorkToken(owner) ? 'trabajo' : parsed.data.area;

    const captureDeps = await deps.captureDeps(owner.userId);
    let result: CaptureResult;
    try {
      result = type
        ? { items: [await saveTypedItem(type, text, { area, author: parsed.data.author }, captureDeps, origin)], eventIds: [] }
        : await captureText({ text, area, origin }, captureDeps);
    } finally {
      // Every branch, even one that failed half-way: the app must show it at once.
      deps.invalidate(owner.userId, WRITES.capture);
    }
    return reply(200, {
      items: result.items.map(({ id, type, title, area, needsReview }) => ({ id, type, title, area, needsReview })),
      eventIds: result.eventIds,
      message: captureMessage(result),
    });
  } catch (err) {
    if (err instanceof EmptyCaptureError) return reply(400, { message: 'El texto está vacío' });
    if (err instanceof UserError) return reply(400, { message: err.message });
    console.error('capture failed:', err instanceof Error ? err.message : 'unknown error');
    return reply(500, { message: 'No se ha podido guardar. Inténtalo de nuevo.' });
  }
}
