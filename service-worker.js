/**
 * service-worker.js
 * Service Worker pour mise en cache et fonctionnement hors ligne
 */

const CACHE_NAME = 'piscine-v1';
const urlsToCache = [
  './',
  './index.html',
  './pool-model.js',
  './mqtt-service.js',
  './ui-controller.js',
  './app.js',
  './style.css',
  'https://cdnjs.cloudflare.com/ajax/libs/mqtt/4.3.7/mqtt.min.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
];

// Installation - mise en cache initiale
self.addEventListener('install', event => {
  console.log('[SW] Installation...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Mise en cache des ressources');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Active immédiatement
  );
});

// Activation - nettoyage des anciens caches
self.addEventListener('activate', event => {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Prend le contrôle immédiatement
  );
});

// Interception des requêtes - stratégie Cache First
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;
  
  // Ignorer les connexions WebSocket MQTT
  if (event.request.url.includes('mqtt') || 
      event.request.url.includes('ws://') || 
      event.request.url.includes('wss://')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - retourner la réponse du cache
        if (response) {
          console.log('[SW] Cache hit:', event.request.url);
          return response;
        }

        // Cache miss - télécharger et mettre en cache
        console.log('[SW] Téléchargement:', event.request.url);
        return fetch(event.request).then(response => {
          // Vérifier si la réponse est valide
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Cloner la réponse car elle ne peut être consommée qu'une fois
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(error => {
          console.error('[SW] Erreur fetch:', error);
          // Page de fallback en cas d'erreur
          return caches.match('./index.html');
        });
      })
  );
});
