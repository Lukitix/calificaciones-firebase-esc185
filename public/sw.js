// Service worker mínimo: NO guarda nada en caché (los datos viven en Firebase).
// Solo existe para que el navegador permita instalar la app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
