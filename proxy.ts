import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedEmail } from '@/lib/auth/allowlist';
import { isPublicPath } from '@/lib/auth/publicPaths';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  return withCookies(NextResponse.redirect(url), response);
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
