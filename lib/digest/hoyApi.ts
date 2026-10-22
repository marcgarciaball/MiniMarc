/**
 * `GET /api/hoy` (app/api/hoy/route.ts), testable: the token check and the digest come in
 * through `HoyRouteDeps`. Same auth and CORS as POST /api/capture. A lean JSON for the
 * extension's popup: no notes, no source text, no special dates. A Trabajo token still gets both
 * areas (it is Marc's own data; the Trabajo rule only concerns the AI). Never logs the header.
 */
import { extensionCors, extensionPreflight } from '@/lib/auth/extensionCors';
import type { VerifiedToken } from '@/lib/auth/tokens';
import type { Area } from '@/lib/db/types';
import type { Digest, DigestArea, DigestCalendarError } from './build';

export interface HoyRouteDeps {
  verify(authHeader: string | null): Promise<VerifiedToken | null>;
  /** Today's (Madrid) digest for the token's owner, without spending an AI call. */
  digest(userId: string): Promise<Digest>;
}

export type HoyTask = { id: string; title: string; dueAt: string | null; hasTime: boolean; overdue: boolean };

/** Mirrored by `HoySummary` in extension/lib/api.ts (a test checks they match). */
export type HoyResponse = {
  date: string;
  headline: string;
  events: { id: string; title: string; startsAt: string; endsAt: string }[];
  calendarError: DigestCalendarError | null;
  tasks: Record<Area, { items: HoyTask[]; more: number }>;
  unclassified: number;
};

const METHODS = 'GET, OPTIONS';

function leanArea(a: DigestArea): HoyResponse['tasks'][Area] {
  return {
    items: a.items.map(({ item, overdue }) => ({ id: item.id, title: item.title, dueAt: item.dueAt, hasTime: item.hasTime, overdue })),
    more: a.more,
  };
}

export function toHoyResponse(d: Digest): HoyResponse {
  return {
    date: d.date,
    headline: d.headline,
    events: d.events.map(({ id, title, startsAt, endsAt }) => ({ id, title, startsAt, endsAt })),
    calendarError: d.calendarError,
    tasks: { personal: leanArea(d.tasks.personal), trabajo: leanArea(d.tasks.trabajo) },
    unclassified: d.unclassified,
  };
}

export function hoyOptions(req: Request): Response {
  return extensionPreflight(req, METHODS);
}

export async function handleHoy(req: Request, deps: HoyRouteDeps): Promise<Response> {
  const headers = { ...extensionCors(req, METHODS), 'Cache-Control': 'no-store' };
  const reply = (status: number, body: unknown) => Response.json(body, { status, headers });
  try {
    const owner = await deps.verify(req.headers.get('Authorization'));
    if (!owner) return reply(401, { message: 'No autorizado' });
    return reply(200, toHoyResponse(await deps.digest(owner.userId)));
  } catch (err) {
    console.error('hoy api failed:', err instanceof Error ? err.message : 'unknown error');
    return reply(500, { message: 'No se ha podido cargar Hoy.' });
  }
}
