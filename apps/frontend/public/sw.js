/* Service worker de AI Creator Studio.
 * Cachea SOLO el shell estático. Nunca toca /api/, peticiones con X-API-Key,
 * ni nada que no sea del mismo origen (la API suele vivir en otro origen). */
const VERSION = 'acs-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon.svg'];
const OFFLINE_HTML =
  '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title>' +
  '<style>body{font:16px system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#E8E9EE;color:#16151F;padding:16px}main{max-width:32rem}h1{font-size:1.4rem}</style></head>' +
  '<body><main><h1>Sin conexión</h1><p>AI Creator Studio no puede cargar ahora. Comprueba tu red y vuelve a intentarlo.</p></main></body></html>';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isCacheableStatic(url) {
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (req.headers.has('X-API-Key') || req.headers.has('Authorization')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put('/index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches
            .match('/index.html')
            .then((hit) => hit || new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
        ),
    );
    return;
  }

  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
  }
});
