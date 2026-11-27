// ─────────────────────────────────────────────────────────────
// SERVICE WORKER
// Guarda los archivos de la app en el celular para que abra rápido
// y aunque no haya señal. Los DATOS (Supabase) nunca se guardan aquí:
// siempre van por internet.
//
// Estrategias:
//  - Archivos de la app (página, CSS, JS, iconos): primero internet;
//    sin señal → la copia guardada. Así nunca se queda con código viejo.
//  - Librerías de la CDN con versión fija (Supabase, jsPDF): la guardada.
// ⚠️ Al publicar cambios, sube VERSION para limpiar la caché vieja.
// ─────────────────────────────────────────────────────────────
const VERSION = 'rh-v1';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/auth.js',
  './js/categorias.js',
  './js/clasificador.js',
  './js/datos.js',
  './js/datos-demo.js',
  './js/datos-supabase.js',
  './js/ia.js',
  './js/media.js',
  './js/supabase.js',
  './js/ui.js',
  './js/pdf.js',
  './icons/logo-rh.svg',
  './icons/logo.webp',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];
// Librerías con versión fija (Supabase, jsPDF): se guardan para siempre
const CDN = 'https://cdn.jsdelivr.net/npm/';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ARCHIVOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

async function primeroRed(pedido) {
  const cache = await caches.open(VERSION);
  try {
    // no-cache: pregunta al servidor si hay versión nueva (no usa la caché HTTP de 10 min)
    const resp = await fetch(pedido, { cache: 'no-cache' });
    if (resp.ok) cache.put(pedido, resp.clone());
    return resp;
  } catch {
    const guardada = await cache.match(pedido);
    if (guardada) return guardada;
    return pedido.mode === 'navigate' ? (await cache.match('./index.html')) : Response.error();
  }
}

async function primeroCache(pedido) {
  const cache = await caches.open(VERSION);
  const guardada = await cache.match(pedido);
  if (guardada) return guardada;
  const resp = await fetch(pedido);
  if (resp.ok) cache.put(pedido, resp.clone());
  return resp;
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;            // POST (IA, login...) siempre a la red
  const url = new URL(request.url);

  if (url.href.startsWith(CDN)) {
    e.respondWith(primeroCache(request));
    return;
  }
  if (url.origin !== self.location.origin) return;  // Supabase y demás: sin caché

  e.respondWith(primeroRed(request));
});
