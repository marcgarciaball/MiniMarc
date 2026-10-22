'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { listCapturePeople, quickCapture } from '@/app/actions/capture';
import { SendIcon } from '@/components/icons';
import { Segmented, Toast, type ToastProps } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import {
  captureDefaults,
  QUICK_KIND_LABELS,
  QUICK_KINDS,
  usesArea,
  type CaptureDefaults,
  type QuickKind,
} from '@/lib/capture/kinds';
import type { Area, Person } from '@/lib/db/types';
import { CAPTURE_INPUT_ID } from '@/lib/nav';

type ToastState = NonNullable<ToastProps['toast']>;

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
const NEW_PERSON = '__nueva__';
const AUTO: CaptureDefaults = { kind: 'auto', personId: null, area: null };

const PLACEHOLDERS: Record<QuickKind, string> = {
  auto: 'Apunta algo…',
  tarea: 'Nueva tarea…',
  idea: 'Nueva idea…',
  compra: 'Qué hay que comprar…',
  regalo: 'Idea de regalo…',
  libro: 'Título del libro…',
  cita: 'Nueva cita…',
};

/**
 * On iOS the keyboard shrinks the visual viewport but not the layout one, so a fixed bar would
 * end up under it. This exposes how much of the layout viewport the keyboard covers as
 * `--capture-keyboard` (and `data-keyboard` while it is open); app.css lifts the bar by that much.
 * It also publishes the bar's height as `--capture-height` on the shell, so the content and the
 * toasts clear it as the chips' extra fields come and go.
 */
