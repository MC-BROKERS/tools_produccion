import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rename, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const scope = 'https://mc-brokers.github.io/tools_produccion/';
const sha256 = content => createHash('sha256').update(content).digest('hex');
const template = () => readFile(path.join(root, 'scripts/service-worker.js'), 'utf8');

async function fixture() {
  const folder = await mkdtemp(path.join(tmpdir(), 'mcb-offline-'));
  const sourceDir = path.join(folder, 'source');
  const outputDir = path.join(folder, 'site');
  await mkdir(path.join(sourceDir, 'scripts'), { recursive: true });
  await mkdir(path.join(sourceDir, 'pricing/2026-2027'), { recursive: true });
  await mkdir(path.join(sourceDir, 'data'), { recursive: true });
  await mkdir(path.join(sourceDir, 'assets'), { recursive: true });
  await writeFile(path.join(sourceDir, 'index.html'), '<html>MCB</html>');
  await writeFile(path.join(sourceDir, 'manifest.webmanifest'), '{"name":"MCB"}');
  await writeFile(path.join(sourceDir, 'pricing/2026-2027/pricing.json'), '{"total":444.85}');
  await writeFile(path.join(sourceDir, 'data/campanas.json'), '[]');
  await writeFile(path.join(sourceDir, 'assets/style.css'), '.hidden{display:none}');
  await writeFile(path.join(sourceDir, 'assets/.DS_Store'), 'private');
  await writeFile(path.join(sourceDir, 'README.md'), 'not public');
  await writeFile(path.join(sourceDir, 'scripts/service-worker.js'), await template());
  return { sourceDir, outputDir };
}

