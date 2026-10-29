import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import vm from 'node:vm';

class Element extends EventTarget {
  textContent = '';
  value = '';
  hidden = false;
  disabled = false;
  open = false;
  children = [];
  replaceChildren(...children) { this.children = children; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}

async function settle() { for (let i = 0; i < 5; i++) await setImmediate(); }

async function openDevice({ userAgent = 'Desktop', maxTouchPoints = 0, standalone = false,
  secure = true, storage, mediaStandalone = false, viewport = 1440, share } = {}) {
  const source = await readFile(new URL('../assets/prepare-device.js', import.meta.url), 'utf8')
    .catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  const nodes = Object.fromEntries(['install-open', 'install-info', 'install-close', 'install-platform',
    'install-steps', 'install-native', 'install-state', 'persistence-state', 'persistence-detail',
    'persistence-request', 'offline-update'].map(id => [id, new Element()]));
  nodes['install-open'].hidden = true;
  nodes['install-native'].hidden = true;
  const window = new EventTarget();
  Object.assign(window, { isSecureContext: secure, innerWidth: viewport,
    matchMedia: query => ({ matches: query.includes('display-mode') ? mediaStandalone
      : /max-width:\s*(\d+)px/.test(query) ? viewport <= Number(query.match(/max-width:\s*(\d+)px/)[1]) : false }) });
  const document = new EventTarget();
  Object.assign(document, { readyState: 'complete', getElementById: id => nodes[id], createElement: () => new Element() });
  const navigator = { userAgent, maxTouchPoints, standalone, storage, share };
  vm.runInContext(source, vm.createContext({ window, document, navigator }));
  await settle();
  return { nodes, window };
}

function installOffer({ outcome = 'accepted', fail = false } = {}) {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  let prompts = 0;
  event.prompt = async () => { prompts++; if (fail) throw new Error('prompt unavailable'); };
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return { event, prompts: () => prompts };
}

test('la ayuda detecta iPhone, iPad con identidad Mac, Android y computadora', async () => {
  for (const [options, platform] of [
    [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)' }, 'ios'],
    [{ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' }, 'ios'],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', maxTouchPoints: 5 }, 'ios'],
    [{ userAgent: 'Mozilla/5.0 (Linux; Android 16)' }, 'android'],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)' }, 'desktop']
  ]) {
    const { nodes } = await openDevice(options);
    assert.equal(nodes['install-platform'].value, platform);
    assert.equal(nodes['install-open'].hidden, platform === 'desktop');
    assert.ok(nodes['install-steps'].children.length >= 2);
  }
});

test('una computadora de ventana estrecha mantiene oculto el acceso y no puede abrir su ayuda', async () => {
  const { nodes, window } = await openDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', viewport: 390 });
  assert.equal(nodes['install-open'].hidden, true);
  nodes['install-open'].click();
  assert.equal(nodes['install-info'].open, false);
  const offer = installOffer();
  window.dispatchEvent(offer.event);
  assert.equal(nodes['install-native'].hidden, true);
  nodes['install-native'].click();
  await settle();
  assert.equal(offer.prompts(), 0);
});

test('iPhone, Android e iPad con identidad Mac muestran el acceso incluso con viewport ancho', async () => {
  for (const device of [
    { userAgent: 'iPhone' },
    { userAgent: 'Android 16' },
    { userAgent: 'Macintosh; Intel Mac OS X 10_15', maxTouchPoints: 5 }
  ]) {
    const { nodes } = await openDevice({ ...device, viewport: 1440 });
    assert.equal(nodes['install-open'].hidden, false);
    nodes['install-open'].click();
    assert.equal(nodes['install-info'].open, true);
  }
});

test('la ayuda de iPhone incluye compartir, agregar a inicio y abrir como app web', async () => {
  const { nodes } = await openDevice({ userAgent: 'iPhone' });
  const steps = nodes['install-steps'].children.map(node => node.textContent).join(' ');
  assert.match(steps, /Safari/);
  assert.match(steps, /Compartir/);
  assert.match(steps, /pantalla de inicio/);
  assert.match(steps, /Abrir como app web/);
  nodes['install-platform'].value = 'android';
  nodes['install-platform'].dispatchEvent(new Event('change'));
  assert.match(nodes['install-steps'].children.map(node => node.textContent).join(' '), /Chrome/);
});

