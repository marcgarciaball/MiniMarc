/*
 * Read-only cache for Agente Personal. No offline capture: writes (POST, server actions) and /api/*
 * always go to the network and are never cached.
 *   - Android share target (POST /compartir): never cached. Shared images are shrunk here first
 *     (long side 1600 px, WebP/JPEG 0.8, like lib/photos/resize.ts) so camera photos fit the
 *     request size limit; if that fails, the original request goes through untouched.
 *   - Page navigations: network first; offline, the last cached copy of that page.
 *   - Static assets (/_next/static, /icons, manifest): cache first.
 * Push (morning digest): shows the notification; a tap focuses an open window or opens /hoy.
 */
const VERSION = 'v1';
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
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/compartir') {
    event.respondWith(forwardShare(request));
    return;
  }
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
  }
});

// ---------- Share target: shrink images, then POST to the server (no cache) ----------
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

async function forwardShare(request) {
  const original = request.clone();
  try {
    const form = await request.formData();
    const out = new FormData();
    for (const [name, value] of form.entries()) {
      if (typeof value === 'string') out.append(name, value);
      else {
        const file = await shrink(value);
        out.append(name, file, file.name);
      }
    }
    // 'manual': the server answers 303 to /bandeja (or /login); the navigation follows it.
    return await fetch('/compartir', { method: 'POST', body: out, credentials: 'same-origin', redirect: 'manual' });
  } catch {
    return fetch(original);
  }
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    // Only real pages: not redirects (e.g. to /login) nor errors.
    if (response.ok && !response.redirected) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    throw error;
  }
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
