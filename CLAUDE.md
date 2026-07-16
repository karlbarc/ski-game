# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Juego de ski en primera persona para navegador (móvil y escritorio), en español. Vanilla JS con módulos ES nativos — sin bundler ni framework. La única dependencia es `three`, resuelta vía importmap en `index.html` apuntando a `node_modules`. Comentarios de código y textos de UI en español; mantener ese idioma.

## Comandos

```bash
npm run serve                      # servidor de desarrollo en http://localhost:8173
npm test                           # todos los tests (node --test tests/*.test.mjs)
node --test tests/player.test.mjs  # un solo archivo de tests
```

- `scripts/serve.py` es un servidor estático sin caché (`Cache-Control: no-store`) — usar este y no `python3 -m http.server`, que deja módulos JS viejos en caché del navegador.
- Verificación e2e manual: query params `?autopilot=1` (steering automático que esquiva obstáculos) y `?timescale=4` (acelera el tiempo). Combinables: `http://localhost:8173/?autopilot=1&timescale=4`.

## Arquitectura

Separación estricta entre simulación pura (testeable en Node, sin DOM ni Three.js en los tests) y presentación:

- **Simulación pura** — funciones que reciben estado y devuelven estado nuevo (inmutable, sin efectos):
  - `src/player.js` — física del esquiador (`stepPlayer`), constantes de tuning en `PARAMS` (gravedad, carving, tuck, rampas...). Colisiones con obstáculos, caídas y saltos viven aquí.
  - `src/race.js` — máquina de estados del crono (`ready → running → finished`, con pausa que desplaza `startTime`).
  - `src/controls.js` — `combineSteer` mezcla teclado/táctil/giroscopio (gana el de mayor magnitud).
  - `src/track.js` — `buildTrack(data)` convierte datos de pista en una curva Catmull-Rom muestreada en 800 frames con curvatura con signo. Incluye `mulberry32` (RNG determinista para el bosque decorativo).
- **Presentación / integración**:
  - `src/main.js` — todo lo de Three.js: escena, geometrías procedurales (skis, árboles, rocas, rampas, cielo, montañas), cámara, game loop (`tick`), autopilot, y el cableado de overlays/estado de juego.
  - `src/hud.js` — manipulación del DOM del HUD (crono, velocidad, mensajes, pantalla de meta). Los elementos y estilos están en `index.html`.
  - `src/audio.js` — sonido procedural de nieve con Web Audio (sin assets). Debe arrancarse desde un gesto del usuario (requisito iOS).

### Sistema de coordenadas de pista

Toda la física opera en espacio de pista: `s` (metros a lo largo de la curva), `lat` (desplazamiento lateral en metros, positivo a la izquierda), `height` (altura sobre la nieve). `track.frameAt(s)` da posición/tangente/lado/curvatura; `track.toWorld(s, lat, height)` convierte a coordenadas de mundo para renderizar. El heading del jugador es relativo a la tangente de la pista: al avanzar, `heading -= curvature * ds` (la pista "gira bajo el jugador").

### Las pistas son datos

Cada pista es un archivo en `src/tracks/` (`verde.js`, `azul.js`) con `{ name, width, controlPoints, obstacles }`. Los obstáculos se definen con `t` (fracción 0–1 de la longitud) y `offset` (lateral); `buildTrack` los convierte a `{ s, lat }`. Tipos: `tree` (con `variant: 'tall'` opcional), `rock`, `jump`. Para añadir una pista: crear el archivo de datos y añadir tests como `tests/azul.test.mjs` (validan que los obstáculos caben en la pista, separación entre ellos, etc.).

### Decisiones de diseño a respetar

- La penalización por caída es el tiempo de reacción del jugador: el crono sigue corriendo hasta que pulsa **Continuar**; `recoverPlayer` solo cambia `fallen`, y `fall()` recoloca al jugador detrás y al lado del obstáculo para no rechocar.
- El juego se auto-pausa al perder el foco de la ventana (el crono no debe correr solo).
- Récords (mejor tiempo, velocidad máxima) se guardan en `localStorage`.

## Documentación

Specs y planes de implementación en `docs/superpowers/specs/` y `docs/superpowers/plans/`.
