'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { listCapturePeople, quickCapture } from '@/app/actions/capture';
import {
  AgendaIcon,
  AutoIcon,
  BagIcon,
  BookIcon,
  BriefcaseIcon,
  GiftIcon,
  IdeaIcon,
  SendIcon,
  TasksIcon,
} from '@/components/icons';
import { Toast, type ToastProps } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import {
  captureDefaults,
  captureExtras,
  capturePlaceholder,
  kindForShortcut,
  QUICK_KIND_LABELS,
  QUICK_KINDS,
  shortcutHint,
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
const WORK_HINT = 'Trabajo · no pasa por la IA';
const KIND_ICONS: Record<QuickKind, ReactNode> = {
  auto: <AutoIcon />,
  tarea: <TasksIcon />,
  idea: <IdeaIcon />,
  compra: <BagIcon />,
  regalo: <GiftIcon />,
  libro: <BookIcon />,
  cita: <AgendaIcon />,
};

/** Buttons in the card keep the focus on the text (and the iPhone keyboard up) when tapped. */
function keepFocus(e: MouseEvent) {
  e.preventDefault();
}

const noSubscribe = () => () => {};

/** ⌥ on Apple keyboards, Alt+ elsewhere in the tooltips (known only on the client). */
function isApple(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/**
 * On iOS the keyboard shrinks the visual viewport but not the layout one, so a fixed bar would
 * end up under it. This exposes how much of the layout viewport the keyboard covers as
 * `--capture-keyboard` (and `data-keyboard` while it is open); app.css lifts the bar by that much.
 * It also publishes the bar's height as `--capture-height` on the shell, so the content and the
 * toasts clear it as the card opens and its extra fields come and go.
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

/** The bar with the type of the current screen (/compras → Compra, /tareas?area=trabajo → Tarea + Trabajo…). */
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
 * desktop. At rest it is just the field ("Apunta algo…", or the screen's type: "Apunta una
 * compra…"), with a small briefcase when Trabajo is on. Focused, it opens into a card with the
 * row of types (Auto sends the text to the AI pipeline; Tarea, Idea, Compra, Regalo, Libro and Cita
 * save it as that type directly, no AI), the Trabajo briefcase (Auto and Tarea only; Auto +
 * Trabajo files a work task without the AI) and the type's small fields.
 * Enter (or "Enviar" on the iOS keyboard, whose mic dictates) saves; Alt/Option + 1…7 picks the
 * type; Esc closes the card. On failure the text stays; on success a toast says
 * where it went, the type goes back to the screen's and the card stays open while focused.
 */
function CaptureBarView({ screen, screenKey }: { screen: CaptureDefaults; screenKey: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const apple = useSyncExternalStore(noSubscribe, isApple, () => false);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<QuickKind>(screen.kind);
  const [area, setArea] = useState<Area>(screen.area ?? 'personal');
  // Tarea's fecha/hora and Cita's fecha/inicio share `date` and `time`.
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
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
    setDate('');
    setTime('');
    setEnd('');
  }

  // A new screen brings its own type (and, on Tareas, its area). Adjusted while rendering, not in an effect.
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

  function chooseKind(k: QuickKind) {
    setKind(k);
    inputRef.current?.focus();
  }

  function handleFocus() {
    setOpen(true);
  }

  // The card closes when the focus leaves it (a tap elsewhere, Tab out, Esc).
  function handleBlur(e: FocusEvent<HTMLFormElement>) {
    const next = e.relatedTarget as Node | null;
    if (next && formRef.current?.contains(next)) return;
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.nativeEvent.isComposing) return;
    const shortcut = kindForShortcut(e);
    if (shortcut) {
      e.preventDefault();
      chooseKind(shortcut);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur();
      setOpen(false);
    } else if (e.key === 'Enter' && e.shiftKey && e.target === inputRef.current) {
      // A one-line field: Shift+Enter is not a newline here, and it does not send either.
      e.preventDefault();
    }
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
      fd.set('dueDate', date);
      fd.set('dueTime', time);
    }
    if (kind === 'cita') {
      fd.set('date', date);
      fd.set('start', time);
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
          // Fast multi-entry: back to the text if the focus is still in the card (e.g. after the send button).
          if (formRef.current?.contains(document.activeElement)) inputRef.current?.focus();
        } else {
          showToast(result.error, null);
        }
      });
    });
  }

  const showArea = usesArea(kind);
  const work = showArea && area === 'trabajo';
  const extras = captureExtras(kind);
  const cita = kind === 'cita';

  return (
    <>
      <form
        ref={formRef}
        className="app-capture"
        data-open={open ? '' : undefined}
        onSubmit={handleSubmit}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        aria-label="Capturar"
        aria-busy={pending}
      >
        <div ref={cardRef} className="app-capture__card">
          <div className="app-capture__bar">
            {work && !open && (
              <span className="app-capture__glyph" role="img" aria-label="Trabajo activado" title={WORK_HINT}>
                <BriefcaseIcon />
              </span>
            )}
            <input
              ref={inputRef}
              id={CAPTURE_INPUT_ID}
              className="app-capture__input"
              name="text"
              type="text"
              inputMode="text"
              enterKeyHint="send"
              autoComplete="off"
              autoCapitalize="sentences"
              placeholder={capturePlaceholder(kind)}
              aria-label="Apunta algo"
              value={text}
              onChange={(e) => setText(e.target.value)}
              // readOnly, not disabled: the keyboard (and its dictation) stays up while it saves.
              readOnly={pending}
            />
            <button
              type="submit"
              className="app-capture__send"
              aria-label="Guardar"
              disabled={pending || !text.trim()}
              onMouseDown={keepFocus}
              // Closed (text left in the field): open the card first, so Cita's required fields can be checked.
              onClick={() => {
                if (!open) inputRef.current?.focus();
              }}
            >
              <SendIcon />
            </button>
          </div>

          <div className="app-capture__more" inert={!open}>
            <div className="app-capture__more-inner">
              <div className="app-capture__options">
                <div className="app-capture__kinds" role="group" aria-label="Tipo">
                  {QUICK_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="app-capture__kind"
                      aria-pressed={k === kind}
                      aria-label={QUICK_KIND_LABELS[k]}
                      title={`${QUICK_KIND_LABELS[k]} (${shortcutHint(k, apple)})`}
                      onMouseDown={keepFocus}
                      onClick={() => chooseKind(k)}
                    >
                      {KIND_ICONS[k]}
                      <span className="app-capture__kind-label">{QUICK_KIND_LABELS[k]}</span>
                    </button>
                  ))}
                </div>
                {showArea && (
                  <button
                    type="button"
                    className="app-capture__work"
                    aria-label="Trabajo"
                    aria-pressed={area === 'trabajo'}
                    title={WORK_HINT}
                    onMouseDown={keepFocus}
                    onClick={() => setArea((a) => (a === 'trabajo' ? 'personal' : 'trabajo'))}
                  >
                    <BriefcaseIcon />
                  </button>
                )}
              </div>

              {extras.length > 0 && (
                <div key={kind} className="app-capture__extras">
                  {extras.includes('fecha') && (
                    <label className="app-capture__field">
                      <span>Fecha</span>
                      <input type="date" required={cita} value={date} onChange={(e) => setDate(e.target.value)} />
                    </label>
                  )}
                  {extras.includes('hora') && (
                    <label className="app-capture__field">
                      <span>{cita ? 'Inicio' : 'Hora'}</span>
                      <input type="time" required={cita} value={time} onChange={(e) => setTime(e.target.value)} />
                    </label>
                  )}
                  {extras.includes('fin') && (
                    <label className="app-capture__field">
                      <span>Fin</span>
                      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                    </label>
                  )}
                  {extras.includes('persona') && (
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
                  )}
                  {extras.includes('persona') && personId === NEW_PERSON && (
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
                  {extras.includes('autor') && (
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
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </form>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
