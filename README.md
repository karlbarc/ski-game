# Downhill Ski Challenge ⛷️

Juego de ski en primera persona para navegador (móvil y escritorio).
Baja la pista en el menor tiempo posible sin caerte.

Tres pistas, seleccionables en el menú de inicio:
- **Verde** (fácil)
- **Azul** (media: más angosta, curvas cerradas y más obstáculos)
- **Negra** (difícil: 9 m de ancho, más empinada, obstáculos en el centro y 4 saltos)

## Jugar

```bash
npm install
npm run serve
```

Abre http://localhost:8173 (en el móvil: usa la IP local de tu máquina).

- **Táctil:** mantén pulsado el lado izquierdo/derecho de la pantalla para girar.
- **Giroscopio:** inclina el teléfono (requiere aceptar el permiso en iOS).
- **Teclado:** flechas ← →.

Chocar con un árbol, una roca o salirte de la pista termina el intento: se
muestran los metros que avanzaste y toca **Volver a empezar**.
El mejor tiempo y la velocidad máxima se guardan en el navegador.

## Desarrollo

- `npm test` — tests unitarios (física, pista, cronómetro) con `node --test`.
- Las pistas son datos: añade un archivo en `src/tracks/` con puntos de control y obstáculos.

## Verificación e2e

Query params de ayuda: `?autopilot=1` (steering automático) y `?timescale=4` (acelera el tiempo).
