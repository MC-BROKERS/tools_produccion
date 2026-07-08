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
    │   └── pricing-t2-rm-2025-2026.json
    └── 2026-2027/
        ├── pricing-bimbo-2026-2027.json
        └── pricing-strm-2026-2027.json
```

## 🚀 Uso

Abre la herramienta desde **GitHub Pages**. No funciona abriéndola directamente como archivo local (`file://`) porque el navegador bloquea las peticiones `fetch()` en ese protocolo.

## 🎯 Cotizador GNP Salud

- Empresas: STRM y BIMBO
- Productos STRM: Línea Azul (T1 / T2 / Traspaso Respaldo Médico) y Excesos
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

## 🔧 Pendientes conocidos

- Agregar `pricing-strm-excesos-2026-2027.json` cuando esté disponible y habilitar el periodo en `PERIODOS_DISPONIBLES`
- Agregar `pricing-t2-rm-2026-2027.json` cuando esté disponible

---

**Versión**: 1.3
**Última actualización**: Mayo 2026
**MCBrokers** — Herramientas Internas
