self.addEventListener("install", event => event.waitUntil(caches.open("astravital-shell-v1").then(cache => cache.addAll(["/","/manifest.webmanifest"]))));
self.addEventListener("fetch", event => event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => caches.match("/")))));
