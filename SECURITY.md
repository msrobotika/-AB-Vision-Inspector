# Seguridad y privacidad

- La aplicación se sirve únicamente en IPv4 `127.0.0.1` y no abre puertos accesibles en red.
- El servidor acepta GET de recursos estáticos y un único POST autenticado para solicitar fotogramas JPEG/MJPEG de cámaras IPv4 privadas expresamente autorizadas. No acepta subida de imágenes ni escritura de recetas desde red.
- Los datos de cámara USB y fotos se procesan en Canvas. Los JPEG/MJPEG de cámaras IP pasan por la conexión directa cámara → servidor HTTP local → navegador; no se envían a servicios externos. La conexión HTTP Basic no cifra credenciales en LAN: usar HTTPS cuando la cámara disponga de certificado válido y red aislada.
- El navegador solicita acceso a cámara explícitamente; la app detiene las pistas al apagar la cámara o abandonar la página.
- Las recetas no incluyen imagen ni referencia, y se guardan en `localStorage` (si el navegador lo permite).
- El histórico e imágenes de referencia permanecen solo en memoria de la pestaña salvo exportación solicitada por el usuario.
- Se establecen CSP, `nosniff`, política de permisos de cámara y `no-referrer` para contenido servido localmente.
- Ninguna acción se conecta a PLC ni envía instrucciones a máquinas o robots. Un resultado OK/NOK no puede utilizarse para control de seguridad.
- No se promete compatibilidad con redes empresariales, Internet, autenticación multicliente, firma digital ni aislamiento contra extensiones del navegador.
- No usar imágenes personales o médicas en equipos compartidos sin comprobar las políticas de sesión y seguridad de ese navegador.

**Divulgación responsable:** abre un issue en el repositorio sin datos sensibles; evita publicar exploits activos o imágenes privadas. Para avisos críticos, contacta con el mantenedor de MS ROBOTIKA mediante un canal privado.

## Auditoría dimensional v0.3

Ninguna marca detectada o identificación de fuente modificada debe devolver OK dimensional. Las cámaras IP se seleccionan manualmente; su IP o URL no autentican criptográficamente el modelo real. La auditoría de dos marcadores no detecta todos los errores de perspectiva, deformación o lente; usar únicamente en laboratorio hasta contrastar con un sistema de medida calibrado. Nunca conectar el resultado a un actuador, control de seguridad o expulsor sin ingeniería y certificación independiente.