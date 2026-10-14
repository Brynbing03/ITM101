/* Bump VERSION whenever publishing changes to the app shell. */
const VERSION = 'v14';
const BASE = new URL('./', self.location.href);
const PREFIX = `my-day:${BASE.pathname}:`;
const CACHE = PREFIX + VERSION;
const SHELL = [
    './index.html', './styles.css', './script.js', './pwa.js',
    './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
    './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
].map(path => new URL(path, BASE).href);

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
    // Let an existing app finish using its current version before activating updates.
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
    const navigation = request.mode === 'navigate';
    const canonical = new URL(url.pathname, BASE.origin).href;
    if (!navigation && !SHELL.includes(canonical)) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        try {
            const response = await fetch(request);
            if (!response.ok) throw new Error('App resource unavailable');
            // Navigation responses may vary; keep the known app entry as our offline fallback.
            if (!navigation) await cache.put(canonical, response.clone());
            return response;
        } catch {
            const fallback = await cache.match(navigation ? new URL('./index.html', BASE).href : canonical);
            return fallback || new Response('My Day is unavailable offline. Connect to the internet and reopen it.', {
                status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
            });
        }
    })());
});
