/* global self, caches, Response, URL, fetch */

const CACHE_VERSION = 'boardly-pwa-v1'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
const OFFLINE_URL = '/offline.html'

const PRECACHE_URLS = [
  '/',
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/icon-maskable-192.svg',
  '/icons/icon-maskable-512.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await cache.addAll(PRECACHE_URLS)
      await self.skipWaiting()
    })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

function isSameOrigin(url) {
  return url.origin === self.location.origin
}

function isStaticAsset(requestUrl) {
  return (
    requestUrl.pathname.startsWith('/_next/static/') ||
    requestUrl.pathname.startsWith('/icons/') ||
    requestUrl.pathname.startsWith('/sounds/') ||
    /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|avif|woff2?|ttf)$/i.test(requestUrl.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (!isSameOrigin(requestUrl)) return
  if (requestUrl.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request)
          const cache = await caches.open(RUNTIME_CACHE)
          cache.put(request, networkResponse.clone())
          return networkResponse
        } catch {
          const cachedPage = await caches.match(request)
          if (cachedPage) return cachedPage
          const offlinePage = await caches.match(OFFLINE_URL)
          return offlinePage || Response.error()
        }
      })()
    )
    return
  }

  if (isStaticAsset(requestUrl)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached

        const response = await fetch(request)
        const cache = await caches.open(RUNTIME_CACHE)
        cache.put(request, response.clone())
        return response
      })()
    )
  }
})
