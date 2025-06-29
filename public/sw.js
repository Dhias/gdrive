const CACHE_NAME = "localdrive-v1"
const STATIC_CACHE = "localdrive-static-v1"
const DYNAMIC_CACHE = "localdrive-dynamic-v1"

// Files to cache immediately
const STATIC_FILES = [
  "/",
  "/offline",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/_next/static/css/app/layout.css",
  "/_next/static/chunks/webpack.js",
  "/_next/static/chunks/main.js",
  "/_next/static/chunks/pages/_app.js",
]

// Install event - cache static files
self.addEventListener("install", (event) => {
  console.log("Service Worker installing...")
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("Caching static files")
        return cache.addAll(STATIC_FILES.map((url) => new Request(url, { cache: "reload" })))
      })
      .catch((error) => {
        console.log("Cache failed:", error)
      }),
  )
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("Service Worker activating...")
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log("Deleting old cache:", cacheName)
            return caches.delete(cacheName)
          }
        }),
      )
    }),
  )
  self.clients.claim()
})

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== "GET") {
    return
  }

  // Skip chrome-extension and other non-http requests
  if (!request.url.startsWith("http")) {
    return
  }

  // Handle API requests
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone response for caching
          const responseClone = response.clone()

          // Cache successful responses
          if (response.status === 200) {
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }

          return response
        })
        .catch(() => {
          // Return cached version if available
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse
            }
            // Return offline response for API calls
            return new Response(
              JSON.stringify({
                error: "Offline",
                message: "This feature requires an internet connection",
              }),
              {
                status: 503,
                statusText: "Service Unavailable",
                headers: { "Content-Type": "application/json" },
              },
            )
          })
        }),
    )
    return
  }

  // Handle page requests
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request)
        .then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response
          }

          // Clone the response
          const responseToCache = response.clone()

          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseToCache)
          })

          return response
        })
        .catch(() => {
          // Return offline page for navigation requests
          if (request.mode === "navigate") {
            return caches.match("/offline")
          }

          // Return a basic offline response for other requests
          return new Response("Offline content not available", {
            status: 503,
            statusText: "Service Unavailable",
          })
        })
    }),
  )
})

// Background sync for file uploads
self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync-upload") {
    event.waitUntil(
      // Handle queued uploads when back online
      handleBackgroundSync(),
    )
  }
})

async function handleBackgroundSync() {
  try {
    // Get queued uploads from IndexedDB
    const queuedUploads = await getQueuedUploads()

    for (const upload of queuedUploads) {
      try {
        await processQueuedUpload(upload)
        await removeFromQueue(upload.id)
      } catch (error) {
        console.log("Failed to process queued upload:", error)
      }
    }
  } catch (error) {
    console.log("Background sync failed:", error)
  }
}

// Helper functions for background sync
async function getQueuedUploads() {
  // This would integrate with your existing IndexedDB structure
  return []
}

async function processQueuedUpload(upload) {
  // Process the queued upload
  return fetch("/api/upload", {
    method: "POST",
    body: upload.data,
  })
}

async function removeFromQueue(uploadId) {
  // Remove processed upload from queue
  console.log("Removed upload from queue:", uploadId)
}

// Push notification handling
self.addEventListener("push", (event) => {
  const options = {
    body: event.data ? event.data.text() : "File operation completed",
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: "explore",
        title: "Open LocalDrive",
        icon: "/icon-192x192.png",
      },
      {
        action: "close",
        title: "Close",
        icon: "/icon-192x192.png",
      },
    ],
  }

  event.waitUntil(self.registration.showNotification("LocalDrive", options))
})

// Notification click handling
self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  if (event.action === "explore") {
    event.waitUntil(clients.openWindow("/"))
  }
})
