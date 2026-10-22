/**
 * The popup: quick capture (autofocused; Intro sends, Mayús+Intro breaks the line) with the
 * web bar's type menu (Alt/Opción + 1…6, arrows, Intro, Esc) and Trabajo briefcase, then a
 * compact "Hoy". Text only via textContent, never innerHTML.
 */
import { apiUrl, fetchHoy, sendCapture, type CaptureType, type HoySummary, type HoyTask } from './lib/api.js';
import { loadSettings, saveSettings, type ExtSettings } from './lib/settings.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>('capture');
const text = $<HTMLTextAreaElement>('text');
const send = $<HTMLButtonElement>('send');
const status = $<HTMLParagraphElement>('status');
const author = $<HTMLInputElement>('author');
const typeButton = $<HTMLButtonElement>('type');
const menu = $<HTMLDivElement>('type-menu');
const work = $<HTMLButtonElement>('work');
const options = [...menu.querySelectorAll<HTMLButtonElement>('[role="option"]')];

const TIME = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const SHORT_DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });

const KINDS = ['auto', 'tarea', 'idea', 'compra', 'regalo', 'libro'] as const;
type Kind = (typeof KINDS)[number];
const PLACEHOLDERS: Record<Kind, string> = {
  auto: 'Apunta algo…',
  tarea: 'Apunta una tarea…',
  idea: 'Apunta una idea…',
  compra: 'Apunta una compra…',
  regalo: 'Apunta un regalo…',
  libro: 'Apunta un libro…',
};

let kind: Kind = 'auto';
let trabajo = false;
let active = 0;

text.focus();
const settingsReady: Promise<ExtSettings> = loadSettings();

// The shortcut hints: ⌥ on a Mac, Alt+ elsewhere.
if (!/Mac/.test(navigator.platform || navigator.userAgent)) {
  for (const hint of menu.querySelectorAll<HTMLElement>('.hint')) hint.textContent = `Alt+${hint.dataset.n}`;
}

/** Like the web bar: only Auto and Tarea have the Trabajo briefcase; only Libro shows "Autor". */
function render(): void {
  const i = KINDS.indexOf(kind);
  const option = options[i];
  $('type-label').textContent = option.querySelector('.option-label')?.textContent ?? '';
  const icon = option.querySelector('svg');
  $('type-icon').replaceChildren(...(icon ? [icon.cloneNode(true)] : []));
  options.forEach((o, j) => o.setAttribute('aria-selected', String(j === i)));
  text.placeholder = PLACEHOLDERS[kind];
  work.hidden = !(kind === 'auto' || kind === 'tarea');
  work.setAttribute('aria-pressed', String(trabajo));
  author.hidden = kind !== 'libro';
}

render();

function setActive(i: number): void {
  active = i;
  options.forEach((o, j) => o.toggleAttribute('data-active', j === i));
  typeButton.setAttribute('aria-activedescendant', options[i].id);
}

function openMenu(): void {
  menu.hidden = false;
  typeButton.setAttribute('aria-expanded', 'true');
  setActive(KINDS.indexOf(kind));
}

function closeMenu(): void {
  menu.hidden = true;
  typeButton.setAttribute('aria-expanded', 'false');
  typeButton.removeAttribute('aria-activedescendant');
}

function choose(k: Kind): void {
  kind = k;
  closeMenu();
  render();
  text.focus();
}

/** Alt/Opción + 1…6 (by `code`: on a Mac, Opción+1 types "¡"). */
function shortcutKind(e: KeyboardEvent): Kind | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  return m ? (KINDS[Number(m[1]) - 1] ?? null) : null;
}

typeButton.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
for (const [i, o] of options.entries()) {
  o.addEventListener('click', () => choose(KINDS[i]));
  o.addEventListener('pointermove', () => setActive(i));
}
document.addEventListener('pointerdown', (e) => {
  const t = e.target as Node;
  if (!menu.hidden && !menu.contains(t) && !typeButton.contains(t)) closeMenu();
});

work.addEventListener('click', () => {
  trabajo = !trabajo;
  render();
  void saveSettings({ area: trabajo ? 'trabajo' : 'personal' });
});

