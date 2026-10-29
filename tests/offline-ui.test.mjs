import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MessageChannel } from 'node:worker_threads';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';

class Element extends EventTarget {
  textContent = '';
  disabled = false;
  open = false;
  value = '';
  checked = false;
  showModal() { this.open = true; }
  click() { this.dispatchEvent(new Event('click')); }
}

async function openApp({ ready = true, waiting = false, candidateReady = true, controlled = true, registerError = false, updateError = false, saved = null } = {}) {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('    // MODO SIN CONEXION');
  const end = html.indexOf('    // FIN MODO SIN CONEXION');
  assert.ok(start >= 0 && end > start, 'La herramienta debe implementar el modo sin conexión');
  const nodes = Object.fromEntries(['offline-state', 'offline-detail', 'offline-check', 'offline-update', 'offline-reload', 'offline-update-description',
    'cliente', 'producto', 'plan', 'vigencia', 'genero', 'edad', 'extraprima', 'pago-mixto',
    'vt-genero', 'vt-condicion', 'vt-edad', 'vt-sa'].map(id => [id, new Element()]));
  nodes.edad.value = '25';
  const status = { ready, version: 'version-a', savedAt: ready ? '2026-10-29T15:00:00.000Z' : null };
  const messages = [];
  const worker = new EventTarget();
  worker.state = 'activated';
  worker.postMessage = (message, ports = []) => {
    messages.push(message.type);
    ports[0]?.postMessage(status);
  };
  const candidate = new EventTarget();
  const candidateStatus = { ...status, ready: candidateReady };
  candidate.postMessage = (message, ports = []) => { messages.push(message.type); ports[0]?.postMessage(candidateStatus); };
  const registration = new EventTarget();
  Object.assign(registration, { scope: 'https://example.test/tools_produccion/', active: worker,
    waiting: waiting ? candidate : null, installing: null, update: async () => { if (updateError) throw new Error('network'); } });
  const serviceWorker = new EventTarget();
  Object.assign(serviceWorker, { controller: controlled ? worker : null,
    getRegistration: async () => registerError ? undefined : registration,
    register: async () => { if (registerError) throw new Error('offline'); return registration; } });
  const storage = new Map(saved ? [['mcb-tools-quote-inputs', JSON.stringify(saved)]] : []);
  const document = new EventTarget();
  Object.assign(document, { visibilityState: 'visible', getElementById: id => nodes[id] || null });
  const window = new EventTarget();
  let reloads = 0;
  Object.assign(window, { isSecureContext: true, location: { href: 'https://example.test/tools_produccion/', reload: () => reloads++ } });
  const context = vm.createContext({ window, document, navigator: { serviceWorker, onLine: true },
    URL, Date, Event, MessageChannel, setTimeout, clearTimeout, setInterval: () => 1,
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    toggleProductoYPlan: () => {}, toggleTraspasoRM: () => {}, actualizarAvisoVigencia: () => {} });
  vm.runInContext(html.slice(start, end), context);
  await context.iniciarModoSinConexion();
  return { nodes, status, candidateStatus, messages, serviceWorker, worker, registration, storage, reloads: () => reloads };
}

test('confirma disponibilidad solo cuando la copia completa fue verificada', async () => {
  const app = await openApp();
  assert.match(app.nodes['offline-state'].textContent, /Disponible sin conexión/);
  assert.match(app.nodes['offline-detail'].textContent, /Última descarga/);
  assert.ok(app.messages.includes('GET_OFFLINE_STATUS'));
  const incomplete = await openApp({ ready: false });
  assert.doesNotMatch(incomplete.nodes['offline-state'].textContent, /Disponible sin conexión/);
  assert.match(incomplete.nodes['offline-check'].textContent, /Guardar/);
});

test('actualización descargada exige recarga y no permite cerrar con Escape', async () => {
  const app = await openApp({ waiting: true });
  assert.equal(app.nodes['offline-update'].open, true);
  const cancel = new Event('cancel', { cancelable: true });
  app.nodes['offline-update'].dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  app.nodes['offline-reload'].click();
  assert.ok(app.messages.includes('ACTIVATE_UPDATE'));
  assert.equal(app.nodes['offline-reload'].disabled, true);
});

test('recarga una sola vez ante cambio de versión y conserva las entradas de cotización', async () => {
  const app = await openApp();
  app.nodes.edad.value = '47';
  app.nodes['pago-mixto'].checked = true;
  app.serviceWorker.controller = {};
  app.serviceWorker.dispatchEvent(new Event('controllerchange'));
  app.serviceWorker.dispatchEvent(new Event('controllerchange'));
  assert.equal(app.reloads(), 1);
  const inputs = JSON.parse(app.storage.get('mcb-tools-quote-inputs'));
  assert.equal(inputs.edad.value, '47');
  assert.equal(inputs['pago-mixto'].checked, true);
});

test('primera instalación no reinicia una cotización abierta', async () => {
  const app = await openApp({ controlled: false });
  app.serviceWorker.controller = app.worker;
  app.serviceWorker.dispatchEvent(new Event('controllerchange'));
  assert.equal(app.reloads(), 0);
});

test('recupera entradas una vez sin reutilizar resultados de primas anteriores', async () => {
  const app = await openApp({ saved: { edad: { value: '53', checked: false }, 'total-original': { value: '9999' } } });
  assert.equal(app.nodes.edad.value, '53');
  assert.equal(app.storage.has('mcb-tools-quote-inputs'), false);
});

test('fallo de registro no anuncia que el equipo esté listo para trabajar offline', async () => {
  const app = await openApp({ registerError: true, controlled: false });
  assert.doesNotMatch(app.nodes['offline-state'].textContent, /Disponible sin conexión/);
  assert.equal(app.nodes['offline-check'].disabled, false);
});

test('sin acceso al servidor conserva una indicación clara de que se puede usar la copia existente', async () => {
  const app = await openApp({ updateError: true });
  assert.match(app.nodes['offline-state'].textContent, /Disponible sin conexión/);
  assert.match(app.nodes['offline-detail'].textContent, /Puedes seguir usando la copia guardada/);
});

test('no exige recarga si la copia candidata perdió recursos', async () => {
  const app = await openApp({ waiting: true, candidateReady: false });
  assert.equal(app.nodes['offline-update'].open, false);
});

test('permite reintentar si la candidata pierde recursos después de mostrar el aviso', async () => {
  const app = await openApp({ waiting: true });
  app.candidateStatus.ready = false;
  app.nodes['offline-reload'].click();
  for (let i = 0; i < 10; i++) await setImmediate();
  assert.equal(app.reloads(), 0);
  assert.equal(app.nodes['offline-reload'].disabled, false);
  assert.match(app.nodes['offline-update-description'].textContent, /No se pudo completar/);
});
