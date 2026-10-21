# Contribuciones

Aceptamos issues reproducibles y pull requests sobre el código original, con pruebas automáticas y documentación. No subas imágenes de clientes, secretos de cámaras, datasets privados, licencias incompatibles ni código extraído de productos propietarios.

Para contribuir: `node --test tests/core.test.js`; `python -m unittest discover -s tests -p 'test_ip_camera.py' -v`; y para UI `python -m unittest discover -s tests -p 'smoke_browser.py' -v` con Playwright instalado.

Toda contribución requiere declarar que puede distribuirse legalmente bajo MIT y respetar atribuciones de terceros.
