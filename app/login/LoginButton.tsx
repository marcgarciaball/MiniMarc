'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export function LoginButton() {
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
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <>
      <button type="button" onClick={signIn} disabled={pending}>
        Entrar con Google
      </button>
      {failed && <p role="alert">No se pudo iniciar sesión. Inténtalo de nuevo.</p>}
    </>
  );
}
