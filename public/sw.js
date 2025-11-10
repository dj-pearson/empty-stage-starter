// TryEatPal Service Worker - Progressive Web App with Offline Support
// Version: 1.0.0

const CACHE_NAME = 'tryeatpal-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
];

// API endpoints that should use network-first strategy
const API_PATTERNS = [
  /\/functions\/v1\//,
  /\/rest\/v1\//,
  /\/auth\/v1\//,
];

// Assets that should use cache-first strategy
const CACHE_FIRST_PATTERNS = [
  /\.(png|jpg|jpeg|svg|gif|webp|avif)$/,
  /\.(woff|woff2|ttf|eot)$/,
  /\.(css|js)$/,
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW] Caching static assets');

      try {
        await cache.addAll(STATIC_ASSETS);
        console.log('[SW] Static assets cached successfully');
      } catch (error) {
        console.error('[SW] Error caching static assets:', error);
      }

      // Force waiting service worker to become active
      await self.skipWaiting();
    })()
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');

  event.waitUntil(
    (async () => {
      // Delete old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );

      // Take control of all clients immediately
      await self.clients.claim();
      console.log('[SW] Service worker activated');
    })()
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // API requests: Network-first strategy
        if (API_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
          return await networkFirstStrategy(request);
        }

        // Static assets: Cache-first strategy
        if (CACHE_FIRST_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
          return await cacheFirstStrategy(request);
        }

        // Navigation requests: Network-first, offline fallback
        if (request.mode === 'navigate') {
          return await networkFirstWithOfflineFallback(request);
        }

        // Default: Network-first
        return await networkFirstStrategy(request);
      } catch (error) {
        console.error('[SW] Fetch error:', error);
        return new Response('Network error', { status: 503 });
      }
    })()
  );
});

// Network-first strategy: Try network, fallback to cache
async function networkFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

// Cache-first strategy: Try cache, fallback to network
async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Return cached response and update cache in background
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
      })
      .catch(() => {
        // Silently fail background update
      });

    return cachedResponse;
  }

  // Not in cache, fetch from network
  const response = await fetch(request);

  if (response && response.status === 200) {
    cache.put(request, response.clone());
  }

  return response;
}

// Network-first with offline fallback for navigation
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);

    // Cache successful navigation responses
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log('[SW] Navigation offline, showing offline page');
    const cache = await caches.open(CACHE_NAME);
    const offlineResponse = await cache.match(OFFLINE_URL);

    if (offlineResponse) {
      return offlineResponse;
    }

    // Fallback offline page if not cached
    return new Response(
      `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - TryEatPal</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            padding: 20px;
          }
          .container {
            max-width: 400px;
          }
          h1 {
            font-size: 3em;
            margin: 0 0 20px;
          }
          p {
            font-size: 1.2em;
            margin-bottom: 30px;
          }
          button {
            background: white;
            color: #667eea;
            border: none;
            padding: 15px 30px;
            font-size: 1em;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          }
          button:hover {
            transform: scale(1.05);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📱</h1>
          <h2>You're Offline</h2>
          <p>It looks like you've lost your internet connection. TryEatPal works offline, but some features require connectivity.</p>
          <button onclick="location.reload()">Try Again</button>
        </div>
      </body>
      </html>
      `,
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }
}

// Background sync event - sync data when back online
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);

  if (event.tag === 'sync-meal-plans') {
    event.waitUntil(syncMealPlans());
  } else if (event.tag === 'sync-grocery-list') {
    event.waitUntil(syncGroceryList());
  } else if (event.tag === 'sync-votes') {
    event.waitUntil(syncVotes());
  }
});

async function syncMealPlans() {
  console.log('[SW] Syncing meal plans...');
  // Implementation would sync pending changes from IndexedDB to server
  // This is handled by the app's sync logic
}

async function syncGroceryList() {
  console.log('[SW] Syncing grocery list...');
  // Implementation would sync pending changes
}

async function syncVotes() {
  console.log('[SW] Syncing votes...');
  // Implementation would sync pending votes
}

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  const options = {
    body: event.data ? event.data.text() : 'New update from TryEatPal',
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-32x32.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: 'explore',
        title: 'View',
      },
      {
        action: 'close',
        title: 'Close',
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification('TryEatPal', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action);

  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message event - communicate with app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
});

console.log('[SW] Service worker loaded');
