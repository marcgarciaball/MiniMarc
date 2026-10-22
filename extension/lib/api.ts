/**
 * The extension's only door to the app: POST /api/capture and GET /api/hoy with
 * `Authorization: Bearer ap_…`. No `chrome.*` here, so it runs (and is tested) anywhere.
 * Never logs the token.
 */

export const DEFAULT_BASE_URL = 'https://mini-marc-personal.vercel.app';

/** The chips other than Auto: saved with that type, without the AI. */
export type CaptureType = 'tarea' | 'idea' | 'compra' | 'regalo' | 'libro';

export type CaptureResult = { ok: boolean; message?: string };

export type HoyTask = { id: string; title: string; dueAt: string | null; hasTime: boolean; overdue: boolean };

/** Mirrors `HoyResponse` in lib/digest/hoyApi.ts (tests/extension/api.test.ts checks they match). */
export type HoySummary = {
  date: string;
  headline: string;
  events: { id: string; title: string; startsAt: string; endsAt: string }[];
  calendarError: 'calendar_auth' | 'calendar_unavailable' | null;
  tasks: Record<'personal' | 'trabajo', { items: HoyTask[]; more: number }>;
  unclassified: number;
};

export type HoyResult = { ok: true; hoy: HoySummary } | { ok: false; message: string };

const NETWORK_ERROR = 'Sin conexión con la app. Revisa la conexión y la URL en Opciones.';
const NO_TOKEN = 'Falta el token. Configúralo en Opciones.';

/** "https://x.app/" + "/api/hoy" → "https://x.app/api/hoy". */
export function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}${path}`;
}

async function readMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

function fallbackMessage(status: number): string {
  return status === 401 ? 'Token no válido o revocado' : `Error del servidor (${status})`;
}

/** Saves `text`. Empty text (or no token) never reaches the network. `author` only goes with a libro. */
export async function sendCapture(
  baseUrl: string,
  token: string,
  text: string,
  area?: 'trabajo',
  type?: CaptureType,
  author?: string,
): Promise<CaptureResult> {
  if (!text.trim()) return { ok: false, message: 'El texto está vacío' };
  if (!token.trim()) return { ok: false, message: NO_TOKEN };
  const body: Record<string, string> = { text, origin: 'extension' };
  if (area) body.area = area;
  if (type) body.type = type;
  if (type === 'libro' && author?.trim()) body.author = author.trim();
  let res: Response;
  try {
    res = await fetch(apiUrl(baseUrl, '/api/capture'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: NETWORK_ERROR };
  }
  const message = await readMessage(res);
  return res.ok ? { ok: true, message } : { ok: false, message: message ?? fallbackMessage(res.status) };
}

/** Today's summary (the cached headline; the app never spends an AI call for it). */
export async function fetchHoy(baseUrl: string, token: string): Promise<HoyResult> {
  if (!token.trim()) return { ok: false, message: NO_TOKEN };
  let res: Response;
  try {
    res = await fetch(apiUrl(baseUrl, '/api/hoy'), {
      headers: { Authorization: `Bearer ${token.trim()}` },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, message: NETWORK_ERROR };
  }
  if (!res.ok) return { ok: false, message: (await readMessage(res)) ?? fallbackMessage(res.status) };
  try {
    return { ok: true, hoy: (await res.json()) as HoySummary };
  } catch {
    return { ok: false, message: 'Respuesta no válida de la app' };
  }
}
