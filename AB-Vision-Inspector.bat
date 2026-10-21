@echo off
cd /d "%~dp0"
py -3 serve.py %*
if errorlevel 1 (
  echo Error al iniciar. Comprueba Python 3.11 o superior.
  pause
)
