import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

async function openQuotes() {
  const source = await readFile(new URL('../assets/app-ui.js', import.meta.url), 'utf8');
  const start = source.indexOf("for (const prefix of ['', 'vt-']) {");
  const end = source.indexOf('\n// FIN PRESENTACION COTIZACIONES', start);
  assert.ok(start >= 0 && end > start, 'Debe poder ejecutarse el bloque real de presentación de cotizaciones');
  const pendingObservers = new Set();

  class Element {
    value = '';
    hidden = false;
    textContent = '';
    listeners = new Map();
    observers = new Set();
    options = {};
    constructor() {
      this.style = new Proxy({ display: 'none' }, {
        set: (style, name, value) => {
          if (style[name] !== value) {
            style[name] = value;
            for (const callback of this.observers) pendingObservers.add(callback);
          }
          return true;
        }
      });
    }
    get selectedOptions() { return [{ textContent: this.options[this.value] || this.value }]; }
    querySelector() { return this.paragraph ||= new Element(); }
    addEventListener(type, callback, options) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push({ callback, capture: options === true || options?.capture === true });
    }
    dispatchEvent(event) {
      const listeners = this.listeners.get(event.type) || [];
      for (const capture of [true, false]) for (const listener of listeners) {
        if (listener.capture === capture) listener.callback(event);
      }
    }
    click() { this.dispatchEvent(new Event('click')); }
  }

  const ids = ['cliente', 'producto', 'plan', 'vigencia', 'genero', 'edad', 'extraprima', 'pago-mixto',
    'vt-genero', 'vt-condicion', 'vt-edad', 'vt-sa'];
  for (const prefix of ['', 'vt-']) for (const suffix of ['result-original', 'result-adjusted',
    'result-mixto', 'meses-wrap', 'quote-empty', 'quote-context', 'btn-consultar']) ids.push(prefix + suffix);
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
  for (const [id, value] of Object.entries({ cliente: 'STRM', producto: 'EXCESOS', plan: 'T1',
    vigencia: '2026-2027', genero: 'H', edad: '25', extraprima: '0',
    'vt-genero': 'H', 'vt-condicion': 'NFE', 'vt-edad': '35', 'vt-sa': '500000' })) nodes[id].value = value;
  nodes['pago-mixto'].checked = false;
  nodes.producto.options = { EXCESOS: 'Excesos', LINEA_AZUL: 'Línea Azul' };
  nodes.vigencia.options = { '2026-2027': '2026 – 2027', '2025-2026': '2025 – 2026' };
  // Existing calculator handlers precede the presentation module in the page.
  for (const prefix of ['', 'vt-']) nodes[prefix + 'btn-consultar'].addEventListener('click', () => {
    nodes[prefix + 'result-original'].style.display = 'none';
  });
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe(element) { element.observers.add(this.callback); }
  }
  vm.runInContext(source.slice(start, end), vm.createContext({
    document: { getElementById: id => nodes[id] || null }, MutationObserver
  }));

  function flush() {
    let rounds = 0;
    while (pendingObservers.size) {
      assert.ok(++rounds < 20, 'Los observadores deben estabilizar la presentación');
      const callbacks = [...pendingObservers];
      pendingObservers.clear();
      for (const callback of callbacks) callback();
    }
  }
  function respond(prefix = '') {
    nodes[prefix + 'result-original'].style.display = '';
    flush();
  }
  function edit(id, value, event = 'input') {
    nodes[id].value = value;
    nodes[id].dispatchEvent(new Event(event));
    flush();
  }
  return { nodes, respond, edit, flush };
}

test('la respuesta inicial muestra el resultado con el contexto de los valores realmente consultados', async () => {
  const app = await openQuotes();
  app.respond();
  assert.equal(app.nodes['result-original'].style.display, '');
  assert.equal(app.nodes['quote-context'].textContent, 'STRM / Excesos · T1 / 2026 – 2027');
  assert.equal(app.nodes['quote-empty'].hidden, true);
});

test('un cambio durante la espera impide mostrar la respuesta anterior con una nueva vigencia', async () => {
  const app = await openQuotes();
  app.nodes['btn-consultar'].click();
  app.flush();
  app.edit('vigencia', '2025-2026', 'change');
  app.respond();
  assert.equal(app.nodes['result-original'].style.display, 'none');
  assert.equal(app.nodes['quote-context'].textContent, '');
  assert.equal(app.nodes['quote-empty'].hidden, false);
  assert.match(app.nodes['quote-empty'].querySelector('p').textContent, /Consulta de nuevo/);
});

test('una nueva consulta acepta la selección actual después de descartar la respuesta tardía', async () => {
  const app = await openQuotes();
  app.nodes['btn-consultar'].click();
  app.edit('plan', 'T2', 'change');
  app.respond();
  assert.equal(app.nodes['result-original'].style.display, 'none');
  app.nodes['btn-consultar'].click();
  app.flush();
  app.respond();
  assert.equal(app.nodes['result-original'].style.display, '');
  assert.equal(app.nodes['quote-context'].textContent, 'STRM / Excesos · T2 / 2026 – 2027');
  assert.equal(app.nodes['quote-empty'].hidden, true);
});

test('editar una cotización visible oculta todas sus vistas y retira los metadatos previos', async () => {
  for (const [prefix, field, value, event] of [
    ['', 'edad', '47', 'input'], ['', 'genero', 'M', 'change'],
    ['vt-', 'vt-sa', '700000', 'input'], ['vt-', 'vt-condicion', 'FE', 'change']
  ]) {
    const app = await openQuotes();
    app.nodes[prefix + 'btn-consultar'].click();
    app.respond(prefix);
    for (const name of ['result-adjusted', 'result-mixto', 'meses-wrap']) app.nodes[prefix + name].style.display = '';
    app.edit(field, value, event);
    for (const name of ['result-original', 'result-adjusted', 'result-mixto', 'meses-wrap'])
      assert.equal(app.nodes[prefix + name].style.display, 'none', prefix + name);
    assert.equal(app.nodes[prefix + 'quote-context'].textContent, '');
    assert.equal(app.nodes[prefix + 'quote-empty'].hidden, false);
  }
});

test('VidaTotal también rechaza una respuesta pendiente tras cambiar la suma y acepta recalcular', async () => {
  const app = await openQuotes();
  app.nodes['vt-btn-consultar'].click();
  app.edit('vt-sa', '700000');
  app.respond('vt-');
  assert.equal(app.nodes['vt-result-original'].style.display, 'none');
  assert.equal(app.nodes['vt-quote-context'].textContent, '');
  app.nodes['vt-btn-consultar'].click();
  app.respond('vt-');
  assert.equal(app.nodes['vt-result-original'].style.display, '');
  assert.equal(app.nodes['vt-quote-context'].textContent, 'STRM · VidaTotal');
});
