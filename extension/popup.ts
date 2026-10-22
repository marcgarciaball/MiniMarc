/**
 * The popup: quick capture (autofocused; Intro sends, Mayús+Intro breaks the line) with the
 * web's chips and the Personal/Trabajo switch, then a compact "Hoy". Text only via
 * textContent, never innerHTML.
 */
import { apiUrl, fetchHoy, sendCapture, type CaptureType, type HoySummary, type HoyTask } from './lib/api.js';
import { loadSettings, saveSettings, type ExtSettings } from './lib/settings.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>('capture');
const text = $<HTMLTextAreaElement>('text');
const send = $<HTMLButtonElement>('send');
const status = $<HTMLParagraphElement>('status');
const areaBox = $<HTMLFieldSetElement>('area');

const TIME = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const SHORT_DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });

text.focus();
const settingsReady: Promise<ExtSettings> = loadSettings();

function checked(name: string): string {
  return (form.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement | null)?.value ?? '';
}

/** Like the web bar: only Auto and Tarea use the Personal/Trabajo switch. */
function syncArea(): void {
  const kind = checked('kind');
  areaBox.disabled = !(kind === 'auto' || kind === 'tarea');
}

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
form.addEventListener('change', (e) => {
  syncArea();
  const t = e.target as HTMLInputElement;
  if (t.name === 'area') void saveSettings({ area: t.value === 'trabajo' ? 'trabajo' : 'personal' });
  if (t.name === 'kind' || t.name === 'area') text.focus();
});

text.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
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
  const kind = checked('kind');
  const type = kind === 'auto' ? undefined : (kind as CaptureType);
  const area = !areaBox.disabled && checked('area') === 'trabajo' ? 'trabajo' : undefined;
  send.disabled = true;
  setStatus(status, 'Guardando…');
  const r = await sendCapture(settings.baseUrl, settings.token, value, area, type);
  send.disabled = false;
  if (r.ok) {
    // Only clear what was sent (Marc may have kept typing).
    if (text.value === value) text.value = '';
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
  if (settings.area === 'trabajo') $<HTMLInputElement>('a-trabajo').checked = true;
  syncArea();
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
