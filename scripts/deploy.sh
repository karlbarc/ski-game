#!/bin/bash
# Despliega a GitHub Pages con cache-busting.
#
# Estampa una versión única (timestamp) en el script principal, el import map
# y los imports locales de main.js, de modo que un index.html nuevo siempre
# arrastre módulos nuevos (y uno cacheado use los suyos): nunca se mezclan
# versiones entre despliegues aunque Pages cachee 10 minutos.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Hay cambios sin commitear. Commitea primero y vuelve a ejecutar." >&2
  exit 1
fi

V=$(date +%s)
sed -i '' -E "s|(\./src/main\.js)\?v=[0-9]+|\1?v=$V|" index.html
sed -i '' -E "s|(\./vendor/three\.module\.js)\?v=[0-9]+|\1?v=$V|" index.html
sed -i '' -E "s|(from '\./[^'?]+\.js)\?v=[0-9]+'|\1?v=$V'|g" src/main.js

npm test

git add index.html src/main.js
git commit -m "deploy: v$V"
git push
echo "Desplegado v$V → https://karlbarc.github.io/ski-game/ (~1 min para publicarse)"
