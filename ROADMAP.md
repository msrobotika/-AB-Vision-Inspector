# Hoja de ruta — AB-Vision Inspector

## v0.1 — MVP original (implementado y probado localmente)

- [x] Interfaz de escritorio y móvil en español, responsive, sin CDN.
- [x] Motor matemático JS propio: umbral oscuro/claro y referencia RGB; componentes 4-conexos, cajas delimitadoras y cobertura.
- [x] Carga de imágenes y cámara web del navegador; captura y repetición voluntaria.
- [x] ROI rectangular, tolerancia OK/NOK, overlay anotado.
- [x] Historial efímero, exportación CSV/JSON/PNG, recetas persistidas por navegador.
- [x] Servidor Python local sin dependencias ni API de recepción de imágenes.
- [x] Pruebas automatizadas de algoritmo, servidor y navegador; capturas de UI auténticas.
- [x] MIT, política de seguridad, documentación y avisos legales.

## v0.3 — Calibración y auditoría continua (implementación de laboratorio)

- [x] Cámara IP privada JPEG/MJPEG desde proxy Python loopback con autorización explícita, sin RTSP.
- [x] Medidas nominales, tolerancia ±mm, referencia física de dos marcadores cian y magenta.
- [x] Verificación de marcadores, identidad/configuración de fuente y escala EN CADA FOTOGRAMA.
- [x] Invalidación ante cambios; salida SIN MEDICIÓN en vez de OK; REVISAR por margen mínimo de discretización.
- [x] Exportación de auditoría por medida e imágenes de prueba del caso correcto y bloqueado.
- [ ] Calibración intrínseca multimagen de distorsión de lente y homografía con 4 marcadores para perspectiva.
- [ ] Confirmación automática de foco/exposición y detección de imágenes congeladas y de calidad insuficiente.
- [ ] Validación metrológica con patrón trazable, incertidumbre completa y MSA Gage R&R en banco físico.

## v0.2 — Medición y calidad de imagen (parcial)

- [ ] Ajuste por histograma, iluminación, umbral adaptativo y morfología propia (erosión/dilatación) con vectores de prueba.
- [ ] Control de exposición/enfoque cuando lo permita la API de cámara, calibración px/mm con patrón de longitud conocida.
- [ ] ROI múltiples, edición visual de regiones y nombres de variables; recetas versionadas y migraciones.
- [ ] Guardado de proyectos completos con permisos explícitos, sin retener fotos personales por defecto.
- [ ] Métricas de precisión y regresión con datasets propios auditables (recall, precision, falsos positivos/negativos).

## v0.3 — Inspección industrial (pendiente)

- [ ] Motor de tuberías con reglas y operaciones encadenables, compare de prototipos.
- [ ] Persistencia SQLite opt-in en servicio local con retención y borrado.
- [ ] Integración opcional de solo lectura con AB-Modbus Studio; jamás accionar actuadores con la lógica experimental.
- [ ] Procesamiento de varias cámaras mediante adaptadores bien documentados; pruebas de rendimiento.

## v0.4 — Producto avanzado (pendiente)

- [ ] Perfiles OPC UA/MQTT autorizados y aislamiento por roles (sin control industrial por defecto).
- [ ] Soporte opcional de RTSP/cámaras industriales mediante módulos separados con revisión de licencias.
- [ ] Editor visual de informes compatible con AB-BI Studio.
- [ ] Paquetes Windows/Linux reproducibles, SBOM, firma y publicación de releases.

Las fases futuras no están implementadas. Ningún resultado se considera apto para seguridad funcional sin análisis y validación específica.