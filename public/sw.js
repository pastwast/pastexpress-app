// Cache minimal permettant de rouvrir la tournée sans réseau.
// Stratégie : on privilégie toujours le réseau, et on retombe sur le cache
// uniquement quand il est injoignable (sous-sol, zone blanche).
const CACHE = 'pastexpress-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Ne jamais mettre en cache l'authentification : une session périmée
  // servie hors-ligne créerait plus de confusion qu'autre chose.
  if (url.pathname.startsWith('/api/auth')) return;

  const isNavigation = request.mode === 'navigate';
  const isTournees = url.pathname === '/api/tournees';
  const isStatic = url.pathname.startsWith('/_next/static');

  if (isStatic) {
    // Fichiers versionnés : le cache fait foi, c'est ce qui rend le
    // chargement instantané et possible sans réseau.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
    return;
  }

  if (isNavigation || isTournees) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(
              JSON.stringify({ error: 'Hors ligne et aucune donnée en cache.' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          })
        )
    );
  }
});
