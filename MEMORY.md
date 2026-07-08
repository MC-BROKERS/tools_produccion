# MEMORY.md — tools_produccion

Hechos del mundo que pueden cambiar. No prescribe comportamiento (eso va en CLAUDE.md).

_Última actualización: 2026-07-08_

---

## Repositorio y despliegue

| Campo | Valor |
|---|---|
| Repositorio | https://github.com/MC-BROKERS/tools_produccion |
| Rama principal | `main` |
| Hosting | GitHub Pages (público) |
| URL pública | https://mc-brokers.github.io/tools_produccion/ |
| Versión actual | 1.3 |

---

## Pestañas activas

| Pestaña | Estado | Notas |
|---|---|---|
| Cotizador GNP Salud | ✅ Completo | STRM y BIMBO, con versionamiento de tarifas |
| Cotizador VidaTotal | ✅ Completo | STRM, tabla Retarificación embebida en JS |
| Menús de Servicios | 🔄 Parcial | Autos (4 aseg.) y Salud GNP completos; Vida y Hogar pendientes |
| Campañas de Emisión Autos | ✅ Completo | 46 campañas, 6 empresas |

---

## Cotizador GNP Salud — Periodos de tarifas

| Producto / Clave | 2025-2026 | 2026-2027 |
|---|---|---|
| BIMBO | ✅ | ✅ |
| STRM Línea Azul (T1/T2) | ✅ | ✅ |
| STRM Excesos | ✅ | ❌ pendiente |
| STRM Traspaso Respaldo Médico | ✅ | ✅ |

Archivos en `/pricing/YYYY-YYYY/pricing-[producto]-YYYY-YYYY.json`.

---

## Cotizador VidaTotal

- **Empresa:** STRM
- **Tabla:** Retarificación (columna C del Excel fuente), no VT Cooley 2 (columna B).
- **Fórmula:** `prima_anual = (factor[edad_efectiva] × SA / 1,000) + $180`
- **Ajuste de edad por riesgo:** HFE = 0, HNFE = −2, MFE = −3, MNFE = −5
- **Rango válido:** edad 15–80, SA $300,000–$2,500,000
- **Archivo fuente:** `HERRAMIENTA (COTIZACIÓN RETARIFICACIÓN) COMERCIAL (1).xlsm`

---

## Menús de Servicios — Estado por ramo/aseguradora

| Ramo | Aseguradora | Estado | Movimientos | Archivo fuente |
|---|---|---|---|---|
| Autos | GNP, ANA, AXA, Qualitas | ✅ Completo | 8 (misma doc., SLA por aseg.) | `MENU DE SERVICIOS - AUTOS.xlsx` |
| Salud | GNP | ✅ Completo | 10 | `MENU DE SERVICIOS - GMM.xlsx` |
| Vida | VidaTotal, VidaMás, Inbursa, Prismatel | ⏳ Pendiente | — | Por recibir |
| Hogar | GMX | ⏳ Pendiente | — | Por recibir |

### SLAs Autos por aseguradora (días hábiles, excluyendo MCB=1)

| Movimiento | GNP | ANA | Qualitas | AXA |
|---|---|---|---|---|
| Emisión | 3 | 1 | 1 | 7 |
| Emisión asistida | 3 | 1 | 1 | 3 |
| Cancelación | 4 | 1 | 3 | 5 |
| Cancelación por fallecimiento | 4 | 1 | 3 | 5 |
| Modificación de datos | 3 | 1 | 3 | 5 |
| Endoso económico | N/A | 1 | N/A | N/A |
| Duplicados | N/A | N/A | N/A | N/A |
| Clave de marca | 2 | 1 | 1 | 2 |

---

## Decisiones técnicas tomadas

| Fecha | Decisión | Razón |
|---|---|---|
| 2026-05 | Un solo archivo index.html (HTML+CSS+JS) | Simplicidad de despliegue en GitHub Pages sin build |
| 2026-05 | Pricing en JSON externos, resto embebido | Pricing cambia frecuentemente; menús y tarifas de vida son más estables |
| 2026-05 | Tabla VidaTotal embebida en JS | No hay JSON externo necesario; la tabla es fija por tarifa |
| 2026-05 | Push con --force siempre | Historial local diverge del remoto por inicialización tardía del repo |
| 2026-05 | Notas en arrays de strings | Permite render como bullets sin parseo complejo |

---

## Pendientes conocidos

- [ ] Agregar `pricing-strm-excesos-2026-2027.json` y habilitar periodo en `PERIODOS_DISPONIBLES`
- [ ] Recibir y cargar Menús de Servicios: Vida (VidaTotal, VidaMás, Inbursa, Prismatel)
- [ ] Recibir y cargar Menús de Servicios: Hogar (GMX)
