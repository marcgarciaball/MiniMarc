import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { isAllowedEmail } from '@/lib/auth/allowlist';
import { userFromClaims, type ClaimsAuth, type SessionUser } from '@/lib/auth/session';

export type { SessionUser } from '@/lib/auth/session';

/**
 * Supabase client bound to the request cookies (Server Components, Route Handlers, Server
 * Actions). One per request in a render (React `cache`): every helper of a page shares it.
 *
 * Reading `cookies()` first makes the caller request-time (and is allowed inside
 * `'use cache: private'`), so the auth client's clock reads never happen while prerendering.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: cookies are read-only there.
            // The proxy refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
});

/**
 * The signed-in, allowed user, from the verified JWT claims (no Auth round-trip with
 * asymmetric keys; see lib/auth/session.ts for the trade-off). Redirects to /login otherwise.
 * Once per request in a render.
 */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const supabase = await createClient();
  const user = await userFromClaims(supabase.auth as unknown as ClaimsAuth);
  if (!user) redirect('/login');
  return user;
});

/**
 * Like requireUser, but asks the Auth server (`getUser()`), so a revoked session is refused at
 * once. For the few places where a fresh check matters: API token management.
 */
export async function requireFreshUser(): Promise<User> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || !isAllowedEmail(data.user.email)) {
    redirect('/login');
  }
  return data.user;
}
