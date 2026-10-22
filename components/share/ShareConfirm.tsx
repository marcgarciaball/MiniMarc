'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createSharedIdea, saveSharedText } from '@/app/actions/share';
import { uploadItemPhotos } from '@/components/items/ItemPhotos';
import '@/components/photos/photos.css';
import { InsetList, LargeTitle } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import { pickSharedImages, sharedPhotosMessage, shareText } from '@/lib/share/payload';
import { deleteShare, readShare, type StashedShare } from '@/lib/share/stash';

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

type State =
  | { kind: 'loading' }
  | { kind: 'empty'; message: string }
  | { kind: 'ready'; share: StashedShare; text: string; files: File[]; thumbs: string[] };

/**
 * /compartir?id=…: what was shared from Android, kept on this device by the service worker,
 * shown before anything is saved (I-1). «Guardar» sends it through same-origin server actions
 * (text: Auto quick capture; images: an idea, then each photo straight to Storage with the
 * session); «Descartar» forgets it. Either way the local copy is removed.
 */
export function ShareConfirm({ id, failed }: { id: string | null; failed: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let thumbs: string[] = [];
    let cancelled = false;
    (async () => {
      if (failed) return setState({ kind: 'empty', message: 'No se ha podido leer lo compartido. Vuelve a compartirlo.' });
      if (!id) return setState({ kind: 'empty', message: 'No hay nada compartido pendiente.' });
      let share: StashedShare | null = null;
      try {
        share = await readShare(id);
      } catch {
        share = null;
      }
      if (cancelled) return;
      if (!share) return setState({ kind: 'empty', message: 'Ya se guardó o se descartó.' });
      const files = pickSharedImages(share.files.map((f) => new File([f.blob], f.name, { type: f.type || f.blob.type })));
      thumbs = files.map((f) => URL.createObjectURL(f));
      const text = shareText(share);
      if (!text && files.length === 0) return setState({ kind: 'empty', message: 'No había nada que guardar.' });
      setState({ kind: 'ready', share, text, files, thumbs });
    })();
    return () => {
      cancelled = true;
      thumbs.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [id, failed]);

  async function forget() {
    if (id) await deleteShare(id).catch(() => {});
  }

  async function save() {
    if (state.kind !== 'ready' || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const { text, files } = state;
    let message: string | null = null;
    if (files.length > 0) {
      const r = await settle(() => createSharedIdea(text), OFFLINE);
      if (r.ok) {
        let saved = 0;
        // One photo at a time, straight to Storage: no request body limit (M-1).
        for (const file of files) if ((await uploadItemPhotos(r.value.itemId, [file])) === null) saved++;
        message = sharedPhotosMessage(saved, files.length);
      } else setError(r.error);
    } else {
      const r = await settle(() => saveSharedText(text), OFFLINE);
      if (r.ok) message = r.value.message;
      else setError(r.error);
    }
    if (message === null) {
      // Nothing saved: keep the local copy so «Guardar» can be tried again.
      inFlight.current = false;
      setBusy(false);
      return;
    }
    await forget();
    router.replace(`/bandeja?guardado=${encodeURIComponent(message)}`);
  }

  async function discard() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    await forget();
    router.replace('/bandeja');
  }

  return (
    <LargeTitle title="Compartido">
      {state.kind === 'loading' && <InsetList footer="Cargando…">{null}</InsetList>}
      {state.kind === 'empty' && (
        <InsetList footer={state.message}>
          <button type="button" className="ui-row app-action" onClick={() => router.replace('/bandeja')}>
            Ir a Recién añadido
          </button>
        </InsetList>
      )}
      {state.kind === 'ready' && (
        <>
          {state.text && (
            <InsetList header="Texto">
              <p className="app-source-text">{state.text}</p>
            </InsetList>
          )}
          {state.share.url.trim() && (
            <InsetList header="Enlace">
              <p className="app-source-text">{state.share.url.trim()}</p>
            </InsetList>
          )}
          {state.thumbs.length > 0 && (
            <InsetList header={state.thumbs.length === 1 ? 'Foto' : `${state.thumbs.length} fotos`}>
              <div className="photo-gallery__grid">
                {state.thumbs.map((src, i) => (
                  <div key={src} className="photo-gallery__thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL, no optimizer */}
                    <img src={src} alt={`Foto ${i + 1}`} decoding="async" />
                  </div>
                ))}
              </div>
            </InsetList>
          )}
          <InsetList
            footer={
              state.files.length > 0
                ? 'Se guardará como idea con las fotos, sin pasar por la IA.'
                : 'Se guardará como en la barra de captura (Auto).'
            }
          >
            <button type="button" className="ui-row app-action" onClick={save} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="ui-row app-action app-action--destructive" onClick={discard} disabled={busy}>
              Descartar
            </button>
          </InsetList>
          {error && (
            <p className="app-form__error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </LargeTitle>
  );
}
