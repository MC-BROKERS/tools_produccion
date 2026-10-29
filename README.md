# Herramientas Internas MCBrokers

Sistema integrado con cuatro herramientas principales:

1. **Cotizador GNP Salud** — Cotización de seguros de gastos médicos (STRM y BIMBO)
2. **Cotizador VidaTotal** — Cotización de seguro de vida VidaTotal (STRM)
3. **Menús de Servicios** — Consulta de documentación, formatos y tiempos por movimiento
4. **Selector de Campañas de Emisión Autos** — Identificación de códigos de campaña

## 📂 Estructura del Proyecto

```
proyecto/
├── index.html                          # Archivo principal (HTML + CSS + JS)
├── assets/
│   └── Logo_Colores_MCB.png
├── data/
│   ├── campanas.json                   # Campañas de autos
│   └── ejemplos-expedientes.json       # Ejemplos de formato de expediente
└── pricing/
    ├── 2025-2026/
    │   ├── pricing-bimbo-2025-2026.json
    │   ├── pricing-strm-2025-2026.json
    │   ├── pricing-strm-excesos-2025-2026.json
    │   └── pricing-t2-rm-2025-2026.json # Histórico, sin acceso desde el cotizador
    └── 2026-2027/
        ├── pricing-bimbo-2026-2027.json
        ├── pricing-strm-2026-2027.json
        └── pricing-strm-excesos-2026-2027.json
```

## 🚀 Uso

Abre la herramienta desde **GitHub Pages**. La primera visita necesita internet. La cabecera separa **Con conexión / Sin conexión** del estado de la copia local. Mientras se descargan datos indica **Descargando · espera**. No cierres ni recargues hasta ver **Disponible sin conexión**; al pulsar cualquiera de los estados se abre el detalle.

En iPhone, iPad y Android aparece **Agregar al inicio**, debajo de los dos estados. Android abre la confirmación nativa cuando el navegador ofrece instalación; en los demás casos muestra las instrucciones del dispositivo. iPhone requiere completar la acción desde el menú de Safari. Las computadoras no muestran este botón.

Después de agregar el acceso, abre la herramienta **desde ese ícono, con internet**, y espera **Disponible sin conexión** antes de salir. En iPhone, el almacenamiento de Safari puede ser distinto del de la web abierta desde el ícono.

Desde el detalle puedes **Solicitar persistencia** y consultar si el navegador la concedió. La protección no sustituye la descarga y no garantiza conservación indefinida: borrar datos del sitio elimina la copia, y el navegador decide si concede protección frente a la limpieza automática. Evita la navegación privada. Si falta la copia, abre con internet y descárgala de nuevo.

Los cotizadores GNP Salud y VidaTotal, la consulta de menús y las campañas funcionan con la copia descargada. Los formatos enlazados de Google Drive requieren conexión o una descarga aparte.

### Actualizaciones

- La herramienta comprueba novedades al abrir, al recuperar conexión o foco, y cada 15 minutos mientras está visible.
- Si hay cambios de código o datos, primero descarga y verifica el paquete completo. Una descarga incompleta conserva la versión anterior.
- Cuando la nueva copia está lista, aparece un aviso obligatorio: **Actualizar y recargar**. La recarga activa la versión nueva en las pestañas abiertas del sitio y conserva las entradas de los cotizadores. Es necesario volver a consultar para recalcular las primas.
- **Buscar actualizaciones** permite comprobar manualmente. La última descarga indicada corresponde a la copia local; no sustituye la vigencia tarifaria ni la fecha de origen de una tarifa.
- Sin conexión no se pueden descubrir cambios nuevos. Una actualización que ya terminó de descargarse sí puede activarse sin internet.

### Prueba y publicación

Requiere Node.js 24, sin instalar paquetes adicionales:

```sh
node --test tests/*.test.mjs
node scripts/build-site.mjs
python3 -m http.server 8000 --directory _site
```

Abre `http://localhost:8000`. No funciona con `file://`. El generador copia solo recursos públicos y crea `sw.js` con una versión SHA-256 derivada de la página, datos, tarifas, assets y lógica del worker. Un cambio de solo JSON también produce una actualización.

El workflow **Publicar herramientas** comprueba y genera el paquete en los PR; publica solo desde `main`. Al activar esta funcionalidad, configura **Settings → Pages → Source → GitHub Actions** para publicar `_site`. El worker usa el scope relativo del proyecto y solo limpia las cachés `mcb-tools-produccion-` de esta herramienta.

