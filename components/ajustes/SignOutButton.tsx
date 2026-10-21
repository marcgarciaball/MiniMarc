'use client';

import { useState, useTransition } from 'react';
import { signOut } from '@/app/actions/auth';

/** Deletes every Cache Storage entry (the service worker's cached pages and assets). */
async function clearCaches(): Promise<void> {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

/**
 * Signs out on the server, then empties the service worker's caches so no personal page can be
 * served offline afterwards, and goes to /login with a full load. The worker stays registered.
 */
export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function handleClick() {
    setFailed(false);
    startTransition(async () => {
      let ok = false;
      try {
        ok = (await signOut()).ok;
      } catch {
        ok = false;
      }
      // Even if the server could not be reached, this device should not keep personal pages.
      await clearCaches().catch(() => {});
      if (ok) window.location.replace('/login');
      else startTransition(() => setFailed(true));
    });
  }

  return (
    <>
      <button type="button" className="ui-row app-signout" onClick={handleClick} disabled={pending}>
        Cerrar sesión
      </button>
      {failed && (
        <p className="app-form__error" role="alert">
          No se ha podido cerrar la sesión. Revisa la conexión e inténtalo de nuevo.
        </p>
      )}
    </>
  );
}
