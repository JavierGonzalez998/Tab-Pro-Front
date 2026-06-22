// ponytail: cache soundfont in SW so second visit is instant
const SOUNDFONT_URL = '/soundfont/tiny.sf2'
const CACHE_NAME = 'tabspro-soundfont-v1'

self.addEventListener('install', (event) => {
  // ponytail: skipWaiting to activate immediately
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // ponytail: clean old caches, claim all clients
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Cache the soundfont on first fetch, serve from cache after
  if (url.pathname === SOUNDFONT_URL) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone())
            return response
          })
          return cached || fetchPromise
        })
      )
    )
  }
})
