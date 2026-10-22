import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedEmail } from '@/lib/auth/allowlist';
import { isPublicPath } from '@/lib/auth/publicPaths';
import { isDirectSharePost, SHARE_PATH } from '@/lib/share/payload';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Share target (I-1, CSRF): a share POST that reaches the server (a cross-site form, or no
  // service worker yet) never saves anything. 303 to the confirm page, before any session work.
  if (isDirectSharePost(request.method, pathname, request.headers)) {
    const url = request.nextUrl.clone();
    url.pathname = SHARE_PATH;
    url.search = '';
    return NextResponse.redirect(url, 303);
  }
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  if (isPublicPath(pathname)) return response;

  // Refreshes the session if needed and verifies the JWT.
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;

  if (data?.claims && isAllowedEmail(email)) return response;

  // Signed in with a non-allowed account: drop the session (defence in depth).
  if (data?.claims) await supabase.auth.signOut();

  if (pathname.startsWith('/api/')) {
    return withCookies(NextResponse.json({ error: 'No autorizado' }, { status: 401 }), response);
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = data?.claims ? '?error=no_autorizado' : '';
  // 303 for a POST (e.g. a server action without a session), so the browser follows with a GET.
  const status = request.method === 'GET' || request.method === 'HEAD' ? 307 : 303;
  return withCookies(NextResponse.redirect(url, status), response);
}

/** Carries any cookies Supabase set (refresh / sign-out) onto a new response. */
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((c) => target.cookies.set(c));
  return target;
}

export const config = {
  matcher: [
    // Everything except static assets; public routes are handled by PUBLIC_PATHS.
    '/((?!_next/|favicon\\.ico|manifest\\.webmanifest|sw\\.js|icons/).*)',
  ],
};
