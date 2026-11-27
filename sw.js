// ─────────────────────────────────────────────────────────────
// SERVICE WORKER
// Guarda los archivos de la app en el celular para que abra rápido
// y aunque no haya señal. Los DATOS (Supabase) nunca se guardan aquí:
// siempre van por internet.
//
// Estrategias:
//  - Página (index.html): primero internet, si no hay → la guardada.
//  - CSS/JS/iconos: se muestra la guardada y se actualiza por detrás.
//  - Librería de Supabase (CDN, versión fija): la guardada.
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
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/';

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
    const resp = await fetch(pedido);
    if (resp.ok) cache.put(pedido, resp.clone());
    return resp;
  } catch {
    return (await cache.match(pedido)) ?? (await cache.match('./index.html'));
  }
}

async function guardadaYActualizar(pedido, evento) {
  const cache = await caches.open(VERSION);
  const guardada = await cache.match(pedido);
  const deRed = fetch(pedido).then((resp) => {
    if (resp.ok) cache.put(pedido, resp.clone());
    return resp;
  }).catch(() => undefined);
  if (guardada) {
    evento.waitUntil(deRed);
    return guardada;
  }
  return (await deRed) ?? Response.error();
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

  if (request.mode === 'navigate') {
    e.respondWith(primeroRed(request));
    return;
  }
  e.respondWith(guardadaYActualizar(request, e));
});
