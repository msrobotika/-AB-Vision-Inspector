# Registro de cambios — AB-Vision Inspector

## 0.3.0 — Auditoría de cámara en cada fotograma

- Motor de medida plana por referencia física, ancho/alto nominal y tolerancia en milímetros.
- Dos fiduciales físicos de color cian y magenta, localización y verificación en cada fotograma.
- Invalida medición ante cambio de resolución/configuración de cámara, pérdida de marcadores, giro, escala y desplazamiento fuera de límites.
- Margen mínimo de discretización en decisión OK/NOK; estado REVISAR ante incertidumbre próxima a tolerancia.
- Medidas inválidas nunca se convierten en OK dimensional; desconexión de cámara invalida estado.
- Entrada de cámara IP JPEG/MJPEG en redes privadas autorizadas, credenciales opcionales y proxy loopback.
- Historial con estado y métricas de auditoría; capturas reales de calibración y bloqueo; pruebas del motor, HTTP y navegador.

Limitación explícita: NO calibra aún distorsión de lente, perspectiva de toda la imagen, error 3D o incertidumbre trazable. No apto para control de proceso crítico sin validación independiente.

## 0.1.0 — Motor de inspección visual inicial

- Motor original de umbrales, defectos y componentes conectados.
- Interfaz local en español, cámara USB, importación, ROI, recetas, exportación e informes básicos.