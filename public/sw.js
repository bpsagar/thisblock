// Offline support. Precaches the app shell, then keeps everything else fresh in the background.
const VERSION = 'tb-v4';
// Works at a domain root or under a sub-path: everything is resolved against the worker's scope.
const ROOT = self.registration.scope;
const SHELL = [
  '', 'manifest.webmanifest', 'favicon.svg',
  'fonts/ia-writer-quattro-latin-400-normal.woff2', 'fonts/ia-writer-quattro-latin-700-normal.woff2',
  'icons/icon-192.png',
].map((p) => new URL(p, ROOT).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    // the built, hashed script and stylesheet
    const html = await (await fetch(ROOT, { cache: 'reload' })).text();
    const assets = [...html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g)].map((m) => new URL(m[1], ROOT).href);
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // network first so a new deploy shows up, cached page when offline
    event.respondWith((async () => {
      try {
        // revalidate, so a new deploy shows up right away instead of after GitHub Pages' 10 minute cache
        const res = await fetch(req, { cache: 'no-cache' });
        (await caches.open(VERSION)).put(ROOT, res.clone());
        return res;
      } catch {
        return (await caches.match(ROOT)) || Response.error();
      }
    })());
    return;
  }

  // stale while revalidate
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req);
    const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await fresh) || Response.error();
  })());
});

// The join button on the focus invite. Without the button, clicking just opens the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const join = event.action === 'join';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all[0];
    if (client) {
      await client.focus();
      if (join) client.postMessage({ type: 'join' });
    } else {
      await self.clients.openWindow(join ? ROOT + '?join=1' : ROOT);
    }
  })());
});
