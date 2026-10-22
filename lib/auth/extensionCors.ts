/**
 * CORS for the Chrome extension (Task 15) on the token routes (/api/capture, /api/hoy).
 * Only `chrome-extension://<32 a–p>` origins get headers; any other origin gets none.
 */
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

export function extensionCors(req: Request, methods: string): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin || !EXTENSION_ORIGIN.test(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** The 204 answer to a preflight. */
export function extensionPreflight(req: Request, methods: string): Response {
  return new Response(null, { status: 204, headers: extensionCors(req, methods) });
}
