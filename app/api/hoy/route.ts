import { connection } from 'next/server';
import { handleHoy, hoyOptions } from '@/lib/digest/hoyApi';
import { hoyRouteDeps } from '@/lib/digest/server';

// The Chrome extension's "Hoy" (Bearer token, like /api/capture). See docs/extension.md.
export async function GET(request: Request) {
  await connection();
  return handleHoy(request, hoyRouteDeps);
}

export async function OPTIONS(request: Request) {
  await connection();
  return hoyOptions(request);
}