test('la ayuda abre y cierra, pero respeta una actualización obligatoria abierta', async () => {
  const { nodes } = await openDevice({ userAgent: 'Android' });
  nodes['install-open'].click();
  assert.equal(nodes['install-info'].open, true);
  nodes['install-close'].click();
  assert.equal(nodes['install-info'].open, false);
  nodes['offline-update'].open = true;
  nodes['install-open'].click();
  assert.equal(nodes['install-info'].open, false);
});

test('Agregar al inicio en Android usa la oferta real desde el mismo clic y sólo una vez', async () => {
  const { nodes, window } = await openDevice({ userAgent: 'Android' });
  nodes['install-platform'].value = 'ios';
  nodes['install-platform'].dispatchEvent(new Event('change'));
  const offer = installOffer();
  window.dispatchEvent(offer.event);
  nodes['install-open'].click();
  assert.equal(offer.prompts(), 1, 'El prompt debe iniciarse antes de cualquier espera asíncrona');
  assert.equal(nodes['install-info'].open, false);
  await settle();
  assert.match(nodes['install-state'].textContent, /aceptada/);
  assert.doesNotMatch(nodes['install-state'].textContent, /confirmada|instalada/);
  nodes['install-native'].click();
  nodes['install-open'].click();
  await settle();
  assert.equal(offer.prompts(), 1);
  window.dispatchEvent(new Event('appinstalled'));
  assert.match(nodes['install-state'].textContent, /confirmada/);
});

test('iPhone y Android sin oferta abren la guía sin sustituir agregar por compartir enlace', async () => {
  for (const userAgent of ['iPhone', 'Android']) {
    let shares = 0;
    const { nodes } = await openDevice({ userAgent, share: async () => { shares++; } });
    nodes['install-open'].click();
    await settle();
    assert.equal(nodes['install-info'].open, true);
    assert.equal(nodes['install-native'].hidden, true);
    assert.equal(shares, 0);
  }
});

test('el aviso obligatorio bloquea el prompt del botón principal sin consumir la oferta', async () => {
  const { nodes, window } = await openDevice({ userAgent: 'Android' });
  const offer = installOffer();
  window.dispatchEvent(offer.event);
  nodes['offline-update'].open = true;
  nodes['install-open'].click();
  await settle();
  assert.equal(offer.prompts(), 0);
  assert.equal(nodes['install-info'].open, false);
  nodes['offline-update'].open = false;
  nodes['install-open'].click();
  assert.equal(offer.prompts(), 1);
  await settle();
});

test('sólo una oferta real habilita el prompt y aceptar no confirma instalación', async () => {
  const { nodes, window } = await openDevice({ userAgent: 'Android' });
  assert.equal(nodes['install-native'].hidden, true);
  const offer = installOffer();
  window.dispatchEvent(offer.event);
  assert.equal(offer.event.defaultPrevented, true);
  assert.equal(nodes['install-native'].hidden, false);
  assert.equal(offer.prompts(), 0);
  nodes['install-native'].click();
  await settle();
  assert.equal(offer.prompts(), 1);
  assert.match(nodes['install-state'].textContent, /aceptada/);
  assert.doesNotMatch(nodes['install-state'].textContent, /confirmada|instalada/);
  nodes['install-native'].click();
  await settle();
  assert.equal(offer.prompts(), 1);
  window.dispatchEvent(new Event('appinstalled'));
  assert.match(nodes['install-state'].textContent, /confirmada/);
  assert.equal(nodes['install-native'].hidden, true);
});

