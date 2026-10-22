# -AB-Vision-Inspector · Estado técnico

- **Revisión:** 2026-10-22
- **Estado declarado:** v0.3 alfa · inspección visual de laboratorio
- **Licencia:** MIT en archivo LICENSE
- **Integración continua:** [workflow](../.github/workflows/ci.yml)
- **Capturas ya presentes:** [`docs/screenshots/vision-dashboard.png`](../docs/screenshots/vision-dashboard.png), [`docs/screenshots/vision-mobile.png`](../docs/screenshots/vision-mobile.png), [`docs/screenshots/vision-calibracion-auditada.png`](../docs/screenshots/vision-calibracion-auditada.png), [`docs/screenshots/vision-auditoria-bloqueada.png`](../docs/screenshots/vision-auditoria-bloqueada.png)

## Límites y validación pendiente

La auditoría de cámara con dos referencias no sustituye calibración metrológica trazable. Las capturas se obtienen del producto ejecutado en laboratorio; la reproducción de una imagen no demuestra precisión física o seguridad funcional. Antes de añadir integración industrial, generar pruebas con hardware real y registrar versión del firmware, entorno y condiciones de ensayo.
