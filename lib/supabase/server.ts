import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { isAllowedEmail } from '@/lib/auth/allowlist';

/** Supabase client bound to the request cookies (Server Components, Route Handlers, Server Actions). */
export async function createClient() {
  // The auth client reads the clock (Date.now) while loading the session; with cacheComponents
  // that must happen at request time, never during prerender.
  await connection();
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
}

/** Returns the signed-in, allowed user or redirects to /login. */
export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || !isAllowedEmail(data.user.email)) {
    redirect('/login');
  }
  return data.user;
}
