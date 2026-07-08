# LESSONS.md — tools_produccion

Errores y patrones identificados durante el desarrollo. Formato: Problema → Lo que NO funcionó → Lo que SÍ funcionó → Lección portable.

_Última actualización: 2026-05-28_

---

## 1. `fetch()` falla al abrir el HTML directamente

**Problema:** El botón "Consultar" del cotizador mostraba "Failed to fetch" al abrir `index.html` desde el explorador de archivos.

**Lo que NO funcionó:** Atribuirlo a un error de código o de rutas.

**Lo que SÍ funcionó:** Entender que `file://` bloquea `fetch()` en Chrome por política de seguridad del navegador. La herramienta solo funciona desde GitHub Pages o un servidor local (`python3 -m http.server`).

**Lección portable:** Cualquier proyecto que use `fetch()` desde JS necesita un origen HTTP. Documentarlo en el README desde el inicio.

---

## 2. Tabla de tarifas VidaTotal: columna equivocada

**Problema:** El cotizador VidaTotal mostraba primas distintas al Excel fuente (ej. $41,075 vs $46,595 para HFE 80 años, $500k).

**Lo que NO funcionó:** Usar la columna B ("VT Cooley 2") del archivo Excel, que parecía ser la tabla principal.

**Lo que SÍ funcionó:** Leer el Excel con `openpyxl data_only=True` y comparar columnas. La columna C ("Retarificación") es la que usa el archivo para todos los cálculos, y diverge de la B a partir de la edad 42.

**Lección portable:** Cuando un Excel tiene múltiples tablas similares, siempre verificar cuál columna activa la fórmula final antes de asumir. Testear con al menos dos casos conocidos antes de integrar.

---

## 3. Push rechazado por historial divergente

**Problema:** `git push origin main` era rechazado con "Updates were rejected because the remote contains work that you do not have locally."

**Lo que NO funcionó:** `git pull` antes del push — introduce commits de merge innecesarios y complica el historial.

**Lo que SÍ funcionó:** `git push origin main --force` siempre. El repo fue inicializado localmente después de que ya existía en GitHub, por lo que los historiales nunca convergieron.

**Lección portable:** En repos de un solo colaborador donde el historial no importa conservar, `--force` es la solución práctica. Documentarlo en el CLAUDE.md del proyecto.

---

## 4. Reemplazos de bloques JS con cascadas de `Edit` → código muerto

**Problema:** Al reemplazar una sección grande de JS con múltiples llamadas `Edit` encadenadas, quedaron fragmentos del código viejo envueltos en `if (false) { ... }` que había que limpiar manualmente.

**Lo que NO funcionó:** Hacer 3–4 edits encadenados para quitar y reemplazar un bloque grande; los límites de cada edit no eran precisos y quedaban restos.

**Lo que SÍ funcionó:** Usar un script Python con marcadores exactos de inicio y fin para hacer el reemplazo de una sola vez y de forma atómica.

**Lección portable:** Para bloques JS/HTML de más de 30 líneas, siempre usar Python con `content.find(marker_start)` y `content.find(marker_end)` y reemplazar el bloque completo de una vez.

---

## 5. `openpyxl data_only=True` devuelve valores cacheados, no recalculados

**Problema:** Al leer el Excel de Autos con `data_only=True`, algunas celdas con fórmulas devolvían valores que no coincidían con lo que mostraría Excel al recalcular.

**Lo que NO funcionó:** Confiar ciegamente en los valores de `data_only=True` para celdas con fórmulas complejas o que dependen de macros.

**Lo que SÍ funcionó:** Leer tanto las fórmulas (sin `data_only`) como los valores cacheados, comparar entre sí, y verificar contra el Excel abierto manualmente para los casos clave.

**Lección portable:** Con archivos `.xlsm` (con macros), `data_only=True` puede dar valores desactualizados si el archivo fue guardado sin recalcular. Siempre verificar los resultados críticos contra el Excel abierto en Excel/LibreOffice.

---

## 6. Reemplazos en cadena con texto duplicado fallan en la segunda ocurrencia

**Problema:** Al tener dos movimientos con el mismo texto en `nota:` (Cancelación y Cancelación por fallecimiento en Autos), el script Python de reemplazo solo actualizó la primera ocurrencia.

**Lo que NO funcionó:** Usar `str.replace(old, new)` sin el argumento `count=1` cuando el texto es idéntico en dos lugares distintos y necesita reemplazarse dos veces.

**Lo que SÍ funcionó:** Para el primer bloque usar `replace(old, new, 1)` y para el segundo hacer un edit manual apuntando al contexto circundante único (los campos vecinos que sí son diferentes).

**Lección portable:** Antes de hacer un reemplazo masivo, verificar con `grep -c "texto"` cuántas ocurrencias existen. Si hay más de una y deben tratarse igual, usar `replace_all`. Si deben tratarse diferente, anclar cada reemplazo a contexto único.

---

## 7. CSS de notas: estilo original demasiado neutro para contenido importante

**Problema:** El primer diseño de `.ms-note` usaba un fondo azul claro (`#F7FAFF`) igual al de los badges informativos, lo que no diferenciaba visualmente las notas importantes del resto del contenido.

**Lo que NO funcionó:** Usar el mismo esquema de color azul para notas que para badges de tiempo.

**Lo que SÍ funcionó:** Usar fondo ámbar (`#FFFBEB`) con borde dorado, que es la convención estándar de UI para "advertencia/atención" — inmediatamente reconocible.

**Lección portable:** Reservar azul para información neutral/navegación, ámbar/amarillo para notas de atención, rojo para errores. No mezclar.
