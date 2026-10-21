'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { captureFromWeb } from '@/app/actions/capture';
import { SendIcon } from '@/components/icons';
import { Toast, type ToastProps } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import { BANDEJA_HREF, CAPTURE_INPUT_ID } from '@/lib/nav';

type ToastState = NonNullable<ToastProps['toast']>;

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/**
 * On iOS the keyboard shrinks the visual viewport but not the layout one, so a fixed bar would
 * end up under it. This exposes how much of the layout viewport the keyboard covers as
 * `--capture-keyboard` (and `data-keyboard` while it is open); app.css lifts the bar by that much.
 */
function useKeyboardLift(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    const update = () => {
      const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      el.style.setProperty('--capture-keyboard', `${covered}px`);
      el.toggleAttribute('data-keyboard', covered > 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [ref]);
}

/**
 * The always-visible capture field: above the tab bar on iPhone, at the top of the column on
 * desktop. Enter (or "Enviar" on the iOS keyboard, whose mic dictates) sends the text to the
 * capture pipeline; "Trabajo" files it as a Trabajo task without the AI. On failure the text
 * stays in the field; on success a toast says where it went and links to the Bandeja.
 */
export function CaptureBar() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [text, setText] = useState('');
  const [trabajo, setTrabajo] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<ToastState | null>(null);
  // Blocks a second submit (double Enter) before `pending` re-renders.
  const inFlight = useRef(false);
  const toastId = useRef(0);
  useKeyboardLift(formRef);

  function showToast(message: string, link: boolean) {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message,
      actionLabel: link ? 'Ver' : undefined,
      onAction: link ? () => router.push(BANDEJA_HREF) : undefined,
    });
  }

  // onSubmit, not <form action>: React would reset the field when the action ends, even on failure.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current || !text.trim()) return;
    const fd = new FormData();
    fd.set('text', text);
    if (trabajo) fd.set('area', 'trabajo');
    inFlight.current = true;
    startTransition(async () => {
      const result = await settle(() => captureFromWeb(fd), OFFLINE);
      inFlight.current = false;
      startTransition(() => {
        if (result.ok) {
          setText('');
          showToast(result.value.message, true);
        } else {
          showToast(result.error, false);
        }
      });
    });
  }

  return (
    <>
      <form ref={formRef} className="app-capture" onSubmit={handleSubmit} aria-label="Capturar" aria-busy={pending}>
        <input
          id={CAPTURE_INPUT_ID}
          className="app-capture__input"
          name="text"
          type="text"
          inputMode="text"
          enterKeyHint="send"
          autoComplete="off"
          autoCapitalize="sentences"
          placeholder="Apunta algo…"
          aria-label="Apunta algo"
          value={text}
          onChange={(e) => setText(e.target.value)}
          // readOnly, not disabled: the keyboard (and its dictation) stays up while it saves.
          readOnly={pending}
        />
        <button
          type="button"
          className="app-capture__area"
          aria-pressed={trabajo}
          onClick={() => setTrabajo((on) => !on)}
          title={trabajo ? 'Se guarda en Trabajo, sin pasar por la IA' : 'Guardar en Trabajo'}
        >
          Trabajo
        </button>
        <button type="submit" className="app-capture__send" aria-label="Guardar" disabled={pending || !text.trim()}>
          <SendIcon />
        </button>
      </form>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