form.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  const k = shortcutKind(e);
  if (k) {
    e.preventDefault();
    choose(k);
    return;
  }
  if (!menu.hidden) {
    const last = KINDS.length - 1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const next = { ArrowDown: active === last ? 0 : active + 1, ArrowUp: active === 0 ? last : active - 1, Home: 0, End: last };
      setActive(next[e.key]);
    } else if (e.key === 'Enter' || (e.key === ' ' && e.target === typeButton)) {
      e.preventDefault();
      choose(KINDS[active]);
    } else if (e.key === 'Escape') {
      // Only the menu: Esc would otherwise close the popup.
      e.preventDefault();
      closeMenu();
    } else if (e.key === 'Tab') {
      closeMenu();
    }
    return;
  }
  if (e.target === typeButton && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    openMenu();
  }
});

function setStatus(el: HTMLElement, msg: string, error = false): void {
  el.textContent = msg;
  el.classList.toggle('error', error);
}

function openOptions(e: Event): void {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
}

$('options-link').addEventListener('click', openOptions);
$('setup-link').addEventListener('click', openOptions);

text.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && menu.hidden) {
    e.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (send.disabled) return;
  const value = text.value;
  if (!value.trim()) {
    setStatus(status, 'Escribe algo para guardar.', true);
    return;
  }
  const settings = await settingsReady;
  const type = kind === 'auto' ? undefined : (kind as CaptureType);
  const area = trabajo && (kind === 'auto' || kind === 'tarea') ? 'trabajo' : undefined;
  send.disabled = true;
  setStatus(status, 'Guardando…');
  const r = await sendCapture(settings.baseUrl, settings.token, value, area, type, type === 'libro' ? author.value : undefined);
  send.disabled = false;
  if (r.ok) {
    // Only clear what was sent (Marc may have kept typing).
    if (text.value === value) {
      text.value = '';
      author.value = '';
    }
    setStatus(status, r.message ?? 'Guardado');
    void loadHoy(settings);
  } else {
    setStatus(status, r.message ?? 'No se ha podido guardar.', true);
  }
  text.focus();
});

// ---------- Hoy ----------

function taskWhen(t: HoyTask): string {
  if (!t.dueAt) return '';
  if (t.overdue) return SHORT_DATE.format(new Date(t.dueAt));
  return t.hasTime ? TIME.format(new Date(t.dueAt)) : 'Hoy';
}

function fillList(id: string, rows: { when: string; title: string; overdue?: boolean }[], more = 0): void {
  const ul = $<HTMLUListElement>(id);
  ul.replaceChildren();
  for (const r of rows) {
    const li = document.createElement('li');
    const when = document.createElement('span');
    when.className = r.overdue ? 'time overdue' : 'time';
    when.textContent = r.when;
    const title = document.createElement('span');
    title.textContent = r.title;
    li.append(when, title);
    ul.append(li);
  }
  if (more > 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = `y ${more} más`;
    ul.append(li);
  }
  $(`${id}-box`).hidden = rows.length === 0;
}

function renderHoy(h: HoySummary): void {
  $('headline').textContent = h.headline;
  const calendarMsg =
    h.calendarError === 'calendar_auth'
      ? 'Calendar necesita que vuelvas a entrar en la app.'
      : h.calendarError
        ? 'Calendar no responde.'
        : '';
  const empty = h.events.length + h.tasks.personal.items.length + h.tasks.trabajo.items.length === 0;
  setStatus($('hoy-status'), calendarMsg || (empty ? 'Nada pendiente para hoy.' : ''), Boolean(calendarMsg));
  fillList(
    'events',
    h.events.map((e) => ({ when: TIME.format(new Date(e.startsAt)), title: e.title })),
  );
  for (const area of ['personal', 'trabajo'] as const) {
    const a = h.tasks[area];
    fillList(
      area,
      a.items.map((t) => ({ when: taskWhen(t), title: t.title, overdue: t.overdue })),
      a.more,
    );
  }
  $('unclassified').textContent = h.unclassified > 0 ? `${h.unclassified} sin clasificar` : '';
}

async function loadHoy(settings: ExtSettings): Promise<void> {
  const r = await fetchHoy(settings.baseUrl, settings.token);
  if (r.ok) renderHoy(r.hoy);
  else setStatus($('hoy-status'), r.message, true);
}

async function init(): Promise<void> {
  const settings = await settingsReady;
  $<HTMLAnchorElement>('open-app').href = apiUrl(settings.baseUrl, '/hoy');
  trabajo = settings.area === 'trabajo';
  render();
  if (!settings.token) {
    $('no-token').hidden = false;
    $('hoy').hidden = true;
    send.disabled = true;
    return;
  }
  setStatus($('hoy-status'), 'Cargando…');
  await loadHoy(settings);
}

void init();
