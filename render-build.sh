#!/usr/bin/env bash
# exit on error
set -o errexit

# Actualizar pip e instalar librerías de Python
pip install --upgrade pip
pip install -r requirements.txt

# Instalación de librerías de sistema para WeasyPrint
# Estas son las 4 necesarias para que Cairo y Pango funcionen en Render
apt-get update && apt-get install -y \
  libpango-1.0-0 \
  libharfbuzz0b \
  libpangoft2-1.0-0 \
  libpangocairo-1.0-0