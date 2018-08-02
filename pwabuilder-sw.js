// From https://googlechrome.github.io/samples/service-worker/basic/

const PRECACHE_URLS = [
    "index.html", "js/babylon.js", "js/babylon.glTFFileLoader.js", "js/babylon.gui.min.js", "js/pep.min.js", "js/applecrushervr.js",
    "textures/environment.dds", "textures/flare.png", "images/LogoApplesCrusher300transparent.png", "css/main.css",
    "assets/ApplesCrusherBackground.glb.manifest", "assets/Apple.glb.manifest", "assets/AppleCrushed.wav", "assets/RunningForGlory.mp3",
    "manifest.json", "assets/186950__readeonly__toy-cannon-shot.wav", "assets/bananapistolwithammo.glb.manifest", "assets/lasersaber.glb.manifest"
];

// Names of the two caches used in this version of the service worker.
// Change to v2, etc. when you update any of the local resources, which will
// in turn trigger the install event again.
const PRECACHE = 'precache-v1';
const RUNTIME = 'runtime';

// The install handler takes care of precaching the resources we always need.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(PRECACHE)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(self.skipWaiting())
    );
});

// The activate handler takes care of cleaning up old caches.
self.addEventListener('activate', event => {
    const currentCaches = [PRECACHE, RUNTIME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
        }).then(cachesToDelete => {
            return Promise.all(cachesToDelete.map(cacheToDelete => {
                return caches.delete(cacheToDelete);
            }));
        }).then(() => self.clients.claim())
    );
});

// The fetch handler serves responses for same-origin resources from a cache.
// If no response is found, it populates the runtime cache with the response
// from the network before returning it to the page.
self.addEventListener('fetch', event => {
    // Skip cross-origin requests, like those for Google Analytics.
    if (event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request, {ignoreSearch: true}).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return caches.open(RUNTIME).then(cache => {
                    return fetch(event.request).then(response => {
                        // Put a copy of the response in the runtime cache.
                        return cache.put(event.request, response.clone()).then(() => {
                            return response;
                        });
                    });
                });
            })
        );
    }
});
