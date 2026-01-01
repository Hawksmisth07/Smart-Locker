// ==================== Smart Locker Service Worker ====================
// Enables offline functionality and caching for PWA

const CACHE_NAME = 'smart-locker-v1';
const STATIC_CACHE = 'smart-locker-static-v1';
const DYNAMIC_CACHE = 'smart-locker-dynamic-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/profile.html',
    '/history.html',
    '/settings.html',
    '/help.html',
    '/card-sync.html',
    '/forgot-password.html',
    '/style.css',
    '/dashboard.css',
    '/profile.css',
    '/history.css',
    '/settings.css',
    '/help.css',
    '/auth.css',
    '/theme.css',
    '/script.js',
    '/dashboard.js',
    '/theme.js',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch((error) => {
                console.error('[SW] Error caching static assets:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip API requests - always go to network
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // For static assets, use cache-first strategy
    if (isStaticAsset(request.url)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // For HTML pages, use network-first with cache fallback
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Default: cache-first for everything else
    event.respondWith(cacheFirst(request));
});

// Cache-first strategy
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        // Return offline fallback page for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/offline.html') || createOfflinePage();
        }

        throw error;
    }
}

// Network-first strategy
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        // Return offline fallback for navigation
        if (request.mode === 'navigate') {
            return caches.match('/offline.html') || createOfflinePage();
        }

        throw error;
    }
}

// Check if URL is a static asset
function isStaticAsset(url) {
    const staticExtensions = ['.css', '.js', '.woff', '.woff2', '.ttf', '.png', '.jpg', '.jpeg', '.svg', '.ico'];
    return staticExtensions.some(ext => url.includes(ext));
}

// Create offline fallback page
function createOfflinePage() {
    const html = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Smart Locker - Offline</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Inter', 'Segoe UI', sans-serif;
                }
                body {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #1E3C72 0%, #2A5298 50%, #36D1DC 100%);
                    padding: 20px;
                }
                .offline-container {
                    text-align: center;
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(15px);
                    padding: 50px;
                    border-radius: 20px;
                    max-width: 400px;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                }
                .offline-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                }
                h1 {
                    color: white;
                    font-size: 24px;
                    margin-bottom: 15px;
                }
                p {
                    color: rgba(255, 255, 255, 0.8);
                    margin-bottom: 25px;
                    line-height: 1.6;
                }
                button {
                    background: linear-gradient(135deg, #5B86E5, #36D1DC);
                    color: white;
                    border: none;
                    padding: 14px 30px;
                    border-radius: 10px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.3s ease;
                }
                button:hover {
                    transform: translateY(-3px);
                }
            </style>
        </head>
        <body>
            <div class="offline-container">
                <div class="offline-icon">📶</div>
                <h1>Anda Sedang Offline</h1>
                <p>Periksa koneksi internet Anda dan coba lagi. Beberapa fitur mungkin tidak tersedia tanpa koneksi.</p>
                <button onclick="window.location.reload()">Coba Lagi</button>
            </div>
        </body>
        </html>
    `;

    return new Response(html, {
        headers: { 'Content-Type': 'text/html' }
    });
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'sync-locker-data') {
        event.waitUntil(syncLockerData());
    }
});

// Push notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push received');

    const options = {
        body: event.data?.text() || 'Notifikasi dari Smart Locker',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'open',
                title: 'Buka Aplikasi'
            },
            {
                action: 'close',
                title: 'Tutup'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('Smart Locker', options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then((clientList) => {
                    for (const client of clientList) {
                        if (client.url.includes('/dashboard') && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    return clients.openWindow('/dashboard.html');
                })
        );
    }
});

// Sync locker data when back online
async function syncLockerData() {
    // Implementation for syncing offline changes
    console.log('[SW] Syncing locker data...');
}

console.log('[SW] Service worker loaded');
