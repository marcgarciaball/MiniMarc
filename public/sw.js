/*
 * Read-only cache for Agente Personal. No offline capture: writes (POST, server actions) and /api/*
 * always go to the network and are never cached.
 *   - Android share target (POST /compartir navigation): never sent to the server (I-1, CSRF:
 *     any page could post a share form). Shared images are shrunk here (long side 1600 px,
 *     WebP/JPEG 0.8, like lib/photos/resize.ts); title, text, url and images are kept in
 *     IndexedDB under a random id (lib/share/stash.ts reads it), then a 303 to
 *     /compartir?id=…, where Marc confirms with «Guardar» or drops it with «Descartar».
 *   - Page navigations: stale-while-revalidate. A screen visited before paints at once from its
 *     last copy while the network fetches a fresh one, which replaces the copy; then the page is
 *     told (`page-updated`) and refreshes its data in place. First visits wait for the network.
 *     Never cached: /api/*, /auth/*, /login, /compartir (share confirm) and redirects (e.g. to
 *     /login: the stale copy is dropped). Any Server Action (a write) drops every cached page, so
 *     a reload after Marc's own change never paints the old copy. Logout empties every cache.
 *   - Static assets (/_next/static, /icons, manifest): cache first.
 * Push (morning digest, weekly summary): shows the notification; a tap focuses an open window
 * and opens its url (/hoy by default).
 */
const VERSION = 'v2';
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [PAGES, STATIC];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Only the share navigation; the confirm page's server actions (fetch POSTs) go to the network.
  if (request.method === 'POST' && request.mode === 'navigate' && url.origin === self.location.origin && url.pathname === '/compartir') {
    event.respondWith(stashShare(request));
    return;
  }
  // A Server Action (a write, usually): the cached pages may now be stale, so drop them all;
  // the next visit to each waits for the network once. The action itself is not touched.
  if (request.method === 'POST' && url.origin === self.location.origin && request.headers.has('Next-Action')) {
    event.waitUntil(caches.delete(PAGES));
    return;
  }
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (request.mode === 'navigate') {
    if (isUncachedPage(url)) return;
    event.respondWith(staleWhileRevalidate(event));
  } else if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
  }
});

// ---------- Share target: shrink images, keep them on the device, confirm on /compartir ----------
const MAX_SIDE = 1600;
const QUALITY = 0.8;

/** Same math as fitWithin in lib/photos/resize.ts. */
function fitWithin(width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function shrink(file) {
  if (!file.type.startsWith('image/') || typeof OffscreenCanvas === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(size.width, size.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    let blob = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });
    if (blob.type !== 'image/webp') blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const base = (file.name || 'foto').replace(/\.[^.]*$/, '');
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}

// Same names as lib/share/stash.ts (keep them in step).
const SHARE_DB = 'agente-compartir';
const SHARE_STORE = 'shares';
const SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SHARED_FILES = 10;

function openShareDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SHARE_STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Saves the entry and drops entries older than a day (shares never confirmed nor discarded). */
async function putShare(entry) {
  const db = await openShareDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, 'readwrite');
      const store = tx.objectStore(SHARE_STORE);
      store.put(entry);
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        if (entry.createdAt - (c.value.createdAt || 0) > SHARE_MAX_AGE_MS) c.delete();
        c.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Keeps the share on this device and opens the confirm page. Never forwards it to the server. */
async function stashShare(request) {
  const target = (query) => Response.redirect(new URL(`/compartir${query}`, self.location.origin).href, 303);
  try {
    const form = await request.formData();
    const str = (name) => (typeof form.get(name) === 'string' ? form.get(name) : '');
    const files = [];
    for (const value of form.getAll('photos')) {
      if (typeof value === 'string' || !value.type.startsWith('image/') || value.size === 0) continue;
      if (files.length >= MAX_SHARED_FILES) break;
      const file = await shrink(value);
      files.push({ name: file.name, type: file.type, blob: file });
    }
    const id = crypto.randomUUID();
    await putShare({ id, createdAt: Date.now(), title: str('title'), text: str('text'), url: str('url'), files });
    return target(`?id=${id}`);
  } catch {
    return target('?error=1');
  }
}

/** Pages that always go to the network: sign-in, the OAuth return and the share confirm step. */
function isUncachedPage(url) {
  return url.pathname === '/login' || url.pathname === '/compartir' || url.pathname.startsWith('/compartir/');
}

/** Tells the page that was painted from cache that a fresh copy is in (it refreshes in place). */
async function notifyUpdated(clientId, url) {
  // The navigated page's client may not exist yet when the network answers: retry briefly.
  for (let i = 0; i < 10 && clientId; i++) {
    const client = await self.clients.get(clientId);
    if (client) {
      client.postMessage({ type: 'page-updated', url });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(PAGES);
  const cached = await cache.match(request, { ignoreSearch: false });
  const fresh = fetch(request).then(async (response) => {
    // Only real pages: not redirects (e.g. to /login) nor errors.
    if (response.ok && !response.redirected) {
      await cache.put(request, response.clone());
    } else if (cached) {
      // The copy is no longer what the server would show (signed out, gone): drop it.
      await cache.delete(request);
    }
    if (cached) await notifyUpdated(event.resultingClientId || event.clientId, request.url);
    return response;
  });
  if (cached) {
    // Paint the last copy now; the fetch above finishes in the background.
    event.waitUntil(fresh.catch(() => {}));
    return cached;
  }
  return fresh;
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/hoy';
  event.waitUntil(
    self.registration.showNotification(data.title || 'Hoy', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'digest',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/hoy';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client) await client.navigate(target).catch(() => {});
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
