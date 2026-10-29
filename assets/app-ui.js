const titles = {
  salud: ['Cotizador GNP Salud', 'Primas y formas de pago, con la vigencia a la vista.'],
  vidatotal: ['Cotizador VidaTotal', 'Consulta la prima de vida según los datos del asegurado.'],
  menus: ['Menús de servicios', 'Requisitos, tiempos y formatos para cada movimiento.'],
  campanas: ['Campañas de autos', 'Encuentra el código de campaña que necesitas para emitir.']
};
const tabs = [...document.querySelectorAll('.tab')];
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => {
    for (const item of tabs) {
      item.setAttribute('aria-selected', String(item === tab));
      item.tabIndex = item === tab ? 0 : -1;
    }
    const [title, description] = titles[tab.dataset.tab];
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-description').textContent = description;
  });
  tab.addEventListener('keydown', event => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); tabs[next].click(); tabs[next].focus();
  });
});

for (const prefix of ['', 'vt-']) {
  const result = document.getElementById(prefix + 'result-original');
  const empty = document.getElementById(prefix + 'quote-empty');
  const context = document.getElementById(prefix + 'quote-context');
  const fields = prefix ? ['vt-genero','vt-condicion','vt-edad','vt-sa']
    : ['cliente','producto','plan','vigencia','genero','edad','extraprima','pago-mixto'];
  const readInputs = () => JSON.stringify(fields.map(id => {
    const field = document.getElementById(id);
    return [id, field.value, field.checked];
  }));
  let quotedInputs = readInputs();
  const hideResults = () => {
    for (const name of ['result-original','result-adjusted','result-mixto','meses-wrap']) {
      const element = document.getElementById(prefix + name);
      if (element) element.style.display = 'none';
    }
    empty.querySelector('p').textContent = 'Consulta de nuevo para calcular con los datos seleccionados.';
  };
  document.getElementById(prefix + 'btn-consultar').addEventListener('click', () => {
    quotedInputs = readInputs();
  }, { capture: true });
  const sync = () => {
    const visible = result.style.display !== 'none';
    if (visible && readInputs() !== quotedInputs) { hideResults(); return; }
    empty.hidden = visible;
    if (!visible) { context.textContent = ''; return; }
    context.textContent = prefix ? 'STRM · VidaTotal' : [
      document.getElementById('cliente').value,
      document.getElementById('cliente').value === 'STRM' ? document.getElementById('producto').selectedOptions[0].textContent + ' · ' + document.getElementById('plan').value : '',
      document.getElementById('vigencia').selectedOptions[0].textContent
    ].filter(Boolean).join(' / ');
  };
  new MutationObserver(sync).observe(result, { attributes: true, attributeFilter: ['style'] });
  sync();
  for (const id of fields) for (const event of ['input', 'change'])
    document.getElementById(id).addEventListener(event, hideResults);
}

// FIN PRESENTACION COTIZACIONES
