async function iniciarPreparacionEquipo() {
  const abrir = document.getElementById('install-open');
  const informacion = document.getElementById('install-info');
  const cerrar = document.getElementById('install-close');
  const plataforma = document.getElementById('install-platform');
  const pasos = document.getElementById('install-steps');
  const instalar = document.getElementById('install-native');
  const estadoInstalacion = document.getElementById('install-state');
  const estadoProteccion = document.getElementById('persistence-state');
  const detalleProteccion = document.getElementById('persistence-detail');
  const solicitarProteccion = document.getElementById('persistence-request');
  if (![abrir, informacion, cerrar, plataforma, pasos, instalar, estadoInstalacion,
    estadoProteccion, detalleProteccion, solicitarProteccion].every(Boolean)) return;

  const instrucciones = {
    ios: [
      'Abre esta página en Safari.',
      'Abre Compartir. Según el diseño de Safari, puede estar dentro del menú de la página.',
      'Selecciona Agregar a pantalla de inicio. Si no aparece, revisa Editar acciones.',
      'Mantén activado Abrir como app web, si aparece, y pulsa Agregar.'
    ],
    android: [
      'Abre esta página en Chrome o en tu navegador habitual.',
      'Abre el menú del navegador y busca Instalar aplicación o Agregar a pantalla de inicio. El nombre puede variar.',
      'Confirma la instalación o la creación del acceso siguiendo las instrucciones del navegador.'
    ],
    desktop: [
      'Abre esta página en tu navegador habitual.',
      'En Chrome o Edge, busca la opción de instalar esta página como aplicación en el menú del navegador. En Safari para Mac, busca Agregar al Dock.',
      'Si tu navegador no ofrece instalación, guarda la página en Favoritos para encontrarla después.'
    ]
  };
  const agente = navigator.userAgent || '';
  const esIpadMac = (/Macintosh|MacIntel/i.test(agente) || navigator.platform === 'MacIntel') && navigator.maxTouchPoints > 1;
  const plataformaReal = /iPhone|iPad|iPod/i.test(agente) || esIpadMac ? 'ios' : /Android/i.test(agente) ? 'android' : 'desktop';
  plataforma.value = plataformaReal;
  const esMovil = plataformaReal === 'ios' || plataformaReal === 'android';
  abrir.hidden = !esMovil;
  function mostrarPasos() {
    pasos.replaceChildren(...(instrucciones[plataforma.value] || instrucciones.desktop).map(texto => {
      const paso = document.createElement('li');
      paso.textContent = texto;
      return paso;
    }));
  }
  mostrarPasos();
  plataforma.addEventListener('change', mostrarPasos);
  const actualizacionObligatoria = () => document.getElementById('offline-update')?.open;
  abrir.addEventListener('click', () => {
    if (!esMovil || abrir.hidden || actualizacionObligatoria()) return;
    if (plataformaReal === 'android' && oferta && !instalada) {
      solicitarInstalacion();
      return;
    }
    if (!informacion.open) informacion.showModal();
  });
  cerrar.addEventListener('click', () => informacion.close());

  let instalada = navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
  let oferta = null;
  instalar.hidden = true;
  estadoInstalacion.textContent = instalada ? 'Abierta desde el ícono.' : 'Agrega el acceso siguiendo los pasos para tu dispositivo.';
  window.addEventListener('beforeinstallprompt', event => {
    if (!esMovil) return;
    event.preventDefault();
    if (instalada) return;
    oferta = event;
    instalar.hidden = false;
    instalar.disabled = false;
    estadoInstalacion.textContent = 'El navegador ofrece instalar esta aplicación.';
  });
  window.addEventListener('appinstalled', () => {
    instalada = true;
    oferta = null;
    instalar.hidden = true;
    estadoInstalacion.textContent = 'Instalación confirmada por el navegador.';
  });
  async function solicitarInstalacion() {
    if (!esMovil || !oferta || instalada || actualizacionObligatoria()) return;
    const pendiente = oferta;
    oferta = null;
    instalar.hidden = true;
    instalar.disabled = true;
    try {
      await pendiente.prompt();
      const eleccion = await pendiente.userChoice;
      if (!instalada) estadoInstalacion.textContent = eleccion.outcome === 'accepted'
        ? 'Solicitud de instalación aceptada; esperando confirmación del navegador.'
        : 'Puedes agregar el acceso desde el menú del navegador cuando lo necesites.';
    } catch (_) {
      if (!instalada) estadoInstalacion.textContent = 'No se pudo abrir la instalación. Sigue los pasos para tu dispositivo.';
    } finally {
      instalar.disabled = false;
    }
  }
  instalar.addEventListener('click', solicitarInstalacion);

  const almacenamiento = navigator.storage;
  const puedeSolicitar = window.isSecureContext && typeof almacenamiento?.persist === 'function';
  function mostrarProteccion(concedida, solicitada = false) {
    estadoProteccion.textContent = concedida ? 'Concedida' : solicitada ? 'No concedida' : 'Sin protección concedida';
    detalleProteccion.textContent = concedida
      ? 'El navegador confirmó protección frente a la limpieza automática. Si borras los datos del sitio, tendrás que descargar la copia nuevamente.'
      : solicitada
        ? 'El navegador no concedió protección adicional. La copia puede seguir disponible; revisa su estado antes de salir.'
        : 'Puedes solicitar protección adicional. Esto no sustituye la descarga completa para usar la herramienta sin conexión.';
    solicitarProteccion.disabled = concedida || !puedeSolicitar;
  }
  solicitarProteccion.disabled = true;
  solicitarProteccion.addEventListener('click', async () => {
    if (!puedeSolicitar || solicitarProteccion.disabled) return;
    solicitarProteccion.disabled = true;
    estadoProteccion.textContent = 'Solicitando…';
    try {
      mostrarProteccion(await almacenamiento.persist() === true, true);
    } catch (_) {
      estadoProteccion.textContent = 'No se pudo solicitar';
      detalleProteccion.textContent = 'No se pudo conocer el resultado. Puedes volver a intentarlo; comprueba también el estado de la copia local.';
      solicitarProteccion.disabled = false;
    }
  });
  if (!window.isSecureContext || typeof almacenamiento?.persisted !== 'function') {
    estadoProteccion.textContent = 'No disponible';
    detalleProteccion.textContent = 'Este navegador no permite comprobar la protección del almacenamiento en este contexto. Revisa por separado si la copia está disponible sin conexión.';
    return;
  }
  estadoProteccion.textContent = 'Comprobando…';
  try {
    mostrarProteccion(await almacenamiento.persisted() === true);
  } catch (_) {
    estadoProteccion.textContent = 'No se pudo comprobar';
    detalleProteccion.textContent = 'No se pudo consultar la protección del almacenamiento. Esto no confirma ni descarta que la copia esté disponible sin conexión.';
    solicitarProteccion.disabled = !puedeSolicitar;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => iniciarPreparacionEquipo(), { once: true });
} else {
  iniciarPreparacionEquipo();
}