test('el prompt nativo tampoco se abre sobre una actualización obligatoria', async () => {
  const { nodes, window } = await openDevice({ userAgent: 'Android' });
  const offer = installOffer();
  window.dispatchEvent(offer.event);
  nodes['offline-update'].open = true;
  nodes['install-native'].click();
  await settle();
  assert.equal(offer.prompts(), 0);
});

test('cerrar o fallar el prompt no declara que la aplicación esté instalada', async () => {
  for (const options of [{ outcome: 'dismissed' }, { fail: true }]) {
    const { nodes, window } = await openDevice({ userAgent: 'Android' });
    const offer = installOffer(options);
    window.dispatchEvent(offer.event);
    nodes['install-native'].click();
    await settle();
    assert.doesNotMatch(nodes['install-state'].textContent, /confirmada|instalada/);
    assert.equal(nodes['install-native'].hidden, true);
    assert.match(nodes['install-state'].textContent, options.fail ? /No se pudo/ : /menú/);
  }
});

test('una ventana standalone reconoce el contexto sin volver a ofrecer instalar', async () => {
  for (const options of [{ userAgent: 'iPhone', standalone: true }, { userAgent: 'Android', mediaStandalone: true }]) {
    const { nodes, window } = await openDevice(options);
    assert.match(nodes['install-state'].textContent, /desde el ícono/);
    const offer = installOffer();
    window.dispatchEvent(offer.event);
    assert.equal(nodes['install-native'].hidden, true);
  }
});

test('persisted verdadero muestra concesión sin solicitar otro permiso', async () => {
  let requests = 0;
  const { nodes } = await openDevice({ storage: {
    persisted: async () => true, persist: async () => { requests++; return true; }
  } });
  assert.equal(nodes['persistence-state'].textContent, 'Concedida');
  assert.equal(nodes['persistence-request'].disabled, true);
  assert.equal(requests, 0);
});

test('persisted falso no se interpreta como rechazo y persist falso muestra la respuesta real', async () => {
  let requests = 0;
  const { nodes } = await openDevice({ storage: {
    persisted: async () => false, persist: async () => { requests++; return false; }
  } });
  assert.equal(nodes['persistence-state'].textContent, 'Sin protección concedida');
  assert.equal(requests, 0);
  nodes['persistence-request'].click();
  await settle();
  assert.equal(requests, 1);
  assert.equal(nodes['persistence-state'].textContent, 'No concedida');
  assert.doesNotMatch(nodes['persistence-detail'].textContent, /rechazaste|denegaste/i);
  assert.equal(nodes['persistence-request'].disabled, false);
});

test('persist verdadero sólo concede protección después de la solicitud', async () => {
  const { nodes } = await openDevice({ storage: { persisted: async () => false, persist: async () => true } });
  assert.equal(nodes['persistence-state'].textContent, 'Sin protección concedida');
  nodes['persistence-request'].click();
  await settle();
  assert.equal(nodes['persistence-state'].textContent, 'Concedida');
  assert.equal(nodes['persistence-request'].disabled, true);
});

test('sin API o contexto seguro se informa no disponible sin intentar persistencia', async () => {
  for (const options of [{}, { secure: false, storage: {
    persisted: async () => { throw new Error('No debe consultarse'); },
    persist: async () => { throw new Error('No debe solicitarse'); }
  } }]) {
    const { nodes } = await openDevice(options);
    assert.equal(nodes['persistence-state'].textContent, 'No disponible');
    assert.equal(nodes['persistence-request'].disabled, true);
  }
});

test('un error al comprobar o solicitar no se convierte en concesión ni bloqueo permanente', async () => {
  const { nodes } = await openDevice({ storage: {
    persisted: async () => { throw new Error('storage disabled'); },
    persist: async () => { throw new Error('storage disabled'); }
  } });
  assert.equal(nodes['persistence-state'].textContent, 'No se pudo comprobar');
  assert.equal(nodes['persistence-request'].disabled, false);
  nodes['persistence-request'].click();
  await settle();
  assert.equal(nodes['persistence-state'].textContent, 'No se pudo solicitar');
  assert.equal(nodes['persistence-request'].disabled, false);
});
