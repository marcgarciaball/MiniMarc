import { NextResponse, type NextRequest } from 'next/server';
import { finishSignIn } from '@/lib/auth/callback';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const path = await finishSignIn(
    {
      allowedEmail: process.env.ALLOWED_EMAIL,
      async exchange(code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.session) return null;
        const { user, provider_refresh_token } = data.session;
        return { userId: user.id, email: user.email, refreshToken: provider_refresh_token ?? null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async saveCredentials(userId, refreshToken) {
        // The browser roles have no access to this table (0002); only the service role writes it.
        const { error } = await createAdminClient()
          .from('google_credentials')
          .upsert(
            { user_id: userId, refresh_token: refreshToken, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' },
          );
        if (error) throw error;
      },
    },
    request.nextUrl.searchParams.get('code'),
  );
  return NextResponse.redirect(new URL(path, request.url));
}
