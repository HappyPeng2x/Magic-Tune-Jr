const CACHE_VERSION = 'magictunejr-pwa-v1';
const APP_SHELL = [
    './',
    './index.html',
    './manifest.webmanifest',
    './dist/build-id.js',
    './dist/app.bundle.js',
    './media.json',
    './localizations/en.json',
    './css/font.css',
    './css/base.css',
    './css/editor.css',
    './css/editorleftpanel.css',
    './css/editorstage.css',
    './css/editormodal.css',
    './css/librarymodal.css',
    './css/paintlook.css',
    './sounds/boing.wav',
    './sounds/copy.wav',
    './sounds/cut.wav',
    './sounds/entertap.wav',
    './sounds/exittap.wav',
    './sounds/grab.wav',
    './sounds/keydown.wav',
    './sounds/snap.wav',
    './sounds/splash.wav',
    './sounds/tap.wav',
    './pwa/icons/icon-192.png',
    './pwa/icons/icon-512.png'
];

const RUNTIME_PREFIXES = [
    '/assets/',
    '/css/',
    '/localizations/',
    '/pnglibrary/',
    '/samples/',
    '/sounds/',
    '/svglibrary/'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key !== CACHE_VERSION)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_VERSION).then(cache => cache.put('./index.html', copy));
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    // Always discover the newest generated build ID. index.html uses it in
    // the service-worker URL, causing a fresh install for each application build.
    if (url.pathname.endsWith('/dist/build-id.js')) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (shouldRuntimeCache(url.pathname)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request))
    );
});

function shouldRuntimeCache (pathname) {
    const scopePath = new URL(self.registration.scope).pathname;
    const relativePath = pathname.indexOf(scopePath) === 0
        ? '/' + pathname.slice(scopePath.length)
        : pathname;
    return RUNTIME_PREFIXES.some(prefix => relativePath.indexOf(prefix) === 0);
}

function cacheFirst (request) {
    return caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
            if (response && response.ok) {
                const copy = response.clone();
                caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
            }
            return response;
        });
    });
}

function networkFirst (request) {
    return fetch(request).then(response => {
        if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
        }
        return response;
    }).catch(() => caches.match(request));
}
