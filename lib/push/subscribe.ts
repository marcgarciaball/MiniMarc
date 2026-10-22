/**
 * POST/DELETE /api/push/subscribe (app/api/push/subscribe/route.ts), testable. The path is in
 * PUBLIC_PATHS (the proxy would redirect to /login instead of answering 401), so this handler
 * checks the Supabase session itself through `deps.userId()`.
 */
import { z } from 'zod';
import type { PushSubscriptionsRepo } from '@/lib/db/push';

export interface SubscribeDeps {
  /** The signed-in, allowed user's id, or null. */
  userId(): Promise<string | null>;
  repo(userId: string): Promise<PushSubscriptionsRepo>;
}

const endpoint = z
  .string()
  .max(2048)
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  });
const key = z.string().min(1).max(512);

const subscribeSchema = z.object({ endpoint, keys: z.object({ p256dh: key, auth: key }) });
const unsubscribeSchema = z.object({ endpoint });

const reply = (status: number, body: unknown) => Response.json(body, { status });

export async function handlePushSubscription(req: Request, deps: SubscribeDeps): Promise<Response> {
  const userId = await deps.userId();
  if (!userId) return reply(401, { message: 'No autorizado' });
  if (!(req.headers.get('Content-Type') ?? '').includes('application/json')) {
    return reply(415, { message: 'Se esperaba JSON' });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return reply(400, { message: 'El cuerpo no es JSON válido' });
  }

  if (req.method === 'DELETE') {
    const parsed = unsubscribeSchema.safeParse(raw);
    if (!parsed.success) return reply(400, { message: 'Suscripción no válida' });
    await (await deps.repo(userId)).remove(parsed.data.endpoint);
    return reply(200, { ok: true });
  }

  const parsed = subscribeSchema.safeParse(raw);
  if (!parsed.success) return reply(400, { message: 'Suscripción no válida' });
  const { endpoint: ep, keys } = parsed.data;
  await (await deps.repo(userId)).upsert({ endpoint: ep, p256dh: keys.p256dh, auth: keys.auth });
  return reply(200, { ok: true });
}
