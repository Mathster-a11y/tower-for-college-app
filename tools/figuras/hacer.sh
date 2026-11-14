#!/bin/sh
# Rehace las figuras de la planilla (src/assets/figuras): dibujo → HTML → PNG 2× → PNG con paleta.
# Necesita python3 (con Pillow y numpy) y node con playwright. Correr desde la raíz del repositorio: sh tools/figuras/hacer.sh
set -e
cd "$(dirname "$0")"
rm -rf .salida && mkdir .salida
python3 figs.py .salida
node render.cjs .salida
python3 cuantizar.py .salida ../../src/assets/figuras
cp .salida/figuras.json ../../src/assets/figuras/figuras.json
