// FashionFeet Pro Stock Transfer Hub — Service Worker
const CACHE_NAME = 'ff-transfer-v1';
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
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only cache local asset requests; API requests go directly to network
    if (event.request.url.includes('supabase.co') || event.request.url.includes('unpkg.com')) {
        return; // network fetch
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return fetch(event.request).then((networkResponse) => {
                return networkResponse;
            }).catch(() => caches.match('./index.html'));
        })
    );
});
