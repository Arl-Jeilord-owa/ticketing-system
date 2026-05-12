// sw.js — OMTPI HelpDesk Service Worker
const CACHE_NAME   = 'omtpi-helpdesk-v1';
const STATIC_CACHE = 'omtpi-static-v1';

// Assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/assets/css/reset.css',
  '/assets/css/variables.css',
  '/assets/css/theme.css',
  '/assets/css/layout.css',
  '/assets/css/auth.css',
  '/assets/css/sidebar.css',
  '/assets/css/topbar.css',
  '/assets/css/dashboard.css',
  '/assets/css/table.css',
  '/assets/css/panel.css',
  '/assets/css/modal.css',
  '/assets/css/badges.css',
  '/assets/css/components.css',
  '/assets/css/mobile.css',
  '/assets/js/theme.js',
  '/assets/js/utils.js',
  '/assets/js/data.js',
  '/assets/js/render.js',
  '/assets/js/panel.js',
  '/assets/js/modal.js',
  '/assets/js/app.js',
  '/assets/images/logo_omtpi.png',
  '/assets/images/logo.png',
];

// ── Install: pre-cache static assets ──────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for static ───
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Always go network for API calls — never serve stale auth/data
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'You appear to be offline.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Cache-first for static assets (CSS, JS, images, fonts)
  if (
    request.method === 'GET' &&
    (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js'))
  ) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        const clone = response.clone();
        caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
        return response;
      }))
    );
    return;
  }

  // Network-first for HTML pages (always get fresh shell)
  event.respondWith(
    fetch(request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
  );
});

// ── Push notifications (future use) ───────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'OMTPI HelpDesk', {
      body:  data.body  || '',
      icon:  '/assets/images/icon-192.png',
      badge: '/assets/images/icon-192.png',
      data:  data.url ? { url: data.url } : {},
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.notification.data?.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});