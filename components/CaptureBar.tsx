'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
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
  CheckIcon,
  ChevronDownIcon,
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
/** Room the type menu wants (7 rows of 44 + padding); with less below the button, it opens above. */
const MENU_HEIGHT = 7 * 44 + 12;

const KIND_ICONS: Record<QuickKind, ReactNode> = {
  auto: <AutoIcon />,
  tarea: <TasksIcon />,
  idea: <IdeaIcon />,
  compra: <BagIcon />,
  regalo: <GiftIcon />,
  libro: <BookIcon />,
  cita: <AgendaIcon />,
};

type MenuPlacement = { above: boolean; style: CSSProperties };

/** Buttons in the card keep the focus on the text (and the iPhone keyboard up) when tapped. */
function keepFocus(e: MouseEvent) {
  e.preventDefault();
}

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
 * type menu (Auto sends the text to the AI pipeline; Tarea, Idea, Compra, Regalo, Libro and Cita
 * save it as that type directly, no AI), the Trabajo briefcase (Auto and Tarea only; Auto +
 * Trabajo files a work task without the AI) and the type's small fields.
 * Enter (or "Enviar" on the iOS keyboard, whose mic dictates) saves; Alt/Option + 1…7 picks the
 * type; Esc closes the menu, then the card. On failure the text stays; on success a toast says
 * where it went, the type goes back to the screen's and the card stays open while focused.
 */
function CaptureBarView({ screen, screenKey }: { screen: CaptureDefaults; screenKey: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<MenuPlacement | null>(null);
  const [active, setActive] = useState(0);
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
    setMenu(null);
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

  // A tap or click outside the menu (and its button) closes it.
  const menuOpen = menu !== null;
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || typeRef.current?.contains(target)) return;
      setMenu(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  function showToast(message: string, href: string | null) {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message,
      actionLabel: href ? 'Ver' : undefined,
      onAction: href ? () => router.push(href) : undefined,
    });
  }

  /** Opens the menu below the type button, or above it when there is no room (the iPhone bar). */
  function openMenu() {
    const card = cardRef.current?.getBoundingClientRect();
    const button = typeRef.current?.getBoundingClientRect();
    if (!card || !button) return;
    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const roomBelow = viewBottom - button.bottom - 12;
    const roomAbove = button.top - viewTop - 12;
    const above = roomBelow < MENU_HEIGHT && roomAbove > roomBelow;
    const maxHeight = Math.max(132, Math.floor(above ? roomAbove : roomBelow));
    const style: CSSProperties = above
      ? { bottom: card.bottom - button.top + 4, maxHeight }
      : { top: button.bottom - card.top + 4, maxHeight };
    setActive(QUICK_KINDS.indexOf(kind));
    setMenu({ above, style });
  }

  function chooseKind(k: QuickKind) {
    setKind(k);
    setMenu(null);
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
    setMenu(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.nativeEvent.isComposing) return;
    const shortcut = kindForShortcut(e);
    if (shortcut) {
      e.preventDefault();
      chooseKind(shortcut);
      return;
    }
    if (menu) {
      const last = QUICK_KINDS.length - 1;
      const move: Record<string, number> = {
        ArrowDown: active === last ? 0 : active + 1,
        ArrowUp: active === 0 ? last : active - 1,
        Home: 0,
        End: last,
      };
      if (e.key in move) {
        e.preventDefault();
        setActive(move[e.key]);
      } else if (e.key === 'Enter' || (e.key === ' ' && e.target === typeRef.current)) {
        e.preventDefault();
        chooseKind(QUICK_KINDS[active]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
      } else if (e.key === 'Tab') {
        setMenu(null);
      }
      return;
    }
    if (e.target === typeRef.current && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      openMenu();
    } else if (e.key === 'Escape') {
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
  const optionId = (k: QuickKind) => `${menuId}-${k}`;
  const activeOption = menu ? optionId(QUICK_KINDS[active]) : undefined;

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
              aria-activedescendant={activeOption}
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
                <button
                  ref={typeRef}
                  type="button"
                  className="app-capture__type"
                  // A select-only combobox (WAI-ARIA APG): the list is driven from here or from the text.
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-expanded={menuOpen}
                  aria-controls={menuOpen ? menuId : undefined}
                  aria-activedescendant={activeOption}
                  aria-label="Tipo"
                  onMouseDown={keepFocus}
                  onClick={() => (menu ? setMenu(null) : openMenu())}
                >
                  {KIND_ICONS[kind]}
                  <span>{QUICK_KIND_LABELS[kind]}</span>
                  <span className="app-capture__chevron" aria-hidden>
                    <ChevronDownIcon />
                  </span>
                </button>
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
                    {area === 'trabajo' && <span aria-hidden>{WORK_HINT}</span>}
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

          {menu && (
            <div
              ref={menuRef}
              id={menuId}
              className="app-capture__menu"
              role="listbox"
              aria-label="Tipo"
              data-placement={menu.above ? 'above' : 'below'}
              style={menu.style}
            >
              {QUICK_KINDS.map((k, i) => (
                <button
                  key={k}
                  id={optionId(k)}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={k === kind}
                  data-active={i === active ? '' : undefined}
                  className="app-capture__option"
                  onMouseDown={keepFocus}
                  onPointerMove={() => setActive(i)}
                  onClick={() => chooseKind(k)}
                >
                  {KIND_ICONS[k]}
                  <span className="app-capture__option-label">{QUICK_KIND_LABELS[k]}</span>
                  <span className="app-capture__hint" aria-hidden>
                    {shortcutHint(k, isApple())}
                  </span>
                  <span className="app-capture__check" aria-hidden>
                    {k === kind && <CheckIcon />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </form>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
