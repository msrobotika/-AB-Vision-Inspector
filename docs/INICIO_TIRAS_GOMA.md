# Puesta en marcha hoy — 1 a 4 tiras de goma

MS ROBOTIKA · AB-Vision Inspector v0.3 alfa. Laboratorio de visión, no metrología certificada.

## 1. Probar ahora SIN cámara

Descarga el archivo **AB-Vision-Inspector-PORTABLE.html** desde GitHub con "Download raw file" y ábrelo en Chrome/Edge (no lo abras con el visor de código).

En **Tiras de goma** selecciona 1, 2, 3 o 4 tiras. Pulsa **Cinta demo (1–4)** y luego **Detectar patrón y calibrar muestra**. Deben aparecer anchos ~10 mm y estado OK. Pulsa **Simular variación de ancho** para forzar NOK, o **Simular oscilación lateral** para comprobar que moverse sin variar el ancho sigue dando OK. Activa **Continuo: ON**: mide aproximadamente 1 fotograma por segundo y añade lecturas al historial. Descarga el CSV y un PNG anotado bajo petición.

## 2. Probar webcam USB/cable con Python 3.11+

Descarga "Code > Download ZIP" del repositorio. Descomprime y ejecuta en la carpeta del proyecto:

    python serve.py

El servidor imprime la URL localhost; abre esa URL en Chrome/Edge. Pulsa **Iniciar cámara** y acepta el permiso.

Sitúa la cámara firmemente de forma cenital/perpendicular sobre la cinta, con iluminación difusa. Es obligatorio colocar **dos fiduciales físicos CIAN y MAGENTA** fijos, visibles y con centros separados una distancia **medida físicamente en mm**, en el mismo plano de la superficie de goma. Introduce esa separación y la altura cámara-plano, además de número de tiras, anchura nominal y tolerancia ± especificadas por química/calidad.

Selecciona la ROI que contiene tiras completas y pulsa **Detectar patrón y calibrar muestra**. Con webcam o IP activa se captura un fotograma **nuevo**, no la imagen anterior a colocar el patrón. Después activa continuo y observa mínimo, máximo, media, auditoría de marcador y dictamen.

## 3. Cámara IP sobre cinta

El servidor admite cámaras de LAN IPv4 privada autorizadas que entreguen **HTTP(S) JPEG/MJPEG**, con ruta de snapshot y credenciales Basic, si las requiere. No almacena credenciales en recetas.

RTSP/H.264 u ONVIF sin snapshot JPEG requieren un **puente local autorizado** adicional, que este piloto todavía no incluye. No expongas cámaras ni servicios industriales a Internet.

## 4. Recetas y trazabilidad

Guarda ID, número de tiras (1–4), ancho nominal, tolerancia ± en mm, referencia física, altura, ROI, polaridad y umbral. Las recetas pueden recuperarse del navegador o exportarse/importarse como JSON. **Cargar una receta no habilita la escala:** es necesario volver a comprobar los marcadores y recalibrar.

El CSV registra instante UTC, fuente sin contraseña ni IP, fotograma, resultado, causa, estado por tira, desviación, media, mínima y máxima por carril, escala e incertidumbre orientativa, más nominal/tolerancia y referencia física. Hasta 1000 registros en RAM; exporta antes de cerrar. El PNG anotado se descarga manualmente.

Una tira que oscila lateralmente no es NOK mientras conserve su anchura. Si sale de la ROI o se superpone, el estado es SIN MEDICIÓN. Sin encoder no se identifica la longitud/metro defectuoso, solo el instante del fotograma.

## 5. Límites antes de una planta real

Se necesitan patrones trazables en distintas zonas de imagen, corrección óptica y homografía, validación de precisión y Gage R&R, definición de longitud mínima de defecto y relación FPS/velocidad de cinta, iluminación estable y validación independiente de umbral. Aproximadamente **1 fps no garantiza detectar todos los defectos breves**. No utilizar para parada ni rechazo automático ni certificación industrial hasta completar ensayos.

Más detalle: [STRIP_METROLOGY_PILOT.md](STRIP_METROLOGY_PILOT.md).
