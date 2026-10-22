/**
 * The extension's only door to the app: POST /api/capture and GET /api/hoy with
 * `Authorization: Bearer ap_…`. No `chrome.*` here, so it runs (and is tested) anywhere.
 * Never logs the token.
 */
export const DEFAULT_BASE_URL = 'https://mini-marc-personal.vercel.app';
const NETWORK_ERROR = 'Sin conexión con la app. Revisa la conexión y la URL en Opciones.';
const NO_TOKEN = 'Falta el token. Configúralo en Opciones.';
/** "https://x.app/" + "/api/hoy" → "https://x.app/api/hoy". */
export function apiUrl(baseUrl, path) {
    return `${baseUrl.trim().replace(/\/+$/, '')}${path}`;
}
async function readMessage(res) {
    try {
        const body = (await res.json());
        return typeof body.message === 'string' ? body.message : undefined;
    }
    catch {
        return undefined;
    }
}
function fallbackMessage(status) {
    return status === 401 ? 'Token no válido o revocado' : `Error del servidor (${status})`;
}
/** Saves `text`. Empty text (or no token) never reaches the network. */
export async function sendCapture(baseUrl, token, text, area, type) {
    if (!text.trim())
        return { ok: false, message: 'El texto está vacío' };
    if (!token.trim())
        return { ok: false, message: NO_TOKEN };
    const body = { text, origin: 'extension' };
    if (area)
        body.area = area;
    if (type)
        body.type = type;
    let res;
    try {
        res = await fetch(apiUrl(baseUrl, '/api/capture'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }
    catch {
        return { ok: false, message: NETWORK_ERROR };
    }
    const message = await readMessage(res);
    return res.ok ? { ok: true, message } : { ok: false, message: message ?? fallbackMessage(res.status) };
}
/** Today's summary (the cached headline; the app never spends an AI call for it). */
export async function fetchHoy(baseUrl, token) {
    if (!token.trim())
        return { ok: false, message: NO_TOKEN };
    let res;
    try {
        res = await fetch(apiUrl(baseUrl, '/api/hoy'), {
            headers: { Authorization: `Bearer ${token.trim()}` },
            cache: 'no-store',
        });
    }
    catch {
        return { ok: false, message: NETWORK_ERROR };
    }
    if (!res.ok)
        return { ok: false, message: (await readMessage(res)) ?? fallbackMessage(res.status) };
    try {
        return { ok: true, hoy: (await res.json()) };
    }
    catch {
        return { ok: false, message: 'Respuesta no válida de la app' };
    }
}
