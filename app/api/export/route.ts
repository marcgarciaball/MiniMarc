import { connection } from 'next/server';
import { madridToday } from '@/lib/actions/today';
import { listApiTokens } from '@/lib/auth/tokens';
import { createSupabaseBackend } from '@/lib/db/backend';
import { createSettingsRepo } from '@/lib/db/settings';
import { collectExport, exportFilename, serializeExport, type ExportFormat } from '@/lib/export/serialize';
import { createClient, requireUser } from '@/lib/supabase/server';

/** Ajustes → "Tus datos": downloads everything (JSON) or the items (CSV). Session only. */
export async function GET(request: Request) {
  await connection();
  const user = await requireUser();
  const param = new URL(request.url).searchParams.get('fmt') ?? 'json';
  if (param !== 'json' && param !== 'csv') {
    return Response.json({ error: 'fmt debe ser json o csv' }, { status: 400 });
  }
  const fmt: ExportFormat = param;
  const client = await createClient();
  const data = await collectExport({
    // Session client: RLS limits every row to Marc's.
    backend: createSupabaseBackend(client),
    settings: () => createSettingsRepo(client, user.id).get(),
    tokens: () => listApiTokens(),
  });
  // CSV: UTF-8 BOM so spreadsheet apps read the accents correctly.
  const body = fmt === 'csv' ? `\uFEFF${serializeExport(data, 'csv')}` : serializeExport(data, 'json');
  return new Response(body, {
    headers: {
      'Content-Type': fmt === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(madridToday(), fmt)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
