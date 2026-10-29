const OFFLINE_CONFIG = null;
const CACHE_PREFIX = 'mcb-tools-produccion-';
const CACHE_NAME = CACHE_PREFIX + OFFLINE_CONFIG.version;
const BASE = self.registration.scope;
const META_URL = new URL('__offline_status__', BASE).href;
const ASSETS = OFFLINE_CONFIG.assets.map(asset => ({ ...asset, url: new URL(asset.url, BASE).href }));
const RESOURCES = new Map(ASSETS.map(asset => [asset.url, asset]));

async function verifiedResponse(asset) {
  const response = await fetch(new Request(asset.url, { cache: 'no-store', credentials: 'same-origin' }));
  if (!response.ok || response.type === 'opaque') throw new Error('No se pudo descargar el paquete completo.');
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== asset.sha256) throw new Error('El paquete cambió durante la descarga. Vuelve a intentarlo.');
  return response;
}

async function cachePackage() {
  // Verificar todas las respuestas antes de escribir evita guardar una mezcla de despliegues.
  const responses = await Promise.all(ASSETS.map(verifiedResponse));
  const cache = await caches.open(CACHE_NAME);
  for (let i = 0; i < ASSETS.length; i++) await cache.put(ASSETS[i].url, responses[i]);
  await cache.put(META_URL, new Response(JSON.stringify({ savedAt: new Date().toISOString() })));
}

async function offlineStatus() {
  const cache = await caches.open(CACHE_NAME);
  const metadata = await cache.match(META_URL);
  const complete = (await Promise.all(ASSETS.map(asset => cache.match(asset.url)))).every(Boolean);
  const savedAt = metadata ? (await metadata.json()).savedAt : null;
  return { ready: complete && Boolean(savedAt), version: OFFLINE_CONFIG.version, savedAt };
}

self.addEventListener('install', event => {
  event.waitUntil(cachePackage().catch(async error => {
    await caches.delete(CACHE_NAME);
    throw error;
  }));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (!(await offlineStatus()).ready) return;
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const type = event.data?.type;
  if (type !== 'GET_OFFLINE_STATUS' && type !== 'CACHE_OFFLINE' && type !== 'ACTIVATE_UPDATE') return;
  event.waitUntil((async () => {
    let error;
    try {
      if (type === 'CACHE_OFFLINE' || (type === 'ACTIVATE_UPDATE' && !(await offlineStatus()).ready)) await cachePackage();
      const status = await offlineStatus();
      if (type === 'ACTIVATE_UPDATE' && !status.ready) throw new Error('La actualización todavía no está guardada por completo.');
      event.ports[0]?.postMessage(status);
      if (type === 'ACTIVATE_UPDATE') await self.skipWaiting();
      return;
    } catch (failure) {
      error = failure.message || 'No se pudo guardar la copia sin conexión.';
    }
    let status = { ready: false, version: OFFLINE_CONFIG.version, savedAt: null };
    try { status = await offlineStatus(); } catch (_) { /* El navegador puede haber bloqueado el almacenamiento. */ }
    event.ports[0]?.postMessage({ ...status, error });
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  const target = event.request.mode === 'navigate' && url.href === BASE
    ? new URL('index.html', BASE).href : url.href;
  if (!RESOURCES.has(target)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(target) || verifiedResponse(RESOURCES.get(target));
  })());
});