La lógica de negocio permanece en `index.html`. Los estilos de identidad y la presentación se separan en `assets/mcb-tokens.css`, `assets/app-ui.css` y `assets/app-ui.js`, y la ayuda de instalación/persistencia en `assets/prepare-device.js`, para mantener estos cambios independientes de las fórmulas y facilitar su verificación. El generador incluye estos archivos, las fuentes con sus licencias y los íconos PNG de 180/192/512 px en el mismo paquete verificado para uso sin conexión. El visor de revisión y sus simulaciones no forman parte del sitio publicado.

Tailwind 3.4.17 se conserva localmente en `assets/tailwind-3.4.17.js`, con su licencia, para que el diseño no dependa de una conexión al CDN.

## 🎯 Cotizador GNP Salud

- Empresas: STRM y BIMBO
- Productos STRM: Línea Azul y Excesos (T1 / T2)
- Selector de vigencia tarifaria (2025–2026 / 2026–2027)
- Cálculo de extra-prima
- Modalidad pago mixto (STRM)
- Cálculo por meses de cobertura

## 🎯 Cotizador VidaTotal

- Empresa: STRM
- Campos: género, condición (fumador / no fumador), edad (15–80 años), suma asegurada ($300,000–$2,500,000)
- Tabla de tarifas embebida en el JS — no requiere archivo JSON externo
- Fórmula: `(factor_por_millar × suma_asegurada / 1,000) + $180`
  - Tipo de riesgo: HFE / HNFE / MFE / MNFE
  - Ajuste de edad efectiva: HFE = 0, HNFE = −2, MFE = −3, MNFE = −5
- Muestra prima anual y prima semanal (anual / 48)

## 🎯 Menús de Servicios

- Navegación en dos niveles: Ramo (Autos / Salud / Vida / Hogar) → Aseguradora
- Muestra por movimiento: documentación requerida, formatos descargables y tiempo total en días hábiles
- Búsqueda en tiempo real y filtros por categoría de movimiento
- Todos los datos embebidos en el JS — no requiere archivos externos
- Ramos disponibles actualmente:
  - **Autos**: ANA, AXA, GNP, Qualitas (8 movimientos)
  - **Salud**: GNP (10 movimientos)
  - Vida y Hogar: próximamente

### Agregar datos a un ramo/aseguradora

En `index.html`, localiza `MENUS_DATA` y agrega o reemplaza el valor `null` de la aseguradora con un array de movimientos. Cada movimiento tiene la siguiente estructura:

```javascript
{
  titulo: 'Nombre del movimiento',
  categoria: 'Categoría para filtro',   // ej. 'Emisión', 'Cancelación', 'Otros movimientos'
  totalDias: 8,
  formatos: [
    { nombre: 'Nombre del formato', link: 'https://...' }
  ],
  documentos: ['Doc 1', 'Doc 2'],
  adicional: ['Solo si aplica'],         // puede quedar vacío []
  nota: 'Texto de la nota importante.'
}
```

## 🎯 Selector de Campañas de Emisión Autos

- Búsqueda rápida por nombre de campaña
- Filtros en cascada (Empresa → Aseguradora → Periodicidad → Crédito Caja)
- Botón para copiar código de campaña
- Ejemplos de expediente contextuales por empresa

## ✏️ Cómo Actualizar Datos

### Agregar tarifas de un nuevo periodo (GNP Salud)

1. Crea la carpeta `pricing/YYYY-YYYY/`
2. Agrega los archivos JSON con el formato `pricing-[producto]-YYYY-YYYY.json`
3. En `index.html`, agrega el nuevo periodo al array correspondiente dentro de `PERIODOS_DISPONIBLES`

### Agregar/Modificar Campañas

Edita `data/campanas.json`:
```json
{
  "empresa": "Nueva Empresa",
  "aseguradora": "GNP",
  "via_pago": "DxN",
  "periodicidad": "Semanal",
  "campana": "NUEVA_CAMPANA",
  "credito_caja": "No",
  "digitos_expediente": "7 dígitos"
}
```

### Agregar/Modificar Ejemplos de Expediente

Edita `data/ejemplos-expedientes.json`:
```json
{
  "Nueva Empresa": ["12345678", "87654321"]
}
```

---

**Versión del paquete**: SHA-256 generado automáticamente
**Última actualización de interfaz**: Octubre 2026
**MCBrokers** — Herramientas Internas
