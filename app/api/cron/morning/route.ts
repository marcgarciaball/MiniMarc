import { connection } from 'next/server';
import { handleMorningRequest } from '@/lib/cron/morning';
import { morningRun } from '@/lib/cron/server';

// Called hourly by Supabase pg_cron + pg_net (POST) or an external cron (GET or POST),
// with `Authorization: Bearer ${CRON_SECRET}`. See docs/despliegue.md, "Resumen de la mañana".
async function handle(request: Request) {
  await connection();
  return handleMorningRequest(request, { secret: process.env.CRON_SECRET, run: () => morningRun() });
}

export const GET = handle;
export const POST = handle;
