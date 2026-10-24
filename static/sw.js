// Service worker панели: нужен, чтобы её можно было установить как приложение, и чтобы без сервера
// открывалась оболочка с понятным «сервер недоступен», а не ошибка браузера.
// API никогда не кэшируется. Страница и статика — сначала сеть, кэш только как запасной вариант.
const CACHE = 'panel-v1';
const SHELL = ['/', '/static/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/model.stl' || url.pathname === '/ca.crt') return;
  const key = req.mode === 'navigate' ? '/' : req;
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
    return r;
  }).catch(() => caches.match(key).then(r => r || Response.error())));
});
