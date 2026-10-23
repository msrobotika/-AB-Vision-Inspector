# AB-Vision Inspector

> **Ficha del proyecto · MS ROBOTIKA**  
> **Estado:** v0.3 alfa · inspección visual de laboratorio · **Licencia:** MIT (archivo LICENSE)  
> [**Capturas verificables**](docs/screenshots/) · [Pruebas/CI](https://github.com/msrobotika/-AB-Vision-Inspector/actions) · [Estado técnico](docs/PROJECT_STATUS.md)  
> **Límite:** La auditoría de cámara con dos referencias no sustituye calibración metrológica trazable.

**MS ROBOTIKA · Software libre · Inspección visual local · Windows / Linux · 0.3.0 (alfa de laboratorio)**

Aplicación original para inspeccionar imágenes y cámaras locales mediante umbrales, segmentación y componentes conectados. Motor matemático propio en JavaScript sin bibliotecas de visión artificial ni servicios en la nube. El análisis se ejecuta **en el navegador**. El servidor Python solo entrega el frontend y puede obtener bajo autorización explícita fotogramas de cámaras IP privadas.

![AB-Vision Inspector funcionando: cuatro defectos identificados](docs/screenshots/vision-dashboard.png)

[Captura móvil real](docs/screenshots/vision-mobile.png) · [Auditoría de calibración](docs/screenshots/vision-calibracion-auditada.png) · [Bloqueo por pérdida de patrón](docs/screenshots/vision-auditoria-bloqueada.png) · [Hoja de ruta](ROADMAP.md) · [Seguridad](SECURITY.md) · [Licencia MIT](LICENSE)

## Abrir sin instalar nada (edición portable HTML)

El archivo [**AB-Vision-Inspector-PORTABLE.html**](AB-Vision-Inspector-PORTABLE.html) contiene HTML, estilos y motor JavaScript en una sola pieza. Ábrelo con doble clic: **importación de fotos, demostración y análisis funcionan sin Python ni red**. Para utilizar la cámara con permisos consistentes entre navegadores, es preferible la edición con servidor local indicada a continuación. El HTML se genera reproduciblemente ejecutando `python tools_build_portable.py` y no necesita bibliotecas externas.

## Empezar con tu montaje: 3 tiras de 50 ±2 mm

La aplicación ya permite **1 a 4 tiras, webcam USB y cámara IP JPEG/MJPEG**, pero todavía no está validada para producción. En el visor, pulsa **Montaje real de ejemplo: 3 × 50 ± 2 mm** para preparar una receta de 3 tiras, nominal 50 mm, tolerancia ±2 mm, marcadores separados 100 mm y altura nominal de 800 mm. **No se genera ninguna calibración válida al pulsar el botón**: primero debes conectar una cámara y medir físicamente la referencia.

**Importante:** si esas distancias no caben en el campo de visión calculado en píxeles, el programa bloquea la calibración con un error explícito en lugar de forzar un OK. La imagen de ejemplo con flechas y textos es un **dibujo orientativo, no una imagen calibrable a escala**. La referencia debe ser coplanar con la superficie superior de goma, y los cambios de receta obligan a recalibrar.

[**Guía del montaje cenital y comprobación de campo de visión**](docs/MONTAJE_CENITAL_3X50.md) · [**Descargar visor HTML portátil (Raw)**](https://raw.githubusercontent.com/msrobotika/-AB-Vision-Inspector/main/AB-Vision-Inspector-PORTABLE.html) · [**Repositorio de visor HTML**](AB-Vision-Inspector-PORTABLE.html).

**Para activar una webcam con permisos fiables:** ejecuta `python serve.py` y abre su dirección `http://127.0.0.1:<puerto>/`. GitHub muestra el código fuente HTML y puede descargarlo; no significa que haya una demo pública Pages activa. La webcam desde HTML local (`file://`) depende del navegador. RTSP no está implementado.

### ¿Por qué GitHub no muestra un visor HTML interactivo al abrir el archivo?

El enlace **Blob/Raw** es una descarga del HTML, no un hosting de la aplicación. Ya existe la acción de publicación de **demo estática** en [deploy-demo-pages.yml](.github/workflows/deploy-demo-pages.yml), pero necesita que el propietario habilite GitHub Pages manualmente: **Settings → Pages → Build and deployment → Source: GitHub Actions**, luego **Actions → Publish browser-only Vision demo (manual, owner approval) → Run workflow (main)**. No anunciar la URL como accesible hasta que termine la acción y se compruebe en navegador.

La página estática puede pedir permiso de webcam por HTTPS; **no incluye el servidor Python ni su puente de cámara IP**. Para cámaras IP usa localhost según la guía. No publicar credenciales, direcciones OT ni capturas reales de planta en GitHub Pages.

## Nuevo laboratorio: medición continua de tiras de goma (piloto experimental)

**Prueba inmediata con visor HTML:** [Descargar AB-Vision-Inspector-PORTABLE.html](https://github.com/msrobotika/-AB-Vision-Inspector/raw/refs/heads/main/AB-Vision-Inspector-PORTABLE.html). Guarda el archivo y ábrelo localmente en Chrome/Edge. En el panel **«Tiras de goma · control de ancho»**, elige entre **1, 2, 3 o 4 tiras**, pulsa **«Cinta demo (1–4)»** y después **«Detectar patrón y calibrar muestra»**. Verás las anchuras por tira en mm y estado OK. Pulsa **«Simular variación de ancho»** para provocar NOK y exporta el CSV.

> La imagen inicial es sintética. No hay cámara física ni certificación dimensional en esta demostración. En el archivo HTML local pueden estar limitados los permisos de cámara según el navegador. Para la **webcam USB/cámara por cable**, utiliza preferentemente \`python serve.py\` y el botón «Iniciar cámara» en \`http://127.0.0.1\`. Para **cámara IP** utiliza el panel JPEG/MJPEG con autorización expresa, dirección IPv4 privada y el servidor Python; RTSP no se reproduce directamente en HTML.

### Montaje cenital sobre cinta transportadora

1. Fija la cámara y la iluminación con rigidez. Centra las 1–4 tiras en el campo visual, sin solapamientos; la anchura se mide horizontalmente y la cinta avanza en vertical en la imagen. Si avanza en otro sentido, orienta físicamente la cámara o la imagen antes de calibrar.
2. Sitúa **dos fiduciales físicos visibles CIAN y MAGENTA** junto a las tiras, **en el mismo plano de medición**, con distancia **centro a centro medida independientemente**. Introduce esta longitud en mm, distancia cámara-plano real, ancho nominal y tolerancia ± fijada por laboratorio/químicos.
3. Conecta cámara USB (getUserMedia en localhost) o IP JPEG/MJPEG privada. Selecciona la ROI arrastrando en el visor si es necesario y ajusta el contraste «tiras oscuras sobre cinta clara» o al contrario. Pulsa **«Detectar patrón y calibrar muestra»**: reconoce automáticamente los dos marcadores, calcula escala mm/píxel, aprende la posición de los carriles y mide la anchura de la primera muestra.
4. Pulsa **«Continuo: ON»**: aproximadamente un fotograma/s, con medición de cinco cortes transversales por tira. Se comprueban **de nuevo ambos marcadores** en cada imagen y se compara mínimo/máximo/medio con ancho nominal y tolerancia por tira. Estados **OK, NOK, REVISAR, SIN MEDICIÓN**. Variaciones de escala/foco/posición, falta de referencia, número incorrecto de tiras o ROI cortada bloquean el resultado dimensional.
5. **Guardar receta local** permite recuperar producto, número de tiras, ancho, tolerancia, umbral, contraste y ROI; también importar/exportar JSON. **No se conserva una calibración válida tras cargar receta**: hay que verificar de nuevo los marcadores. Descarga CSV de fechas UTC y medidas, o PNG anotado manual. Hasta 1000 lecturas en RAM; no es un historiador persistente.

**Oscilaciones normales de la goma:** el seguimiento NO exige que una tira permanezca en una columna X fija. En cada imagen, las tiras se identifican de izquierda a derecha y se sigue su línea central, aunque se desplacen lateralmente. El ancho se estima **perpendicular a la dirección local de la tira**, para no confundir una inclinación moderada con un ensanchamiento. El desplazamiento lateral se registra solo como contexto, **nunca es por sí solo motivo de NOK/REVISAR**. Si una tira abandona el campo de visión, se cruza/solapa con otra o su trayectoria no se puede medir, el resultado será **SIN MEDICIÓN**. La demo incluye «Simular oscilación lateral»: debe continuar en OK mientras la anchura permanezca constante, y ponerse NOK cuando se active una variación real de ancho. El piloto actual toma ~1 imagen/s y no garantiza captar todos los defectos breves de una línea rápida: exige evaluación con FPS, velocidad y/o encoder reales.

**Límite metrológico:** el ancho nominal de la muestra no permite calibrar y verificar esa misma anchura de forma independiente. La referencia física resuelve la escala; aun así faltan corrección intrínseca de lente, perspectiva/homografía, MSA Gage R&R y contraste con patrones trazables de distintos anchos. La incertidumbre indicada en software es orientativa (centroides + bordes), **no acreditada**. Sin encoder no se calcula longitud real ni metraje defectuoso, solo serie temporal. Sin ensayos físicos no automatizar rechazo ni usar como señal de seguridad.

**Limitación de red:** cámara IP HTTP/HTTPS JPEG/MJPEG por acceso local a IPv4 privada validada. Una cámara IP solo RTSP/ONVIF requiere un puente seguro autorizado adicional (no implementado). No se abre acceso a Internet, no se almacenan contraseñas en recetas y ninguna operación escribe en PLC.

El piloto tiene pruebas automatizadas de 1–4 tiras, ensanchamiento, incertidumbre y pérdida de patrón, y pruebas Chromium del visor portable. [Estado y protocolo de la prueba](docs/STRIP_METROLOGY_PILOT.md).

## Arranque sencillo

- Windows: descomprime el proyecto y abre `AB-Vision-Inspector.bat` (requiere Python 3.11 o superior).
- Linux: `sh AB-Vision-Inspector.sh` o `python3 serve.py`.
- Multiplataforma: `python serve.py`; se abre `http://127.0.0.1:<puerto>/` en el navegador. Con `python serve.py --no-browser` imprime la URL sin abrirla.
- El **código fuente no es un EXE** ni un instalador. No necesita `pip install` para funcionar; no necesita conexión a Internet.
- Pulsa **Cargar demostración** y después **Analizar imagen**. La prueba sintética incluida contiene cuatro defectos oscuros y el resultado predeterminado es **NOK**. Si cambias «máximo de defectos permitidos» a `5`, el resultado será **OK**.

Para webcam USB, la cámara solicita el permiso correspondiente al navegador; Chrome, Edge y Firefox modernos ofrecen `getUserMedia` con `localhost` como origen fiable. Si el dispositivo no tiene cámara o deniega permiso, la importación de imágenes continúa funcionando.

## Calibración auditable de la cámara y metrología (v0.3)

La medición dimensional **solo se considera válida mientras el patrón físico sea visible en el fotograma actual**. Para calibrar, fija dos marcadores circulares rígidos **CIAN y MAGENTA** en el MISMO plano que la pieza (evitando perspectiva y distorsión), con separación física medida independientemente. Indica en mm su separación centro a centro, la distancia nominal al plano y dimensiones/tolerancias de la pieza. Captura la cámara y marca los centros **primero cian, después magenta**. El sistema localiza ambos marcadores por su color y comprueba la separación en píxeles.

En **cada fotograma** la auditoría vuelve a buscar los marcadores y comprueba: misma fuente/cadena de configuración (tipo, ID disponible, zoom/foco disponible, IP/puerto/ruta y dimensiones nativas), mismas dimensiones de análisis, presencia y forma básica de las marcas, deriva de escala máxima 0,5 %, giro máximo 2° y desplazamiento máximo 12 px. Los umbrales son conservadores de demostración, no límites certificados. Si falla cualquier comprobación: **SIN MEDICIÓN**, no un OK dimensional. Si la tolerancia coincide con el margen mínimo estimado a partir de 3 píxeles, el resultado es **INDETERMINADO / REVISAR**. El resultado de defectos visuales aparece separado del resultado dimensional.

**Condiciones indispensables:** cámara rígidamente fijada; patrón rígido y coplanar con la pieza, permanentemente visible; iluminación reproducible; foco/zoom estables. Dos fiduciales detectan determinadas derivas pero **NO garantizan por sí solos precisión industrial**: no compensan distorsión radial de la óptica, perspectiva fuera de ese segmento, curvatura, vibración de alta frecuencia, desenfoque, cambio de exposición ni suplantación de dispositivo IP. La estimación de 3 píxeles NO es una incertidumbre total trazable. Para tolerancias ajustadas se requieren calibración intrínseca con patrón de tablero, homografía con ≥4 puntos, patrón metrológico trazable y estudio de repetibilidad/reproducibilidad (MSA/Gage R&R) y validación contra calibre independiente antes de usarlo en producción. No se ofrece automatización de rechazo ni funcionalidad de seguridad.

Las recetas guardan valores nominales y el patrón, **no restablecen una calibración aceptada** después de reiniciar o cambiar de cámara: hay que recalibrar físicamente. Las capturas de `docs/screenshots/vision-calibracion-auditada.png` y `vision-auditoria-bloqueada.png` muestran resultados reales en Chromium con patrón sintético, no una certificación industrial.

**Cámara IP:** edición servidor `python serve.py`, origen IP privado RFC1918, usuario y contraseña Basic opcionales, HTTP(S) JPEG y MJPEG. IP explícitamente autorizada por el operador. El servidor es local y no sigue redirecciones; RTSP y ONVIF aún no. La versión portátil HTML no incluye proxy de cámara IP. No se guardan contraseñas.

## Funciones implementadas

- Entrada PNG/JPEG/WebP/BMP y cámara accesible desde el navegador; captura manual o repetición cada ~1,5 s.
- Segmentación de zonas oscuras, zonas claras o **diferencias RGB frente a un patrón** capturado en memoria (requiere misma dimensión/alineación).
- Algoritmo original de componentes conexas en cuatro direcciones con coordenadas, área, caja delimitadora, cobertura y máscara semitransparente.
- Región de interés (ROI) rectangular dibujada con el ratón o pantalla táctil. Límite de 2 millones de píxeles procesados por análisis.
- Receta con umbral, área mínima y tolerancia de defectos; validación, guardado local y JSON de intercambio.
- Veredicto OK/NOK, duración medida, historial de sesión de 500 inspecciones y exportación CSV/JSON e imagen anotada PNG.
- Interfaz original adaptable a escritorio y móvil, en español, sin CDN, cuentas, telemetría ni servicios externos.
- Servidor local Python estándar (`127.0.0.1`): adquisición opcional de JPEG/MJPEG desde la IP privada de la cámara y procesamiento en navegador, sin nube ni conexión a PLC.

## Pruebas reproducibles

```sh
node --test tests/core.test.js
python -m unittest discover -s tests -p 'test_ip_camera.py' -v
```

Para la prueba visual y las capturas, instala Playwright solo en el entorno de desarrollo (no forma parte del producto):

```sh
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python -m unittest discover -s tests -p 'smoke_browser.py' -v
```

En este entorno de comprobación las navegaciones directas a localhost en Chromium están bloqueadas por políticas administrativas. La prueba visual carga **los mismos HTML/CSS/JS reales** dentro del navegador sin mocks y hace la prueba HTTP del servidor separadamente. Las dos imágenes incluidas son capturas del navegador real evaluando una muestra sintética, no diseños generados.

## Arquitectura

```text
AB-Vision Inspector
├── serve.py                 servidor HTTP loopback sin dependencias
├── index.html               interfaz propia en español
├── src/style.css            tema adaptable
├── src/app.js               carga de imágenes/cámara, ROI, recetas, UI, CSV/PNG
├── src/vision-core.js       motor independiente de segmentación y regiones
├── tests/                   pruebas de motor, servidor y navegador
├── docs/screenshots/        capturas REALES incluidas en el repositorio
└── ROADMAP.md               fases futuras
```

## Estado y límites

**No es un sustituto certificado de software de metrología o seguridad industrial.** La calibración con dos marcas se audita en cada fotograma, pero es una aproximación plana no certificada. No incluye calibración intrínseca completa de cámara, homografía, medición 3D, control de enfoque certificado, aprendizaje automático entrenado, RTSP, cámaras GigE, sincronización industrial, PLC, base de datos ni rechazo automático.

La sensibilidad depende de iluminación, posición, vibraciones, enfoque y escalado. Antes de utilizarlo en una línea real deben efectuarse pruebas con muestras representativas, validación de tasas de falso positivo/negativo, análisis de riesgos y protocolos de calidad. Ninguna decisión de seguridad o rechazo de piezas puede depender de esta versión alfa.

## Repositorio público

Fuente, capturas y versiones: https://github.com/msrobotika/-AB-Vision-Inspector.
Este es el repositorio creado por el usuario (con guion inicial en su nombre).

## Origen y derechos

Código, algoritmo de componentes, ilustración de demostración, diseño, estilos y documentos realizados para **AB-Vision Inspector**; no se han incorporado archivos de aplicaciones comerciales ni plantillas extraídas de terceros. La aplicación es software libre bajo MIT. Las herramientas opcionales para desarrollo (Node.js, Python, Playwright y navegadores) mantienen sus licencias originales. Véase [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) y [LEGAL.md](LEGAL.md).

**MIT no garantiza ausencia de derechos de terceros, patentes o litigios.** Una publicación comercial debería pasar revisión jurídica y auditoría de licencias. Este código se preparó con asistencia de IA, que debe revisarse por el titular antes de una distribución comercial.

Copyright © 2026 MS ROBOTIKA. [Licencia MIT](LICENSE).
## Resultados de inspección hacia AB-Suite Core

Nuestro nuevo adaptador Python tools/suite_bridge.py publica eventos de calidad a partir del historial JSON que exporta el programa, sin replicar el motor de visión. Omite fuentes, IP, credenciales e imágenes; conserva estados de auditoría y medidas seleccionadas. Una medición no auditada nunca se publica como resultado metrológico OK.

[Instrucciones y límites](docs/SUITE_CORE.md). No es streaming directo ni controla maquinaria.
