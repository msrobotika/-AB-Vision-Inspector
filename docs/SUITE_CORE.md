# AB-Vision Inspector → AB-Suite Core

Adaptador de nuestro formato JSON nativo: no duplica el motor de segmentación ni capta imágenes, cámaras o credenciales.

## Puesta en marcha

1. Arranca AB-Suite Core en el mismo PC con npm start desde su repositorio.
2. Desde AB-Vision Inspector selecciona Historial → Exportar JSON. Obtendrás AB-Vision-historial.json.
3. Usa el token efímero de la aplicación ab-vision-inspector que imprime Core.
4. En PowerShell, desde la carpeta de AB-Vision Inspector:

    $env:AB_VISION_TOKEN = "<TOKEN_AB_VISION>"
    python tools/suite_bridge.py --history AB-Vision-historial.json

Prueba sin publicar eventos:

    python tools/suite_bridge.py --history AB-Vision-historial.json --dry-run

El adaptador conecta exclusivamente con 127.0.0.1 (HTTP) y publica mediante POST /v1/events, autorizado por token. No controla maquinaria, PLC ni cámaras.

## Datos y seguridad

Publica vision.inspection.result, con image_id (identificador de registro, NO hash de píxeles), passed, defects, calidad visual y dimensional, auditoría y magnitudes metrológicas seleccionadas.

passed=true solamente cuando veredicto visual/final OK, auditoría VERIFIED y medición dimensional OK. Una cámara sin auditoría verificada se clasifica REVIEW_UNVERIFIED, nunca como OK metrológico. No implica certificación de medida: la auditoría con dos marcadores sigue siendo experimental.

Se excluyen IP/URL de cámara, sourceIdentity, lote, boxes, imágenes y credenciales. No se retransmiten fotogramas.

## Duplicados y límites

El checkpoint local .ab-vision-suite-checkpoint.json contiene trace_id de eventos confirmados HTTP 201, sin secretos ni imágenes. Reimportar el mismo archivo no duplica eventos. Si se elimina el checkpoint, el bus no garantiza entrega exactamente una vez. El archivo queda ignorado por Git.

El programa recibe HISTORIALES EXPORTADOS por el usuario, no inspección continua en directo desde la pestaña. Para streaming futuro hace falta un canal local autenticado y consentimiento; nunca CORS abierto a una red industrial.

Repositorio de Core: https://github.com/msrobotika/AB-Suite-Core-arquitectura-de-integraci-n
