'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { createToken, revokeToken } from '@/app/actions/tokens';
import { InsetList, Row, Sheet } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import type { ApiTokenInfo } from '@/lib/auth/tokens';
import { formatDay } from '@/lib/format';
import { madridDateTime } from '@/lib/time';

export type TokensSectionProps = {
  /** Null while loading. */
  tokens: ApiTokenInfo[] | null;
  /** Madrid "YYYY-MM-DD", from the server. */
  today: string;
};

const SUGGESTIONS = ['Siri', 'Siri trabajo', 'Extensión'];
const FORM_ID = 'token-form';
const OFFLINE = 'No se ha podido completar. Revisa la conexión e inténtalo de nuevo.';

function createdLabel(t: ApiTokenInfo, today: string): string {
  const day = formatDay(madridDateTime(new Date(t.createdAt)).date, today);
  const when = day === 'Hoy' || day === 'Ayer' ? day.toLowerCase() : `el ${day}`;
  return `Creado ${when} · ${t.revokedAt ? 'Revocado' : 'Activo'}`;
}

/**
 * Ajustes → "Tokens de acceso" for Siri and the browser extension. A new token is shown once,
 * in its sheet, with "Copiar"; closing the sheet forgets it. Revoking asks first.
 */
export function TokensSection({ tokens, today }: TokensSectionProps) {
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiTokenInfo | null>(null);

  return (
    <>
      <InsetList header="Tokens de acceso" footer="Para Siri y la extensión del navegador. Revoca los que ya no uses.">
        {tokens?.map((t) => (
          <Row
            key={t.id}
            title={t.name}
            subtitle={createdLabel(t, today)}
            trailing={
              !t.revokedAt && (
                <button type="button" className="ui-bar-button app-action--destructive" onClick={() => setRevoking(t)}>
                  Revocar
                </button>
              )
            }
          />
        ))}
        <button type="button" className="ui-row app-action" onClick={() => setCreating(true)} disabled={!tokens}>
          Nuevo token
        </button>
      </InsetList>

      <NewTokenSheet open={creating} onClose={() => setCreating(false)} />
      <RevokeSheet token={revoking} onClose={() => setRevoking(null)} />
    </>
  );
}

function NewTokenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Closing forgets the plain token; opening starts from an empty name.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setToken(null);
    setCopied(false);
    if (open) {
      setName('');
      setError(null);
    }
  }
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const tokenRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    if (!name.trim()) return setError('Escribe un nombre.');
    const fd = new FormData();
    fd.set('name', name);
    setError(null);
    inFlight.current = true;
    startTransition(async () => {
      const result = await settle(() => createToken(fd), OFFLINE);
      inFlight.current = false;
      startTransition(() => {
        if (result.ok) setToken(result.value.token);
        else setError(result.error);
      });
    });
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      // No clipboard access: select it so it can be copied by hand.
      tokenRef.current?.select();
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={token ? 'Token creado' : 'Nuevo token'}
      leading={
        !token && (
          <button type="button" className="ui-bar-button" onClick={onClose}>
            Cancelar
          </button>
        )
      }
      trailing={
        token ? (
          <button type="button" className="ui-bar-button ui-bar-button--strong" onClick={onClose}>
            OK
          </button>
        ) : (
          <button type="submit" form={FORM_ID} className="ui-bar-button ui-bar-button--strong" disabled={pending}>
            Crear
          </button>
        )
      }
    >
      {token ? (
        <div className="app-form">
          <InsetList footer="No se volverá a mostrar. Cópialo ahora y pégalo en el atajo de Siri o en la extensión.">
            <input
              ref={tokenRef}
              className="app-input app-token"
              value={token}
              readOnly
              aria-label="Token"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button type="button" className="ui-row app-action" onClick={copy}>
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </InsetList>
        </div>
      ) : (
        <form id={FORM_ID} className="app-form" onSubmit={handleSubmit}>
          <InsetList>
            <input
              className="app-input"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={pending}
              placeholder="Nombre"
              aria-label="Nombre"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={60}
            />
          </InsetList>
          <div className="app-chips" role="group" aria-label="Sugerencias">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="app-chip"
                aria-pressed={name === s}
                onClick={() => setName(s)}
                disabled={pending}
              >
                {s}
              </button>
            ))}
          </div>
          {error && (
            <p className="app-form__error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Sheet>
  );
}

function RevokeSheet({ token, onClose }: { token: ApiTokenInfo | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Keep the name on screen while the sheet slides away.
  const [shown, setShown] = useState<ApiTokenInfo | null>(token);
  if (token && token !== shown) {
    setShown(token);
    setError(null);
  }

  function confirm() {
    if (!token || pending) return;
    const id = token.id;
    startTransition(async () => {
      const result = await settle(() => revokeToken(id), OFFLINE);
      startTransition(() => {
        if (result.ok) onClose();
        else setError(result.error);
      });
    });
  }

  return (
    <Sheet
      open={token !== null}
      onClose={onClose}
      title="Revocar token"
      leading={
        <button type="button" className="ui-bar-button" onClick={onClose}>
          Cancelar
        </button>
      }
    >
      <div className="app-form">
        <InsetList
          footer={`Lo que use «${shown?.name ?? ''}» (Siri o la extensión) dejará de poder guardar. No se puede deshacer.`}
        >
          <button type="button" className="ui-row app-action app-action--destructive" onClick={confirm} disabled={pending}>
            Revocar «{shown?.name}»
          </button>
        </InsetList>
        {error && (
          <p className="app-form__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
