# Montaje cenital · 3 tiras de 50 mm ±2 mm

**MS ROBOTIKA · 23/10/2026 · PILOTO EXPERIMENTAL.** La imagen de referencia del usuario representa tres tiras oscuras bajo cámara cenital, 100 mm entre centros de fiduciales CIAN/MAGENTA y una altura cámara-plano de 800 mm. **Es un dibujo ilustrativo, no una captura a escala ni un patrón de calibración.**

## Cómo probar la webcam

1. Descargar el archivo [AB-Vision-Inspector-PORTABLE.html](../AB-Vision-Inspector-PORTABLE.html), abrirlo con Chrome/Edge y utilizar Cinta demo para aprender los controles.
2. Para cámara USB: descargar el repositorio, ejecutar **python serve.py** (Python 3.11+) y abrir la URL de localhost indicada. Dar permiso a la webcam y pulsar **Iniciar cámara**.
3. Entrar en **Tiras de goma** y pulsar **Montaje real de ejemplo: 3 × 50 ± 2 mm**. Este botón prepara solamente una receta: 3 tiras, nominal 50 mm, tolerancia ±2 mm, fiduciales a 100 mm y altura de montaje 800 mm. No valida la cámara ni crea un resultado OK.
4. Para cámara IP autorizada: usar el mismo servidor Python y el panel JPEG/MJPEG de IPv4 privada, sin guardar credenciales en receta. RTSP/ONVIF necesita un puente local adicional no implementado.

## Preparación física

Colocar la cámara rígida perpendicular a la goma, con iluminación estable, luz difusa y sin brillos. Las marcas cian y magenta deben estar **en el mismo plano que la superficie SUPERIOR de la goma medida**, no por debajo a la altura de la cinta si las tiras tienen espesor. Medir la distancia centro a centro REAL con instrumento independiente. Los 800 mm de altura no proporcionan por sí solos la escala mm/píxel. Fijar enfoque/exposición/zoom y volver a verificar si cambian.

El material se desplaza en Y y la anchura debe medirse normal a la trayectoria (X para tiras rectas). La ROI debe contener 1–4 tiras completamente, incluso durante oscilaciones laterales; separar y evitar solapamientos.

**Comprobación de campo de visión:** si 100 mm equivalen a 1000 píxeles, la escala es 0,1 mm/píxel. Cada tira de 50 mm debería ocupar 500 píxeles y las tres ocuparían al menos **1500 píxeles sin huecos**. Por tanto no caben en una ROI de 1060 píxeles. No «recalibrar» cambiando nominales ni inventando distancias: modificar óptica, altura, resolución, referencia física o encuadre y repetir. El software bloqueará el montaje incoherente antes de declarar una calibración aceptada.

## Inspección continua y trazabilidad

1. Conectar USB/IP, captar un **fotograma real sin flechas ni texto** y escoger la ROI.
2. Pulsar **Detectar patrón y calibrar muestra** para detectar cian/magenta, auditar escala e identificar 1–4 tiras.
3. Si la geometría es posible, pulsar **Medir fotograma** y **Continuo: ON**. Recalibra si cambias de cámara, receta, foco o altura. Guardar receta local JSON y exportar CSV/PNG de lecturas; el historial de sesión se limita a 1000 muestras.
4. El ancho nominal 50 ±2 mm produce un rango de referencia 48–52 mm, sujeto a incertidumbre. Los estados son OK, NOK, REVISAR y SIN MEDICIÓN. La oscilación lateral sin cambio de ancho no causa NOK; pérdida de patrón, solapamiento o corte de tira causa SIN MEDICIÓN.
5. Ensayar físicamente contra patrones independientes de anchura cerca de 48/50/52 mm, repetir en posiciones distintas y documentar incertidumbre, óptica, MSA Gage R&R, velocidad de cinta y defectos mínimos que se desean detectar.

## Limitaciones para la planta

Dos marcadores verifican aproximadamente una escala lineal, **no corrigen distorsión radial, perspectiva ni inclinación**. Para validez metrológica se necesitan correcciones intrínsecas de lente, homografía/patrón de cuatro o más puntos, mediciones trazables y validación de repetibilidad. El piloto mide en torno a 1 imagen/s: puede pasar por alto defectos cortos. Sin encoder y velocidad conocida no aporta metraje defectuoso, solo tiempo/fotograma. No envía órdenes de rechazo ni señales de seguridad a maquinaria. No afirmar uso industrial acreditado.

Pruebas: node --test tests/strip-core.test.js, python tools_build_portable.py y CI Chromium de tests/smoke_browser.py. Estas pruebas simulan cámara UVC en navegador, no certifican hardware de línea.
