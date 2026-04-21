/**
 * service-worker.js
 * Service Worker — mise en cache + réception des notifications push
 */

const CACHE_NAME = 'piscine-v2'; // incrémenté pour forcer la mise à jour
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/ui-controller.js',
  '/mqtt-service.js',
  '/push-manager.js',
  '/style.css',
  '/shared/pool-model.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mqtt/4.3.7/mqtt.min.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
];

// ── Installation ──────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installation…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Mise en cache des ressources');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activation ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activation…');
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Suppression ancien cache :', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch (Cache First) ───────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (
    event.request.url.includes('mqtt') ||
    event.request.url.includes('ws://') ||
    event.request.url.includes('wss://')
  ) return;

  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        console.log('[SW] Cache hit :', event.request.url);
        return response;
      }
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'error') return response;
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// ── Push : réception d'une notification ──────────────────────────────────────
self.addEventListener('push', event => {
  console.log('[SW] Push reçu');

  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: '🏊 Piscine', body: event.data.text() };
  }

  const options = {
    body:     data.body    || 'Vérifiez l\'état de votre piscine.',
    icon:     data.icon    || '/icons/icon-192.png',
    badge:    data.badge   || '/icons/icon-72.png',
    tag:      data.tag     || 'piscine-alert',
    renotify: data.renotify ?? true,
    data:     data.data    || {},
    // Boutons d'action
    actions: [
      { action: 'open',    title: 'Ouvrir l\'app' },
      { action: 'dismiss', title: 'Ignorer'        },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '🏊 Piscine — Alerte', options)
  );
});

// ── Clic sur notification ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  console.log('[SW] Clic notification, action :', event.action);
  event.notification.close();

  if (event.action === 'dismiss') return;

  // Mettre l'app au premier plan si déjà ouverte, sinon l'ouvrir
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});