function useBarLayout(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!el) return;
    const shell = el.closest<HTMLElement>('.app-shell');
    const observer = new ResizeObserver(() => {
      shell?.style.setProperty('--capture-height', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    });
    observer.observe(el);
    if (!vv) return () => observer.disconnect();
    const update = () => {
      const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      el.style.setProperty('--capture-keyboard', `${covered}px`);
      el.toggleAttribute('data-keyboard', covered > 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [ref]);
}

/** The bar with the chip of the current screen (/compras → Compra, /tareas?area=trabajo → Tarea + Trabajo…). */
export function CaptureBar() {
  const pathname = usePathname();
  const area = useSearchParams().get('area');
  return <CaptureBarView screen={captureDefaults(pathname, area)} screenKey={`${pathname}?${area ?? ''}`} />;
}

/** Same bar with Auto, while the URL is not known yet (prerender). */
export function CaptureBarFallback() {
  return <CaptureBarView screen={AUTO} screenKey="" />;
}

/**
 * The always-visible capture field: above the tab bar on iPhone, at the top of the column on
 * desktop. Under it, the type chips: Auto sends the text to the AI pipeline (Trabajo files it as
 * a work task without the AI); Tarea, Idea, Compra, Regalo, Libro and Cita save it as that type
 * directly, no AI. Enter (or "Enviar" on the iOS keyboard, whose mic dictates) saves. On failure
 * the text stays; on success a toast says where it went and the chip goes back to the screen's.
 */
function CaptureBarView({ screen, screenKey }: { screen: CaptureDefaults; screenKey: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<QuickKind>(screen.kind);
  const [area, setArea] = useState<Area>(screen.area ?? 'personal');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [personId, setPersonId] = useState(screen.personId ?? '');
  const [personName, setPersonName] = useState('');
  const [author, setAuthor] = useState('');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<ToastState | null>(null);
  // Blocks a second submit (double Enter) before `pending` re-renders.
  const inFlight = useRef(false);
  const toastId = useRef(0);
  useBarLayout(formRef);

  function resetToScreen() {
    setKind(screen.kind);
    setPersonId(screen.personId ?? '');
    setPersonName('');
    setAuthor('');
    setDueDate('');
    setDueTime('');
    setDate('');
    setStart('');
    setEnd('');
  }

  // A new screen brings its own chip (and, on Tareas, its area). Adjusted while rendering, not in an effect.
  const [shownFor, setShownFor] = useState(screenKey);
  if (shownFor !== screenKey) {
    setShownFor(screenKey);
    resetToScreen();
    if (screen.area) setArea(screen.area);
  }

  // The Regalo picker loads the people the first time it is needed.
  const needPeople = kind === 'regalo' && people === null;
  useEffect(() => {
    if (!needPeople) return;
    let live = true;
    settle(() => listCapturePeople(), '').then((r) => {
      if (live) setPeople(r.ok ? r.value : []);
    });
    return () => {
      live = false;
    };
  }, [needPeople]);

  function showToast(message: string, href: string | null) {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message,
      actionLabel: href ? 'Ver' : undefined,
      onAction: href ? () => router.push(href) : undefined,
    });
  }

  // onSubmit, not <form action>: React would reset the field when the action ends, even on failure.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current || !text.trim()) return;
    const fd = new FormData();
    fd.set('text', text);
    fd.set('kind', kind);
    if (usesArea(kind) && area === 'trabajo') fd.set('area', 'trabajo');
    if (kind === 'tarea') {
      fd.set('dueDate', dueDate);
      fd.set('dueTime', dueTime);
    }
    if (kind === 'cita') {
      fd.set('date', date);
      fd.set('start', start);
      fd.set('end', end);
    }
    if (kind === 'libro') fd.set('author', author);
    const newPerson = kind === 'regalo' && personId === NEW_PERSON;
    if (kind === 'regalo') {
      if (newPerson) fd.set('personName', personName);
      else fd.set('personId', personId);
    }
    inFlight.current = true;
    startTransition(async () => {
      const result = await settle(() => quickCapture(fd), OFFLINE);
      inFlight.current = false;
      startTransition(() => {
        if (result.ok) {
          setText('');
          resetToScreen();
          if (newPerson) setPeople(null);
          showToast(result.value.message, result.value.href);
        } else {
          showToast(result.error, null);
        }
      });
    });
  }

  const showArea = usesArea(kind);

  return (
    <>
      <form ref={formRef} className="app-capture" onSubmit={handleSubmit} aria-label="Capturar" aria-busy={pending}>
        <div className="app-capture__bar">
          <input
            id={CAPTURE_INPUT_ID}
            className="app-capture__input"
            name="text"
            type="text"
            inputMode="text"
            enterKeyHint="send"
            autoComplete="off"
            autoCapitalize="sentences"
            placeholder={PLACEHOLDERS[kind]}
            aria-label="Apunta algo"
            value={text}
            onChange={(e) => setText(e.target.value)}
            // readOnly, not disabled: the keyboard (and its dictation) stays up while it saves.
            readOnly={pending}
          />
          <button type="submit" className="app-capture__send" aria-label="Guardar" disabled={pending || !text.trim()}>
            <SendIcon />
          </button>
        </div>

        <div className="app-capture__row">
          <div role="radiogroup" aria-label="Tipo" className="app-capture__chips">
            {QUICK_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className="app-capture__chip"
                onClick={() => setKind(k)}
              >
                {QUICK_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          {showArea && (
            <div className="app-capture__area">
              <Segmented<Area>
                label="Área"
                options={[
                  { value: 'personal', label: 'Personal' },
                  { value: 'trabajo', label: 'Trabajo' },
                ]}
                value={area}
                onChange={setArea}
              />
            </div>
          )}
        </div>

        {kind === 'tarea' && (
          <div className="app-capture__row app-capture__extras">
            <label className="app-capture__field">
              <span>Fecha</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label className="app-capture__field">
              <span>Hora</span>
              <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </label>
          </div>
        )}

        {kind === 'cita' && (
          <div className="app-capture__row app-capture__extras">
            <label className="app-capture__field">
              <span>Fecha</span>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="app-capture__field">
              <span>Inicio</span>
              <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="app-capture__field">
              <span>Fin</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
        )}

        {kind === 'libro' && (
          <div className="app-capture__row app-capture__extras">
            <label className="app-capture__field">
              <span>Autor</span>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="words"
                maxLength={200}
                placeholder="Opcional"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>
          </div>
        )}

        {kind === 'regalo' && (
          <div className="app-capture__row app-capture__extras">
            <label className="app-capture__field">
              <span>Para</span>
              <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">{people === null ? 'Cargando…' : 'Sin persona'}</option>
                {people?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value={NEW_PERSON}>Nueva persona…</option>
              </select>
            </label>
            {personId === NEW_PERSON && (
              <label className="app-capture__field">
                <span>Nombre</span>
                <input
                  type="text"
                  autoComplete="off"
                  autoCapitalize="words"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                />
              </label>
            )}
          </div>
        )}
      </form>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
