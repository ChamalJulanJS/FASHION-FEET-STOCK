// FashionFeet Pro Stock Transfer Hub — Service Worker (v4)
const CACHE_NAME = 'ff-transfer-v4';
const ASSETS = [
    './index.html',
    './index.css',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './transfer_receiver.html'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    // Delete any old caches immediately
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    // Direct network for external services
    if (
        event.request.url.includes('supabase.co') || 
        event.request.url.includes('unpkg.com') || 
        event.request.url.includes('googleapis.com') ||
        event.request.url.includes('gstatic.com')
    ) {
        return;
    }

    // Network-First strategy: always fetch fresh assets when online, fall back to cache when offline
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return networkResponse;
            })
            .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
});
