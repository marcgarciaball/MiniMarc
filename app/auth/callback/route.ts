import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedEmail } from '@/lib/auth/allowlist';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const toLogin = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}`, request.url));

  if (!code) return toLogin('auth');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return toLogin('auth');

  const { user, provider_refresh_token } = data.session;
  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    return toLogin('no_autorizado');
  }

  // Supabase does not persist Google's refresh token; keep it for Calendar.
  if (provider_refresh_token) {
    const { error: upsertError } = await supabase
      .from('google_credentials')
      .upsert(
        {
          user_id: user.id,
          refresh_token: provider_refresh_token,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    if (upsertError) return toLogin('credenciales');
  }

  return NextResponse.redirect(new URL('/', request.url));
}
