// Minimal service worker. It only makes the app installable on a phone: nothing is cached, because
// every response depends on the signed-in session and must always come from the server.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
