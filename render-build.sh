#!/usr/bin/env bash
# Salir si hay un error
set -o errexit

# Instalar dependencias de Python
pip install -r requirements.txt

# Instalar librerías de sistema necesarias para WeasyPrint en Render
apt-get update && apt-get install -y libpango-1.0-0 libharfbuzz0b libpangoft2-1.0-0