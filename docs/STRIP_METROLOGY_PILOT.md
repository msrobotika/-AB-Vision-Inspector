# Piloto de metrología visual: 1–4 tiras de goma en cinta

MS ROBOTIKA · 23/10/2026 · EXPERIMENTAL · No acreditado para producción.

## Función implementada

Inspector de anchura de una, dos, tres o cuatro tiras paralelas de goma observadas por una cámara cenital; el avance se representa verticalmente en la imagen, la anchura horizontalmente. Analiza cinco secciones del fotograma, calcula mínimos, máximos, medias y desviaciones frente a nominal ± tolerancia de química/calidad. Frecuencia orientativa 1 fotograma/segundo. Alertas visuales, CSV temporal y PNG anotado bajo petición.

Entradas: webcam USB/UVC vía navegador (preferentemente http://127.0.0.1 con Python), o cámaras IP privadas IPv4 que ofrezcan JPEG/MJPEG y estén autorizadas; no hay conexión a PLC ni comandos físicos. RTSP/ONVIF directo NO soportado: necesita puente local independiente sujeto a permisos.

## Calibración y bloqueo

Dos fiduciales físicos rígidos CIAN/MAGENTA deben permanecer visibles en el MISMO plano que la goma, separados por una distancia centro a centro conocida en mm e independiente de la anchura de la muestra. El software localiza automáticamente ambos puntos por color y comprueba con el motor existente su forma, identidad, resolución, posición, escala y giro. El nominal no determina la escala.

Primera captura con muestra: detectar posición de las tiras y guardar valores iniciales informativos. En cada fotograma vuelve a auditar los marcadores y los bordes; si faltan marcadores, cambian resolución/fuente, hay carriles solapados o región incompleta: SIN MEDICIÓN. Si supera inequívocamente tolerancia: NOK. Si solapa la incertidumbre indicativa: REVISAR. Solo si margen menos incertidumbre lo permite: OK.

La incertidumbre de bordes y fiduciales sigue siendo una aproximación de laboratorio, no una calibración metrológica acreditada. Falta corregir lente/perspectiva/homografía y ensayar repetibilidad, reproducibilidad y comparación física contra patrones trazables.

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
