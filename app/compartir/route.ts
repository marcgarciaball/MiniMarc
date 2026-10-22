import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { isAllowedEmail } from '@/lib/auth/allowlist';
import { sessionCaptureDeps } from '@/lib/capture/session';
import { quickCapture } from '@/lib/capture/web';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { withServerPreviews } from '@/lib/links/server';
import { savePhotoFile } from '@/lib/photos/server';
import { handleShare } from '@/lib/share/handler';
import { createClient } from '@/lib/supabase/server';

/*
 * Android share target (manifest `share_target`, POST multipart). Session only: not in
 * PUBLIC_PATHS, so the proxy already sends a request without a session to /login; the handler
 * checks again. Everything runs with Marc's session client (RLS), never the service role.
 * The service worker shrinks shared images first (public/sw.js) and never caches this POST.
 */
export async function POST(request: Request) {
  const response = await handleShare(request, {
    async userId() {
      const { data } = await (await createClient()).auth.getUser();
      return data.user && isAllowedEmail(data.user.email) ? data.user.id : null;
    },
    quickCapture: (fd) => quickCapture(fd, { captureDeps: sessionCaptureDeps, rethrow: unstable_rethrow }),
    async createItem(input) {
      const client = await createClient();
      const repo = createSupabaseItemsRepo(client);
      const { data } = await client.auth.getUser();
      return (data.user ? withServerPreviews(repo, data.user.id) : repo).createItem(input);
    },
    savePhoto: savePhotoFile,
  });
  revalidatePath('/', 'layout');
  return response;
}

/** Opened by hand: nothing to save. */
export function GET(request: Request) {
  return Response.redirect(new URL('/bandeja', request.url), 303);
}
