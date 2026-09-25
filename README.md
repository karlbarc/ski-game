# Downhill Ski Challenge ⛷️

Juego de ski en primera persona para navegador (móvil y escritorio).
Baja la pista en el menor tiempo posible sin caerte.

Cuatro pistas, seleccionables en el menú de inicio:
- **Verde** (fácil)
- **Azul** (media: más angosta, curvas cerradas y más obstáculos)
- **Negra** (difícil: 9 m de ancho, más empinada, obstáculos en el centro y 4 saltos)
- **Alpina** (media: descenso largo de pendiente variable, palas, travesía y eses amplias; 18 m de ancho, rocas y 3 saltos opcionales)

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

## Desplegar en Vercel

```bash
npm run build
npm run deploy:vercel
```

La primera vez, inicia sesión en Vercel y vincula o crea el proyecto `ski-game`.
`vercel.json` configura la compilación y publica únicamente `dist/`, que contiene
el HTML, los módulos del juego, los sonidos, la fuente y Three.js.
El ranking usa el proyecto de Supabase configurado en `src/supabase-client.js`.
También puedes importar el repositorio desde Vercel; la configuración se detecta
automáticamente. `npm run deploy` conserva el despliegue existente a GitHub Pages.

## Acceso con Google

Los invitados pueden jugar; publicar en el ranking requiere Google. Consulta
[la configuración de OAuth](docs/google-auth.md) para activar el proveedor y las
URLs de retorno en Supabase. No se necesitan secretos en Vercel.

## Pruebas

- `npm test` — tests unitarios (física, pista, cronómetro) con `node --test`.
- Las pistas son datos: añade un archivo en `src/tracks/` con puntos de control y obstáculos.

## Verificación e2e

Query params de ayuda: `?autopilot=1` (steering automático) y `?timescale=4` (acelera el tiempo).
