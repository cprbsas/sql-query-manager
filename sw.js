// Service Worker — cachea la app shell para uso offline
// Estrategia: cache-first para assets propios, network-first para Google APIs (no las cacheamos)

const CACHE_VERSION = 'v2.0.0';
const CACHE_NAME = `sql-lib-${CACHE_VERSION}`;

// App shell: lo mínimo para que la UI cargue offline
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/main.js',
  './js/config.js',
  './js/utils.js',
  './js/state.js',
  './js/sql.js',
  './js/csv.js',
  './js/drive.js',
  './js/ui/render.js',
  './js/ui/modal.js',
  './js/ui/confirm.js',
  './js/ui/toast.js',
  './js/ui/queries.js',
  './js/ui/categories.js',
  './js/ui/databases.js',
  './js/ui/import.js',
  './js/ui/backup.js',
];

// Instalar: precache del shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('SW install error:', err))
  );
});

// Activar: limpia caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('sql-lib-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: estrategia mixta
self.addEventListener('fetch', event => {
  const { request } = event;

  // Solo manejamos GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca cachear Google APIs (datos en vivo)
  if (
    url.host.includes('googleapis.com') ||
    url.host.includes('google.com') ||
    url.host.includes('gstatic.com')
  ) {
    // Pasamos directo a la red sin cachear
    return;
  }

  // Para Google Fonts, cache-first (son inmutables con hash)
  if (url.host.includes('fonts.googleapis.com') || url.host.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Para nuestro dominio: cache-first con fallback a red
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Sin red y sin cache — devuelve el shell para navegaciones
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

// Permite que el cliente fuerce skipWaiting desde un mensaje
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
