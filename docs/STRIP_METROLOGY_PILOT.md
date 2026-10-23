# Piloto de metrología visual: 1–4 tiras de goma en cinta

MS ROBOTIKA · 23/10/2026 · EXPERIMENTAL · No acreditado para producción.

## Función implementada

Inspector de anchura de una, dos, tres o cuatro tiras paralelas de goma observadas por una cámara cenital; el avance se representa verticalmente en la imagen, la anchura horizontalmente. Analiza once secciones del fotograma, calcula mínimos, máximos, medias y desviaciones frente a nominal ± tolerancia de química/calidad. Frecuencia orientativa 1 fotograma/segundo. Alertas visuales, CSV temporal y PNG anotado bajo petición.

Entradas: webcam USB/UVC vía navegador (preferentemente http://127.0.0.1 con Python), o cámaras IP privadas IPv4 que ofrezcan JPEG/MJPEG y estén autorizadas; no hay conexión a PLC ni comandos físicos. RTSP/ONVIF directo NO soportado: necesita puente local independiente sujeto a permisos.

## Calibración y bloqueo

Dos fiduciales físicos rígidos CIAN/MAGENTA deben permanecer visibles en el MISMO plano que la goma, separados por una distancia centro a centro conocida en mm e independiente de la anchura de la muestra. El software localiza automáticamente ambos puntos por color y comprueba con el motor existente su forma, identidad, resolución, posición, escala y giro. El nominal no determina la escala.

Primera captura con muestra: detectar posición de las tiras y guardar valores iniciales informativos. En cada fotograma vuelve a auditar los marcadores y los bordes; si faltan marcadores, cambian resolución/fuente, hay carriles solapados o región incompleta: SIN MEDICIÓN. Si supera inequívocamente tolerancia: NOK. Si solapa la incertidumbre indicativa: REVISAR. Solo si margen menos incertidumbre lo permite: OK.

La incertidumbre de bordes y fiduciales sigue siendo una aproximación de laboratorio, no una calibración metrológica acreditada. Falta corregir lente/perspectiva/homografía y ensayar repetibilidad, reproducibilidad y comparación física contra patrones trazables.

## Comportamiento esperado con oscilaciones transversales

Las tiras extruidas pueden desplazarse lateralmente por vibración u oscilación normal de la línea, incluso describiendo curvas suaves dentro del campo de visión. Este movimiento **no** debe producir rechazo por posición. En cada corte se detectan bordes, se vinculan carriles separados de izquierda a derecha y se estima la tangente local de la línea central. El ancho horizontal se corrige a ancho **normal a la dirección local** mediante la pendiente, con 11 secciones a lo largo del avance. El veredicto se deriva solo de los anchos mínimos/máximos comparados con nominal ± tolerancia (más margen de incertidumbre); se anota el desplazamiento lateral respecto a la muestra solo como diagnóstico, sin modificar el veredicto.

Si la oscilación saca una tira de la región de interés, cambia de orden al cruzarse, la oculta o introduce pendientes superiores al rango del método, debe emitirse SIN MEDICIÓN. Oscilación normal dentro de la ROI + anchura constante = OK. Se verifica con pruebas de traslación ±70 px y curvas simuladas; el laboratorio ofrece un botón «Simular oscilación lateral» independientemente de «Simular variación de ancho».

Este piloto solo captura ~1 fotograma/s; por tanto, **no detecta necesariamente todos los defectos cortos** en una línea de goma en producción. Para garantía de inspección de un material continuo será imprescindible definir resolución temporal, velocidad de cinta, longitud mínima de defecto, FPS y, preferiblemente, disparo con encoder/trigger y muestreo sin pérdidas.

## Recetas y registros

Receta guardada (localStorage o JSON): ID de producto, 1–4 tiras, ancho nominal, tolerancia, distancia de marcadores, altura de cámara, ROI, umbral y polaridad de contraste. Hasta 20 recetas por navegador; también importar/exportar JSON. Al reabrir cualquier receta NO se reutiliza una calibración activa: requiere verificar de nuevo el patrón. Ninguna credencial IP ni imagen se guarda en la receta.

CSV: UTC, ID, secuencia, fuente DEMO/USB/IP sin dirección privada, ancho y estado por tira, desviaciones, escala, incertidumbre y bloqueo. 1000 mediciones máximas en memoria; exportar antes de cerrar. Sin encoder no se puede afirmar metraje producido/defectuoso: solo historial temporal.

## Ensayo guiado de laboratorio

1. Descargar [HTML portable desde la rama candidata](https://github.com/msrobotika/-AB-Vision-Inspector/blob/feat/continuous-rubber-strips-20261023/AB-Vision-Inspector-PORTABLE.html) → Raw/Download y abrir el archivo local; para webcam usar python serve.py en localhost.
2. Seleccionar 1, 2, 3 o 4 tiras; pulsar Cinta demo y Detectar patrón y calibrar muestra.
3. Verificar estado OK, las anchuras por tira y escala simulada. Patrón demo: 1000 px entre centros = 200 mm → 0.2 mm/px; tiras de 50 px = ~10 mm.
4. Simular variación de ancho: una tira crece 18 px → NOK y diferencia en mm, sin detener motor físico.
5. Exportar CSV, guardar receta, volver a cargarla y comprobar que no mide hasta recalibrar; borrar un marcador → SIN MEDICIÓN.
6. Activar continuo para ver mediciones repetidas solo desde webcam/IP activa o demo (NO repite una foto estática).

## Comandos QA

    node --test tests/core.test.js tests/strip-core.test.js
    python tools_build_portable.py
    python -m unittest discover -s tests -p test_ip_camera.py -v
    python -m unittest discover -s tests -p smoke_browser.py -v

CI: Node 22, Python 3.13 y Chromium real. Las capturas sintéticas no se deben presentar como cámara instalada sobre cinta física.

## Pendientes antes de uso real

Inventario de cámara (USB/HTTP snapshot/RTSP) y consentimiento OT; referencias físicas y escala a distintos puntos del campo visual; distorsión óptica, perspectiva, iluminación, vibración, definición de umbral y velocidad de cinta; ensayo Gage R&R/comparación con micrómetro calibrado; disponibilidad por lotes, encoder para posición y persistencia auditable; seguridad/aislamiento de cámara IP; eventual envío informativo a Suite Core/SCADA. No autorizar control de rechazo ni funciones de seguridad sin proyecto industrial validado.

## Alternativa de guías virtuales sobre bordes reales (24/10/2026)

El usuario puede seleccionar el método `belt-edges` para no colocar fiduciales añadidos sobre la goma ni sobre la cinta. **Dos clics sobre bordes naturales visibles** colocan dos líneas de guía en una capa independiente del fotograma. El sistema detecta contrastes de esas aristas en nueve cortes verticales, comprueba estabilidad y obtiene escala orientativa usando la **anchura física de la cinta, introducida y medida independientemente**. La cámara no ve los dibujos del visor: solo puede medir el contraste de bordes físicos existentes. La anchura nominal de la tira no sirve como escala, solo como especificación de calidad.

En continuo se verifican resolución, identidad de cámara, ambos bordes, separación máxima (drift >1,5 %) y desplazamiento físico aparente (>7 px), sin borrar una alarma de falta de referencia ni sustituir con una escala autocalculada del ancho nominal. Si desaparecen aristas o hay reflejos/oclusiones, se emite SIN MEDICIÓN. La receta guarda el método pero **NO la calibración activa**; reabrir obliga a marcar los dos bordes otra vez.

**Limitaciones reales:** si los bordes de la cinta no están visibles o no contrastan, no puede utilizarse este método; se precisa referencia física temporal o cámara ópticamente calibrada. La cinta y la superficie superior de la goma no siempre están en el mismo plano (espesor), y la distorsión/perspectiva puede cambiar la escala local según posición. Sin comprobar con calibres o patrones medidos en las cuatro ubicaciones de la imagen, la escala se marca `BELT_EDGES_TRACKED`, nunca `VERIFIED` de fiduciales, y no se acredita metrología ni rechazo de producto. No introducir credenciales ni abrir cámaras IP sin autorización.

**Prueba reproducible:** `node --test tests/virtual-calibration.test.js`, `python tools_build_portable.py`, `python -m unittest discover -s tests -p smoke_browser.py -v`. Capturas automáticas: `vision-guias-virtuales-cinta-ok.png`, `vision-guias-virtuales-cinta-nok.png` y `vision-guias-virtuales-borde-perdido.png`, todas de cinta simulada de laboratorio.
