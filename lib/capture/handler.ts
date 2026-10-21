/**
 * `POST /api/capture` (app/api/capture/route.ts), testable: the token check and the pipeline
 * deps come in through `CaptureRouteDeps`. The response is lean because a Siri Shortcut reads
 * it and speaks `message`. Never logs the Authorization header or the text.
 */
import { z } from 'zod';
import type { VerifiedToken } from '@/lib/auth/tokens';
import type { Item } from '@/lib/db/types';
import { captureText, EmptyCaptureError, type CaptureDeps, type CaptureResult } from './pipeline';

export const MAX_CAPTURE_LENGTH = 2000;

export interface CaptureRouteDeps {
  verify(authHeader: string | null): Promise<VerifiedToken | null>;
  captureDeps(userId: string): Promise<CaptureDeps>;
}

const bodySchema = z.object({
  text: z.string().max(MAX_CAPTURE_LENGTH),
  area: z.literal('trabajo').optional(),
  origin: z.enum(['siri', 'extension']).default('siri'),
});

// ---------- CORS (Task 15's Chrome extension) ----------

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin || !EXTENSION_ORIGIN.test(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function captureOptions(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

// ---------- POST ----------

const LABELS: Record<Item['type'], string> = { tarea: 'Tareas', idea: 'Ideas', compra: 'Compras', regalo: 'Regalos' };

function destination(item: Item): string {
  if (item.needsReview) return 'Sin clasificar';
  if (item.type === 'tarea') return `Tareas · ${item.area === 'trabajo' ? 'Trabajo' : 'Personal'}`;
  return LABELS[item.type];
}

/** "Guardado en Compras, Tareas · Personal y Calendar": short, for Siri to speak. */
export function captureMessage(res: CaptureResult): string {
  const places = [...new Set([...res.items.map(destination), ...(res.eventIds.length ? ['Calendar'] : [])])];
  const list = places.length > 1 ? `${places.slice(0, -1).join(', ')} y ${places.at(-1)}` : (places[0] ?? 'Sin clasificar');
  return `Guardado en ${list}`;
}

export async function handleCapture(req: Request, deps: CaptureRouteDeps): Promise<Response> {
  const cors = corsHeaders(req);
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
    const { text, area, origin } = parsed.data;
    if (!text.trim()) return reply(400, { message: 'El texto está vacío' });

    const result = await captureText({ text, area, origin }, await deps.captureDeps(owner.userId));
    return reply(200, {
      items: result.items.map(({ id, type, title, area, needsReview }) => ({ id, type, title, area, needsReview })),
      eventIds: result.eventIds,
      message: captureMessage(result),
    });
  } catch (err) {
    if (err instanceof EmptyCaptureError) return reply(400, { message: 'El texto está vacío' });
    console.error('capture failed:', err instanceof Error ? err.message : 'unknown error');
    return reply(500, { message: 'No se ha podido guardar. Inténtalo de nuevo.' });
  }
}
