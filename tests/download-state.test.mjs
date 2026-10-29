import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { MessageChannel } from 'node:worker_threads';
import { test } from 'node:test';
import vm from 'node:vm';

class Element extends EventTarget {
  textContent = '';
  value = '';
  checked = false;
  disabled = false;
  hidden = false;
  open = false;
  dataset = {};
  showModal() { this.open = true; }
  close() { this.open = false; }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const complete = version => ({ ready: true, version, savedAt: '2026-10-29T16:00:00.000Z' });
const incomplete = version => ({ ready: false, version, savedAt: null });
async function settle() { for (let i = 0; i < 12; i++) await setImmediate(); }

function makeWorker({ status = incomplete('active'), firstStatus, repair } = {}) {
  const worker = new EventTarget();
  worker.state = 'activated';
  const messages = [];
  let reads = 0;
  worker.postMessage = (message, ports = []) => {
    messages.push(message.type);
    const response = message.type === 'CACHE_OFFLINE' && repair
      ? repair.promise : message.type === 'GET_OFFLINE_STATUS' && firstStatus && reads++ === 0
        ? firstStatus.promise : status;
    Promise.resolve(response).then(value => ports[0]?.postMessage(value));
  };
  return { worker, status, messages };
}

async function openApp({ ready = false, controlled = true, online = true, installing = false,
  firstStatus, repair, update } = {}) {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('    // MODO SIN CONEXION');
  const end = html.indexOf('    // FIN MODO SIN CONEXION');
  assert.ok(start >= 0 && end > start, 'Debe ejecutarse el fragmento real del modo sin conexión');
  const ids = ['connection-status', 'connection-label', 'offline-summary', 'download-title', 'download-message',
    'download-progress', 'offline-info', 'offline-close', 'offline-state', 'offline-detail',
    'offline-check', 'offline-update', 'offline-reload', 'offline-update-description', 'install-info',
    'cliente', 'producto', 'plan', 'vigencia', 'genero', 'edad', 'extraprima', 'pago-mixto',
    'vt-genero', 'vt-condicion', 'vt-edad', 'vt-sa'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
  nodes['download-progress'].hidden = true;
  const active = makeWorker({ status: ready ? complete('active') : incomplete('active'), firstStatus, repair });
  const candidate = makeWorker({ status: incomplete('candidate') });
  candidate.worker.state = 'installing';
  const registration = new EventTarget();
  Object.assign(registration, {
    scope: 'https://example.test/tools_produccion/',
    active: controlled ? active.worker : null,
    waiting: null,
    installing: installing ? candidate.worker : null,
    update: async () => { if (update) await update.promise; }
  });
  const serviceWorker = new EventTarget();
  Object.assign(serviceWorker, {
    controller: controlled ? active.worker : null,
    getRegistration: async () => registration,
    register: async () => registration
  });
  const document = new EventTarget();
  Object.assign(document, { visibilityState: 'visible', getElementById: id => nodes[id] || null });
  const window = new EventTarget();
  let reloads = 0;
  Object.assign(window, { isSecureContext: true,
    location: { href: 'https://example.test/tools_produccion/', reload: () => { reloads++; } } });
  const navigator = { serviceWorker, onLine: online };
  const context = vm.createContext({ window, document, navigator, URL, Date, MessageChannel,
    setTimeout, clearTimeout, setInterval: () => 1,
    sessionStorage: { getItem: () => null, removeItem: () => {}, setItem: () => {} },
    toggleProductoYPlan: () => {}, normalizarPlanStrm: () => {}, actualizarAvisoVigencia: () => {} });
  vm.runInContext(html.slice(start, end), context);
  const started = context.iniciarModoSinConexion();
  await settle();
  return { nodes, active, candidate, registration, serviceWorker, window, navigator, started,
    reloads: () => reloads };
}

const summaryText = app => ['download-title', 'download-message', 'offline-state', 'offline-detail']
  .map(id => app.nodes[id].textContent).join(' ');

test('tener red no concede una copia y las etiquetas de conexión están en español', async () => {
  const app = await openApp();
  await app.started;
  assert.equal(app.nodes['connection-label'].textContent, 'Con conexión');
  assert.equal(app.nodes['offline-summary'].dataset.state, 'missing');
  assert.equal(app.nodes['download-progress'].hidden, true);
  assert.doesNotMatch(app.nodes['download-title'].textContent, /Disponible sin conexión/);
  app.navigator.onLine = false;
  app.window.dispatchEvent(new Event('offline'));
  await settle();
  assert.equal(app.nodes['connection-label'].textContent, 'Sin conexión');
  assert.equal(app.nodes['offline-summary'].dataset.state, 'missing');
});

test('la primera instalación pendiente muestra descarga sin anunciar disponibilidad', async () => {
  const app = await openApp({ controlled: false, installing: true });
  await app.started;
  assert.equal(app.nodes['offline-summary'].dataset.state, 'downloading');
  assert.equal(app.nodes['download-progress'].hidden, false);
  assert.match(summaryText(app), /Descargando/i);
  assert.match(summaryText(app), /No cierres/i);
  assert.equal(app.nodes['offline-update'].open, false);
});

test('el estado permanece disponible para abrir detalles mientras la descarga continúa', async () => {
  const app = await openApp({ controlled: false, installing: true });
  await app.started;
  assert.equal(app.nodes['offline-summary'].disabled, false);
  app.nodes['offline-summary'].click();
  await settle();
  assert.equal(app.nodes['offline-info'].open, true);
  assert.equal(app.nodes['offline-summary'].dataset.state, 'downloading');
  assert.equal(app.nodes['download-progress'].hidden, false);
  assert.match(app.nodes['offline-state'].textContent, /Descargando/i);
  assert.doesNotMatch(app.nodes['download-title'].textContent, /Disponible sin conexión/);
});

test('la candidata en descarga tiene prioridad aunque la copia activa esté completa', async () => {
  const app = await openApp({ ready: true, installing: true });
  await app.started;
  assert.equal(app.nodes['offline-summary'].dataset.state, 'downloading');
  assert.equal(app.nodes['download-progress'].hidden, false);
  assert.doesNotMatch(app.nodes['download-title'].textContent, /Disponible sin conexión/);
  assert.equal(app.nodes['offline-update'].open, false);
});

test('una candidata fallida conserva la copia anterior y explica el fallo sin modal', async () => {
  const app = await openApp({ ready: true, installing: true });
  await app.started;
  app.registration.installing = null;
  app.candidate.worker.state = 'redundant';
  app.candidate.worker.dispatchEvent(new Event('statechange'));
  await settle();
  assert.equal(app.nodes['offline-summary'].dataset.state, 'warning');
  assert.equal(app.nodes['download-progress'].hidden, true);
  assert.match(summaryText(app), /anterior|guardada|conserva/i);
  assert.match(summaryText(app), /No se pudo|No se completó|fall/i);
  assert.equal(app.nodes['offline-update'].open, false);
});

test('la reparación pendiente muestra progreso y sólo su respuesta completa permite listo', async () => {
  const repair = deferred();
  const app = await openApp({ repair });
  await app.started;
  app.nodes['connection-status'].click();
  assert.equal(app.nodes['offline-info'].open, true);
  app.nodes['offline-check'].click();
  await settle();
  assert.ok(app.active.messages.includes('CACHE_OFFLINE'));
  const during = { state: app.nodes['offline-summary'].dataset.state, hidden: app.nodes['download-progress'].hidden,
    modalTitle: app.nodes['offline-state'].textContent };
  Object.assign(app.active.status, complete('active'));
  repair.resolve(complete('active'));
  await settle();
  assert.equal(during.state, 'downloading');
  assert.equal(during.hidden, false);
  assert.match(during.modalTitle, /Descargando/i);
  assert.equal(app.nodes['offline-summary'].dataset.state, 'ready');
  assert.equal(app.nodes['download-progress'].hidden, true);
  assert.match(summaryText(app), /Disponible sin conexión/);
  assert.match(app.nodes['offline-state'].textContent, /Disponible sin conexión/);
  assert.equal(app.nodes['offline-info'].open, true);
});

test('la reparación fallida retira el progreso y no presenta éxito', async () => {
  const repair = deferred();
  const app = await openApp({ repair });
  await app.started;
  app.nodes['offline-check'].click();
  await settle();
  const during = app.nodes['offline-summary'].dataset.state;
  repair.resolve({ ...incomplete('active'), error: 'Falta espacio' });
  await settle();
  assert.equal(during, 'downloading');
  assert.equal(app.nodes['offline-summary'].dataset.state, 'error');
  assert.equal(app.nodes['download-progress'].hidden, true);
  assert.doesNotMatch(app.nodes['download-title'].textContent, /Disponible sin conexión/);
  assert.match(summaryText(app), /No se pudo|No se completó|Falta/i);
});

test('una respuesta vieja del controlador anterior no anuncia listo tras cambiar de controlador', async () => {
  const firstStatus = deferred();
  const app = await openApp({ firstStatus });
  assert.ok(app.active.messages.includes('GET_OFFLINE_STATUS'));
  const replacement = makeWorker({ status: incomplete('replacement') });
  app.serviceWorker.controller = replacement.worker;
  app.registration.active = replacement.worker;
  app.serviceWorker.dispatchEvent(new Event('controllerchange'));
  firstStatus.resolve(complete('active'));
  await app.started;
  await settle();
  assert.equal(app.reloads(), 1);
  assert.ok(['checking', 'missing', 'error'].includes(app.nodes['offline-summary'].dataset.state));
  for (const id of ['download-title', 'offline-state']) {
    assert.doesNotMatch(app.nodes[id].textContent, /Disponible sin conexión/);
  }
});

test('buscar novedades no se representa como una descarga de datos', async () => {
  const update = deferred();
  const app = await openApp({ ready: true, update });
  const during = { state: app.nodes['offline-summary'].dataset.state, hidden: app.nodes['download-progress'].hidden };
  update.resolve();
  await app.started;
  assert.deepEqual(during, { state: 'checking', hidden: true });
  assert.equal(app.nodes['offline-summary'].dataset.state, 'ready');
  assert.equal(app.nodes['download-progress'].hidden, true);
});

test('el estado abre el detalle y sólo la acción interior reintenta con una copia anterior', async () => {
  const app = await openApp({ ready: true, installing: true });
  await app.started;
  app.registration.installing = null;
  app.candidate.worker.state = 'redundant';
  app.candidate.worker.dispatchEvent(new Event('statechange'));
  await settle();
  assert.equal(app.nodes['offline-summary'].dataset.state, 'warning');
  let updates = 0;
  app.registration.update = async () => { updates++; };
  app.nodes['offline-summary'].click();
  await settle();
  assert.equal(app.nodes['offline-info'].open, true);
  assert.equal(updates, 0);
  app.nodes['offline-check'].click();
  await settle();
  assert.equal(updates, 1);
  assert.equal(app.nodes['offline-info'].open, true);
  assert.equal(app.nodes['offline-summary'].dataset.state, 'ready');
});

test('si activar falla, el aviso sigue abierto sin anunciar que la candidata está descargada', async () => {
  const app = await openApp({ ready: true });
  await app.started;
  Object.assign(app.candidate.status, complete('candidate'));
  app.candidate.worker.state = 'installed';
  app.registration.waiting = app.candidate.worker;
  app.window.dispatchEvent(new Event('focus'));
  await settle();
  assert.equal(app.nodes['offline-update'].open, true);
  assert.equal(app.nodes['offline-summary'].dataset.state, 'update');
  Object.assign(app.candidate.status, incomplete('candidate'), { error: 'Falta espacio' });
  app.nodes['offline-reload'].click();
  await settle();
  assert.equal(app.nodes['offline-update'].open, true);
  assert.equal(app.nodes['offline-summary'].dataset.state, 'warning');
  assert.equal(app.nodes['download-progress'].hidden, true);
  assert.doesNotMatch(app.nodes['download-title'].textContent, /Actualización descargada/);
  assert.match(app.nodes['offline-update-description'].textContent, /No se pudo completar/);
  assert.equal(app.nodes['offline-reload'].disabled, false);
});
