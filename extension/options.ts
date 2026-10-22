/** Options: app URL and token, in chrome.storage.local. "Probar" calls GET /api/hoy. */
import { apiUrl, DEFAULT_BASE_URL, fetchHoy } from './lib/api.js';
import { loadSettings, saveSettings } from './lib/settings.js';

const form = document.getElementById('form') as HTMLFormElement;
const baseUrl = document.getElementById('baseUrl') as HTMLInputElement;
const token = document.getElementById('token') as HTMLInputElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const ajustes = document.getElementById('ajustes-link') as HTMLAnchorElement;
const testButton = document.getElementById('test') as HTMLButtonElement;

function setStatus(msg: string, error = false): void {
  status.textContent = msg;
  status.classList.toggle('error', error);
}

function currentUrl(): string {
  return baseUrl.value.trim() || DEFAULT_BASE_URL;
}

function syncAjustesLink(): void {
  try {
    ajustes.href = apiUrl(new URL(currentUrl()).toString(), '/ajustes');
  } catch {
    ajustes.href = apiUrl(DEFAULT_BASE_URL, '/ajustes');
  }
}

baseUrl.addEventListener('input', syncAjustesLink);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveSettings({ baseUrl: currentUrl(), token: token.value.trim() });
  setStatus('Guardado.');
});

testButton.addEventListener('click', async () => {
  testButton.disabled = true;
  setStatus('Probando…');
  const r = await fetchHoy(currentUrl(), token.value);
  testButton.disabled = false;
  if (r.ok) setStatus(`OK: conectado. Hoy: «${r.hoy.headline}».`);
  else setStatus(`Error: ${r.message}`, true);
});

void loadSettings().then((s) => {
  baseUrl.value = s.baseUrl;
  token.value = s.token;
  syncAjustesLink();
});