class MemoryCache {
  constructor(storage) { this.storage = storage; this.entries = new Map(); }
  async match(request) { return this.entries.get(typeof request === 'string' ? request : request.url)?.clone(); }
  async put(request, response) {
    if (this.storage.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.entries.set(typeof request === 'string' ? request : request.url, response.clone());
  }
  async keys() { return [...this.entries.keys()].map(url => new Request(url)); }
}

class MemoryStorage {
  constructor() { this.data = new Map(); this.failWrites = false; }
  async open(name) {
    if (!this.data.has(name)) this.data.set(name, new MemoryCache(this));
    return this.data.get(name);
  }
  async keys() { return [...this.data.keys()]; }
  async delete(name) { return this.data.delete(name); }
}

async function worker({ version = 'v2', files = { 'index.html': 'new page', 'pricing/rates.json': '{"total":444.85}' }, storage = new MemoryStorage(), network = files } = {}) {
  const handlers = new Map();
  const config = { version, assets: Object.entries(files).map(([url, text]) => ({ url, sha256: sha256(text) })) };
  const state = { claims: 0, skipped: 0 };
  const context = vm.createContext({
    self: {
      registration: { scope },
      addEventListener: (event, listener) => handlers.set(event, listener),
      clients: { claim: async () => { state.claims++; } },
      skipWaiting: async () => { state.skipped++; }
    },
    caches: storage, URL, Request, Response, crypto: webcrypto, Uint8Array, Date, Promise, console,
    fetch: async input => {
      const url = new URL(typeof input === 'string' ? input : input.url, scope);
      const relative = url.href.startsWith(scope) ? url.href.slice(scope.length) : url.href;
      if (network instanceof Error) throw network;
      if (!(relative in network)) return new Response('missing', { status: 404 });
      return new Response(network[relative]);
    }
  });
  vm.runInContext((await template()).replace('const OFFLINE_CONFIG = null;', `const OFFLINE_CONFIG = ${JSON.stringify(config)};`), context);
  async function dispatch(type, props = {}) {
    const waits = [];
    const event = { waitUntil: promise => waits.push(promise), ...props };
    handlers.get(type)(event);
    await Promise.all(waits);
  }
  async function message(type) {
    let result;
    await dispatch('message', { data: { type }, ports: [{ postMessage: value => { result = JSON.parse(JSON.stringify(value)); } }] });
    return result;
  }
  function request(url, { navigate = false, method = 'GET' } = {}) {
    let response;
    handlers.get('fetch')({ request: { url: new URL(url, scope).href, method, mode: navigate ? 'navigate' : 'cors' }, respondWith: promise => { response = Promise.resolve(promise); } });
    return response;
  }
  return { dispatch, message, request, state, storage, config };
}

test('build publica solo recursos del sitio, sin documentos privados ni enlaces simbólicos', async () => {
  const { buildSite } = await import('../scripts/build-site.mjs');
  const options = await fixture();
  await symlink(path.join(options.sourceDir, 'README.md'), path.join(options.sourceDir, 'assets/private-link.txt'));
  const built = await buildSite(options);
  assert.equal(built.assets.length, 5);
  assert.deepEqual((await readdir(options.outputDir)).sort(), ['assets', 'data', 'index.html', 'manifest.webmanifest', 'pricing', 'sw.js']);
  assert.deepEqual(await readdir(path.join(options.outputDir, 'assets')), ['style.css']);
  assert.match(await readFile(path.join(options.outputDir, 'sw.js'), 'utf8'), new RegExp(built.version));
  assert.equal(built.assets.find(asset => asset.url === 'pricing/2026-2027/pricing.json').sha256, sha256('{"total":444.85}'));
});

test('cambiar solo tarifas o lógica del worker crea versión nueva; el mismo contenido es reproducible', async () => {
  const { buildSite } = await import('../scripts/build-site.mjs');
  const options = await fixture();
  const original = await buildSite(options);
  assert.equal((await buildSite(options)).version, original.version);
  await writeFile(path.join(options.sourceDir, 'pricing/2026-2027/pricing.json'), '{"total":500}');
  const dataUpdate = await buildSite(options);
  assert.notEqual(dataUpdate.version, original.version);
  await writeFile(path.join(options.sourceDir, 'scripts/service-worker.js'), `${await template()}\n// new behavior`);
  assert.notEqual((await buildSite(options)).version, dataUpdate.version);
});

test('build rechaza salidas que sobrescribirían fuentes', async () => {
  const { buildSite } = await import('../scripts/build-site.mjs');
  const options = await fixture();
  for (const outputDir of [options.sourceDir, path.dirname(options.sourceDir), path.join(options.sourceDir, 'assets')]) {
    await assert.rejects(buildSite({ ...options, outputDir }), /salida|output|fuente/i);
  }
  assert.equal(await readFile(path.join(options.sourceDir, 'index.html'), 'utf8'), '<html>MCB</html>');
});

test('build no sigue symlinks de entrada ni de salida que podrían exponer o sobrescribir archivos', async () => {
  const { buildSite } = await import('../scripts/build-site.mjs');
  const options = await fixture();
  const link = path.join(path.dirname(options.sourceDir), 'alias-source');
  await symlink(options.sourceDir, link);
  await assert.rejects(buildSite({ ...options, outputDir: link }), /salida|fuente|simbólico/i);
  await mkdir(options.outputDir);
  await symlink(path.join(options.sourceDir, 'index.html'), path.join(options.outputDir, 'index.html'));
  await assert.rejects(buildSite(options), /simbólico|salida/i);
  assert.equal(await readFile(path.join(options.sourceDir, 'index.html'), 'utf8'), '<html>MCB</html>');
  const other = await fixture();
  await symlink(path.join(other.sourceDir, 'README.md'), path.join(other.sourceDir, 'data/secret.json'));
  assert.equal((await buildSite(other)).assets.some(asset => asset.url.includes('secret')), false);
});

test('build rechaza JSON inválido antes de crear un paquete publicable', async () => {
  const { buildSite } = await import('../scripts/build-site.mjs');
  const options = await fixture();
  await writeFile(path.join(options.sourceDir, 'pricing/2026-2027/pricing.json'), '{invalid');
  await assert.rejects(buildSite(options), /JSON|json/);
});

test('build rechaza raíces assets, pricing o data que sean enlaces a una carpeta externa', async () => {
  const { buildSite } = await import('../scripts/build-site.mjs');
  for (const name of ['assets', 'pricing', 'data']) {
    const options = await fixture();
    const external = path.join(path.dirname(options.sourceDir), 'outside');
    await rename(path.join(options.sourceDir, name), external);
    await symlink(external, path.join(options.sourceDir, name));
    await assert.rejects(buildSite(options), /simbólico/);
  }
});

test('primera instalación prepara todos los recursos y fecha, sin activar actualizaciones automáticamente', async () => {
  const app = await worker();
  await app.dispatch('install');
  const status = await app.message('GET_OFFLINE_STATUS');
  assert.deepEqual({ ready: status.ready, version: status.version }, { ready: true, version: 'v2' });
  assert.ok(Date.parse(status.savedAt));
  assert.equal(app.state.skipped, 0);
  assert.equal(await (await app.request(scope, { navigate: true })).text(), 'new page');
  assert.equal(await (await app.request('index.html?from=home', { navigate: true })).text(), 'new page');
  assert.equal(await (await app.request('pricing/rates.json?cache=ignored')).text(), '{"total":444.85}');
});

test('reapertura sin servidor usa la copia completa guardada', async () => {
  const online = await worker();
  await online.dispatch('install');
  const offline = await worker({ storage: online.storage, network: new Error('Offline') });
  assert.equal(await (await offline.request('?home=1', { navigate: true })).text(), 'new page');
  assert.equal(await (await offline.request('pricing/rates.json')).text(), '{"total":444.85}');
  assert.equal((await offline.message('GET_OFFLINE_STATUS')).ready, true);
});

test('si falta una tarifa en caché, rechaza datos de otra versión recibidos desde la red', async () => {
  const files = { 'index.html': 'old page', 'pricing/rates.json': '{"total":444.85}' };
  const original = await worker({ version: 'v1', files });
  await original.dispatch('install');
  const cache = await original.storage.open('mcb-tools-produccion-v1');
  cache.entries.delete(`${scope}pricing/rates.json`);
  const app = await worker({ version: 'v1', files, storage: original.storage,
    network: { 'index.html': 'new page', 'pricing/rates.json': '{"total":500}' } });
  await assert.rejects(app.request('pricing/rates.json'), /cambió|integridad/);
  assert.equal(await (await app.request(scope, { navigate: true })).text(), 'old page');
  assert.equal((await app.message('GET_OFFLINE_STATUS')).ready, false);
});

test('si falta una tarifa en caché, puede devolver la red solo cuando conserva el SHA de su versión', async () => {
  const app = await worker();
  await app.dispatch('install');
  const cache = await app.storage.open('mcb-tools-produccion-v2');
  cache.entries.delete(`${scope}pricing/rates.json`);
  assert.equal(await (await app.request('pricing/rates.json')).text(), '{"total":444.85}');
  assert.equal((await app.message('GET_OFFLINE_STATUS')).ready, false);
});

test('descarga incompleta o mezcla de versiones conserva la caché activa anterior', async () => {
  for (const network of [{ 'index.html': 'new page' }, { 'index.html': 'old CDN page', 'pricing/rates.json': '{"total":444.85}' }, new Error('Offline')]) {
    const storage = new MemoryStorage();
    await (await storage.open('mcb-tools-produccion-v1')).put(`${scope}index.html`, new Response('old page'));
    const app = await worker({ storage, network });
    await assert.rejects(app.dispatch('install'));
    assert.deepEqual(await storage.keys(), ['mcb-tools-produccion-v1']);
    assert.equal(await (await (await storage.open('mcb-tools-produccion-v1')).match(`${scope}index.html`)).text(), 'old page');
    assert.equal(app.state.skipped, 0);
  }
});

test('falta de almacenamiento elimina solo la candidata y conserva la versión activa', async () => {
  const storage = new MemoryStorage();
  await (await storage.open('mcb-tools-produccion-v1')).put(`${scope}index.html`, new Response('old page'));
  storage.failWrites = true;
  const app = await worker({ storage });
  await assert.rejects(app.dispatch('install'), /Quota/);
  assert.deepEqual(await storage.keys(), ['mcb-tools-produccion-v1']);
});

test('activación explícita limpia solo versiones propias y reclama clientes', async () => {
  const app = await worker();
  await app.storage.open('otra-app-v1');
  await app.storage.open('mcb-tools-produccion-v1');
  await app.dispatch('install');
  assert.equal((await app.message('ACTIVATE_UPDATE')).ready, true);
  assert.equal(app.state.skipped, 1);
  await app.dispatch('activate');
  assert.deepEqual((await app.storage.keys()).sort(), ['mcb-tools-produccion-v2', 'otra-app-v1']);
  assert.equal(app.state.claims, 1);
});

test('una candidata completa se puede activar sin red', async () => {
  const downloaded = await worker();
  await downloaded.dispatch('install');
  const offline = await worker({ storage: downloaded.storage, network: new Error('Offline') });
  assert.equal((await offline.message('ACTIVATE_UPDATE')).ready, true);
  assert.equal(offline.state.skipped, 1);
});

test('candidata incompleta sin red no activa; reparada en línea sí activa y conserva la activa hasta entonces', async () => {
  const storage = new MemoryStorage();
  await (await storage.open('mcb-tools-produccion-v1')).put(`${scope}index.html`, new Response('old page'));
  const downloaded = await worker({ storage });
  await downloaded.dispatch('install');
  (await storage.open('mcb-tools-produccion-v2')).entries.delete(`${scope}pricing/rates.json`);
  const offline = await worker({ storage, network: new Error('Offline') });
  const failed = await offline.message('ACTIVATE_UPDATE');
  assert.equal(failed.ready, false);
  assert.ok(failed.error);
  assert.equal(offline.state.skipped, 0);
  assert.equal(await (await (await storage.open('mcb-tools-produccion-v1')).match(`${scope}index.html`)).text(), 'old page');
  const repaired = await worker({ storage });
  assert.equal((await repaired.message('ACTIVATE_UPDATE')).ready, true);
  assert.equal(repaired.state.skipped, 1);
});

test('activate con candidata incompleta no elimina las copias anteriores ni reclama pestañas', async () => {
  const app = await worker();
  await app.storage.open('mcb-tools-produccion-v1');
  await app.dispatch('install');
  (await app.storage.open('mcb-tools-produccion-v2')).entries.delete(`${scope}pricing/rates.json`);
  await app.dispatch('activate');
  assert.ok((await app.storage.keys()).includes('mcb-tools-produccion-v1'));
  assert.equal(app.state.claims, 0);
});

test('no intercepta Drive, otras apps, rutas ajenas ni POST', async () => {
  const app = await worker();
  await app.dispatch('install');
  for (const [url, options] of [['https://drive.google.com/file/1', {}], ['https://mc-brokers.github.io/intranet/', { navigate: true }], ['not-a-page.html', { navigate: true }], ['index.html', { method: 'POST' }]]) {
    assert.equal(app.request(url, options), undefined);
  }
});

test('caché incompleta nunca informa listo y CACHE_OFFLINE la repara', async () => {
  const app = await worker();
  await app.dispatch('install');
  const cache = await app.storage.open('mcb-tools-produccion-v2');
  cache.entries.delete(`${scope}pricing/rates.json`);
  assert.equal((await app.message('GET_OFFLINE_STATUS')).ready, false);
  const repaired = await app.message('CACHE_OFFLINE');
  assert.equal(repaired.ready, true);
  assert.equal(await (await cache.match(`${scope}pricing/rates.json`)).text(), '{"total":444.85}');
});

test('reparación sin red informa error y no borra los recursos que sí existían', async () => {
  const original = await worker();
  await original.dispatch('install');
  const cache = await original.storage.open('mcb-tools-produccion-v2');
  cache.entries.delete(`${scope}pricing/rates.json`);
  const offline = await worker({ storage: original.storage, network: new Error('Offline') });
  const result = await offline.message('CACHE_OFFLINE');
  assert.equal(result.ready, false);
  assert.ok(result.error);
  assert.equal(await (await cache.match(`${scope}index.html`)).text(), 'new page');
});
