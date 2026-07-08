# CLAUDE.md — tools_produccion

Guía de comportamiento específica para este proyecto. Complementa el CLAUDE.md raíz; nunca lo reemplaza.

## Identidad del proyecto

Herramienta interna de MCBrokers hospedada en GitHub Pages. Archivo único (`index.html`) que contiene HTML, CSS y JS. Sin backend, sin servidor, sin proceso de build.

**Repositorio:** https://github.com/MC-BROKERS/tools_produccion  
**URL pública:** https://mc-brokers.github.io/tools_produccion/

---

## Arquitectura (no modificar sin justificación)

- **Un solo archivo**: todo el código vive en `index.html`. No crear archivos `.js` o `.css` separados salvo que se justifique explícitamente.
- **Datos de precios**: en `/pricing/YYYY-YYYY/pricing-[producto]-YYYY-YYYY.json`. Nunca embebidos en el HTML.
- **Datos de campañas**: en `/data/campanas.json` y `/data/ejemplos-expedientes.json`. El HTML también los tiene embebidos como fallback para cuando `fetch()` no funciona.
- **Datos de Menús de Servicios y VidaTotal**: embebidos directamente en el JS del HTML. No requieren archivos externos.
- **Assets**: solo el logo en `/assets/Logo_Colores_MCB.png`.

---

## Workflow de cambios

### Antes de editar
1. Leer `MEMORY.md` de este proyecto para conocer el estado actual.
2. Si el cambio toca datos de tarifas o menús, verificar contra el Excel fuente antes de codificar.
3. Para cambios grandes (>50 líneas), usar un script Python en bash — no encadenar múltiples `Edit` calls sobre el mismo bloque.

### Al editar `index.html`
- Usar `Read` con `offset`/`limit` para leer solo la sección relevante antes de editar.
- Para reemplazos en bloques JS grandes: usar Python con marcadores de inicio y fin exactos.
- Nunca dejar código muerto (`if (false)`, variables sin usar, funciones huérfanas).
- Verificar siempre que el archivo cierre correctamente (`</script></body></html>`).

### Git
El historial local y remoto divergen frecuentemente. Siempre usar `--force` en el push:
```bash
git add -A
git commit -m "tipo: descripción concisa"
git push origin main --force
```

---

## Cómo agregar datos nuevos

### Nuevo periodo de tarifas GNP Salud
1. Crear carpeta `pricing/YYYY-YYYY/`
2. Agregar JSON con el formato `pricing-[producto]-YYYY-YYYY.json`
3. En `index.html`, agregar el periodo al array correspondiente en `PERIODOS_DISPONIBLES`

### Nueva aseguradora/ramo en Menús de Servicios
Localizar `MENUS_DATA` en el JS y reemplazar `null` por un array de movimientos. Estructura de cada movimiento:
```javascript
{
  titulo: 'Nombre del movimiento',
  categoria: 'Categoría para filtro',
  diasMCB: 2,
  diasAseg: 10,        // para aseguradora única
  // slaPorAseg: { GNP: 3, ANA: 1, Qualitas: 1, AXA: 7 },  // para múltiples aseguradoras
  formatos: [
    { nombre: 'Nombre del formato', link: 'https://drive.google.com/...' }
  ],
  documentos: ['Doc 1', 'Doc 2'],
  adicional: [],          // puede quedar vacío []
  nota: [
    'Bullet 1.',
    'Bullet 2.'
  ]
}
```

### Nueva tarifa VidaTotal
La tabla de tarifas está en `VT_TARIFAS` dentro del JS. Si cambia la tabla, actualizar los valores directamente ahí. Verificar siempre contra el Excel fuente y comprobar al menos dos casos conocidos.

---

## Reglas editoriales

- Sigue las voice-principles del root (`00_Resources/voice-principles.md`).
- Textos en la interfaz: español, sin mezclar inglés salvo términos técnicos del sector (OT, FSA, CIANNE, RC EUA).
- Nombres propios del sector con mayúscula inicial: Cuestionario Médico, Orden de Trabajo, Formato de Servicios Asistidos.
- Notas importantes: siempre como array de bullets, nunca como párrafo continuo.

---

## Lo que NO hacer
- No abrir `index.html` directamente desde el sistema de archivos para probar — `fetch()` falla con `file://`. Usar GitHub Pages o un servidor local (`python3 -m http.server`).
- No crear archivos `.md` en la raíz del repo sin autorización (GitHub Pages podría servirlos públicamente).
- No modificar `pricing/` ni `data/` sin verificar que las rutas en `getJsonPaths()` y `DATA_PATHS` sigan siendo válidas.
