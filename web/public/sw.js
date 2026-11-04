// Cache só do shell do app. A API nunca passa por aqui: dados financeiros não ficam em cache.
const CACHE = 'tracker-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icone-192.png', '/icone-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    evento.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    evento.respondWith(
      caches.match(request).then(
        (guardado) =>
          guardado ||
          fetch(request).then((resposta) => {
            const copia = resposta.clone();
            caches.open(CACHE).then((c) => c.put(request, copia));
            return resposta;
          }),
      ),
    );
  }
});
