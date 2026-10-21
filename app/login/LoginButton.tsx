'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

/**
 * Google sign-in. Normally `select_account`: forcing `consent` on every login made Google's
 * consent screen fail (HTTP 500). `reconsent` (from /login?reconsent=1, sent by the callback
 * when no refresh token is stored) asks for consent again so Google hands a new refresh token.
 */
export function LoginButton({ reconsent = false }: { reconsent?: boolean }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'https://www.googleapis.com/auth/calendar',
        queryParams: { access_type: 'offline', prompt: reconsent ? 'consent' : 'select_account' },
      },
    });
    if (error) {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <>
      <button type="button" className="ui-button" onClick={signIn} disabled={pending}>
        Entrar con Google
      </button>
      {failed && <p role="alert">No se pudo iniciar sesión. Inténtalo de nuevo.</p>}
    </>
  );
}
