# Juego de Ski en Primera Persona — Diseño (MVP)

**Fecha:** 2026-07-15
**Estado:** Aprobado

## Objetivo

Juego de ski en primera persona, jugable en el navegador de un móvil. El jugador
baja una pista con curvas, árboles y saltos. El objetivo es completar el
circuito en el menor tiempo posible sin caerse.

## Alcance del MVP

- Una sola pista ("Verde", fácil), de ~60–90 segundos de bajada.
- Arquitectura preparada para añadir más pistas después: cada pista es un
  archivo de datos independiente; el motor no cambia.
- Sin backend: mejor tiempo guardado en `localStorage` por pista.

## Stack técnico

- HTML + JavaScript con ES modules. Three.js cargado por CDN mediante import map.
- Sin build step: el juego se sirve como archivos estáticos (`python3 -m http.server`
  o similar) y se abre en el navegador del móvil o del escritorio.

## Estructura de módulos

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Import map, canvas, pantalla de inicio y HUD (DOM) |
| `src/main.js` | Bucle de juego, estados (menú → jugando → meta), wiring de módulos |
| `src/track.js` | Genera la malla de terreno/pista a partir de los datos de una pista |
| `src/player.js` | Física del esquiador, cámara en primera persona, detección de caídas |
| `src/controls.js` | Entrada: táctil (mantener lado izq/dcho), giroscopio, teclado (flechas) |
| `src/hud.js` | Cronómetro, velocidad, mensajes (caída, meta), botón de reinicio |
| `src/tracks/verde.js` | Datos de la pista Verde |

## Definición de pista (formato de datos)

Cada pista exporta un objeto con:

- `name`: nombre visible.
- `controlPoints`: lista de puntos 3D que definen la spline central de la pista,
  descendiendo la montaña (Catmull-Rom vía `THREE.CatmullRomCurve3`).
- `width`: anchura de la pista en metros.
- `obstacles`: lista de `{ type: 'tree' | 'jump', t, offset }` donde `t` es la
  posición a lo largo de la spline (0–1) y `offset` el desplazamiento lateral
  desde el centro (en metros).

El terreno se genera como una malla: para cada muestra de la spline se extruye
una sección transversal (pista lisa en el centro, taludes con árboles densos a
los lados que marcan visualmente el borde).

## Jugabilidad

**Cámara:** primera persona a altura de ojos (~1.7 m sobre los esquís), mirando
en la dirección de movimiento. FOV se abre ligeramente con la velocidad y la
cámara se inclina un poco al girar (sensación de carving).

**Física (arcade, cinemática):**
- La componente de la gravedad a lo largo de la pendiente acelera al jugador.
- Girar cambia el rumbo; el ángulo entre esquís y velocidad produce derrape que
  frena (carvear fuerte = más control, menos velocidad).
- Rozamiento leve y resistencia del aire limitan la velocidad máxima.
- En el aire (tras un salto) no se puede girar: hay que llegar alineado.

**Caída:** ocurre al chocar con un árbol o salir de la pista (más allá del
borde). Efecto: animación breve (cámara cae/pantalla sacude), el jugador queda
detenido ~3 s en el punto de la caída y continúa desde ahí a velocidad cero.
El cronómetro NO se detiene: caerse arruina el tiempo, no termina la partida.

**Saltos:** rampas físicas en la malla. Al despegar, el jugador sigue una
trayectoria balística hasta tocar el suelo. Aterrizar fuera de pista o contra
un árbol cuenta como caída.

**Cronómetro:** arranca al cruzar la línea de salida (el jugador empieza unos
metros antes, parado) y se detiene en la meta. Al terminar se muestra el tiempo
y el mejor tiempo histórico (`localStorage`, clave por pista).

## Controles

Pantalla de inicio con selector de control:
- **Táctil:** mantener pulsado el lado izquierdo/derecho de la pantalla para girar.
- **Giroscopio:** inclinar el teléfono; en iOS se solicita permiso
  (`DeviceOrientationEvent.requestPermission`) con un toque del usuario.
- **Teclado:** flechas izquierda/derecha (para escritorio; siempre activo).

## Pista Verde (MVP)

- ~60–90 s de bajada a ritmo normal.
- Curvas suaves alternadas (eses amplias), 2 saltos pequeños en tramos rectos.
- Árboles densos fuera de la pista y algunos árboles sueltos dentro como
  obstáculos señalizados.

## Manejo de errores

- Si el giroscopio no está disponible o se deniega el permiso, se vuelve al
  control táctil con un aviso.
- Si WebGL no está disponible, mensaje claro en vez de pantalla en blanco.

## Verificación

- Pruebas manuales automatizadas con Playwright (viewport móvil, eventos
  táctiles): la pista se completa, el crono arranca/para correctamente, chocar
  con un árbol produce caída con penalización, el mejor tiempo persiste tras
  recargar.
- Prueba en escritorio con teclado como smoke test rápido.

## Fuera de alcance (futuro)

- Más pistas (media/difícil) y menú de selección.
- Sonido, partículas de nieve, modelos 3D detallados.
- Rankings online.
