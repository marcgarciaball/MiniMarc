/**
 * The popup: quick capture (autofocused; Intro sends, Mayús+Intro breaks the line) with the
 * web's chips and the Personal/Trabajo switch, then a compact "Hoy". Text only via
 * textContent, never innerHTML.
 */
import { apiUrl, fetchHoy, sendCapture } from './lib/api.js';
import { loadSettings, saveSettings } from './lib/settings.js';
const $ = (id) => document.getElementById(id);
const form = $('capture');
const text = $('text');
const send = $('send');
const status = $('status');
const areaBox = $('area');
const TIME = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const SHORT_DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });
text.focus();
const settingsReady = loadSettings();
function checked(name) {
    return form.querySelector(`input[name="${name}"]:checked`)?.value ?? '';
}
/** Like the web bar: only Auto and Tarea use the Personal/Trabajo switch. */
function syncArea() {
    const kind = checked('kind');
    areaBox.disabled = !(kind === 'auto' || kind === 'tarea');
}
function setStatus(el, msg, error = false) {
    el.textContent = msg;
    el.classList.toggle('error', error);
}
function openOptions(e) {
    e.preventDefault();
    void chrome.runtime.openOptionsPage();
}
$('options-link').addEventListener('click', openOptions);
$('setup-link').addEventListener('click', openOptions);
form.addEventListener('change', (e) => {
    syncArea();
    const t = e.target;
    if (t.name === 'area')
        void saveSettings({ area: t.value === 'trabajo' ? 'trabajo' : 'personal' });
    if (t.name === 'kind' || t.name === 'area')
        text.focus();
});
text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
    }
});
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (send.disabled)
        return;
    const value = text.value;
    if (!value.trim()) {
        setStatus(status, 'Escribe algo para guardar.', true);
        return;
    }
    const settings = await settingsReady;
    const kind = checked('kind');
    const type = kind === 'auto' ? undefined : kind;
    const area = !areaBox.disabled && checked('area') === 'trabajo' ? 'trabajo' : undefined;
    send.disabled = true;
    setStatus(status, 'Guardando…');
    const r = await sendCapture(settings.baseUrl, settings.token, value, area, type);
    send.disabled = false;
    if (r.ok) {
        // Only clear what was sent (Marc may have kept typing).
        if (text.value === value)
            text.value = '';
        setStatus(status, r.message ?? 'Guardado');
        void loadHoy(settings);
    }
    else {
        setStatus(status, r.message ?? 'No se ha podido guardar.', true);
    }
    text.focus();
});
// ---------- Hoy ----------
function taskWhen(t) {
    if (!t.dueAt)
        return '';
    if (t.overdue)
        return SHORT_DATE.format(new Date(t.dueAt));
    return t.hasTime ? TIME.format(new Date(t.dueAt)) : 'Hoy';
}
function fillList(id, rows, more = 0) {
    const ul = $(id);
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
function renderHoy(h) {
    $('headline').textContent = h.headline;
    const calendarMsg = h.calendarError === 'calendar_auth'
        ? 'Calendar necesita que vuelvas a entrar en la app.'
        : h.calendarError
            ? 'Calendar no responde.'
            : '';
    const empty = h.events.length + h.tasks.personal.items.length + h.tasks.trabajo.items.length === 0;
    setStatus($('hoy-status'), calendarMsg || (empty ? 'Nada pendiente para hoy.' : ''), Boolean(calendarMsg));
    fillList('events', h.events.map((e) => ({ when: TIME.format(new Date(e.startsAt)), title: e.title })));
    for (const area of ['personal', 'trabajo']) {
        const a = h.tasks[area];
        fillList(area, a.items.map((t) => ({ when: taskWhen(t), title: t.title, overdue: t.overdue })), a.more);
    }
    $('unclassified').textContent = h.unclassified > 0 ? `${h.unclassified} sin clasificar` : '';
}
async function loadHoy(settings) {
    const r = await fetchHoy(settings.baseUrl, settings.token);
    if (r.ok)
        renderHoy(r.hoy);
    else
        setStatus($('hoy-status'), r.message, true);
}
async function init() {
    const settings = await settingsReady;
    $('open-app').href = apiUrl(settings.baseUrl, '/hoy');
    if (settings.area === 'trabajo')
        $('a-trabajo').checked = true;
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
