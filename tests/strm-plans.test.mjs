import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const periods = ['2025-2026', '2026-2027'];
const products = { LINEA_AZUL: 'strm', EXCESOS: 'strm-excesos' };

function functionSource(html, name) {
  const start = html.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.ok(start >= 0, `Debe existir la función real ${name}`);
  const end = html.indexOf('\n    }', start);
  assert.ok(end > start, `No se encontró el cierre de ${name}`);
  return html.slice(start, end + '\n    }'.length);
}

async function pricingApp({ initialPlan = 'T1', normalize = false } = {}) {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const select = html.match(/<select\b[^>]*\bid="plan"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(select, 'Debe existir el selector de plan STRM');
  const options = [...select[1].matchAll(/<option\b[^>]*\bvalue="([^"]+)"/g)].map(match => match[1]);
  let planValue = options.includes(initialPlan) ? initialPlan : '';
  const plan = {
    get value() { return planValue; },
    set value(value) { planValue = options.includes(value) ? value : ''; }
  };
  const requests = [];
  const context = vm.createContext({
    document: { querySelector: selector => { assert.equal(selector, '#plan'); return plan; } },
    fetch: async url => {
      requests.push(url);
      const pricing = JSON.parse(await readFile(new URL(`../${url}`, import.meta.url), 'utf8'));
      return { ok: true, json: async () => pricing };
    }
  });
  const start = html.indexOf('    const PERIODOS_DISPONIBLES =');
  const end = html.indexOf('    function describeFetchError', start);
  assert.ok(start >= 0 && end > start, 'Deben existir las funciones reales de carga de tarifas');
  vm.runInContext(html.slice(start, end), context);
  if (normalize) vm.runInContext(functionSource(html, 'normalizarPlanStrm'), context);
  return { options, plan, requests, context };
}

test('el selector STRM ofrece únicamente T1 y T2', async () => {
  const app = await pricingApp();
  assert.deepEqual(app.options, ['T1', 'T2']);
});

test('el catálogo operativo y sus rutas excluyen Traspaso Respaldo Médico', async () => {
  const { context } = await pricingApp();
  const catalog = JSON.parse(vm.runInContext('JSON.stringify(PERIODOS_DISPONIBLES)', context));
  assert.deepEqual(Object.keys(catalog).sort(), ['BIMBO', 'STRM_EXCESOS', 'STRM_LINEA_AZUL']);
  for (const period of periods) {
    const paths = context.getJsonPaths(period);
    assert.deepEqual(Object.keys(paths).sort(), ['BIMBO', 'STRM_EXCESOS', 'STRM_LINEA_AZUL']);
    assert.ok(Object.values(paths).every(url => !url.includes('t2-rm')));
  }
});

test('T1 y T2 cargan su JSON público correcto en ambos productos y periodos', async () => {
  const { context, requests } = await pricingApp();
  const catalog = JSON.parse(vm.runInContext('JSON.stringify(PERIODOS_DISPONIBLES)', context));
  for (const [product, filename] of Object.entries(products)) {
    for (const period of periods) {
      for (const plan of ['T1', 'T2']) {
        const key = context.getPeriodosKey('STRM', product, plan);
        assert.ok(catalog[key].includes(period), `${product} ${plan}: periodo ${period} disponible`);
        const pricing = await context.loadJSON('STRM', product, plan, period);
        assert.equal(requests.at(-1), `pricing/${period}/pricing-${filename}-${period}.json`);
        assert.ok(Array.isArray(pricing.planes[plan]) && pricing.planes[plan].length > 0);
      }
    }
  }
  assert.equal(requests.length, 8);
  assert.ok(requests.every(url => !url.includes('t2-rm')));
});

test('un plan retirado o inválido se rechaza antes de pedir cualquier tarifa', async () => {
  const { context, requests } = await pricingApp();
  for (const product of Object.keys(products)) {
    for (const plan of ['TraspasoRM', 'PlanUnico', '', 'T3']) {
      await assert.rejects(context.loadJSON('STRM', product, plan, '2026-2027'), /plan/i);
    }
  }
  assert.deepEqual(requests, []);
});

test('la normalización real recupera T1 ante una selección antigua retirada o vacía', async () => {
  for (const savedPlan of ['TraspasoRM', '']) {
    const { context, plan, requests } = await pricingApp({ initialPlan: savedPlan, normalize: true });
    assert.equal(plan.value, '', 'El selector real no conserva una opción ausente');
    context.normalizarPlanStrm();
    assert.equal(plan.value, 'T1');
    await context.loadJSON('STRM', 'LINEA_AZUL', plan.value, '2025-2026');
    assert.equal(requests.at(-1), 'pricing/2025-2026/pricing-strm-2025-2026.json');
  }
});

test('la normalización conserva las selecciones T1 y T2 válidas', async () => {
  for (const savedPlan of ['T1', 'T2']) {
    const { context, plan } = await pricingApp({ initialPlan: savedPlan, normalize: true });
    context.normalizarPlanStrm();
    assert.equal(plan.value, savedPlan);
  }
});
