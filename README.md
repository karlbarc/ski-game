# Downhill Ski Challenge ⛷️

Juego de ski en primera persona para navegador (móvil y escritorio).
Baja la pista en el menor tiempo posible sin caerte.

Elige una categoría y recorre sus pistas en un carrusel horizontal, ordenado por
`difficultyLevel`. En **Obstáculos**, completar Verde desbloquea Azul y completar
Azul desbloquea Roja; completar Roja desbloquea Negra. **Recreativas** empieza con Alpina disponible. Las marcas
guardadas en este navegador cuentan como pistas completadas; las bajadas de
prueba con autopilot o velocidad alterada no desbloquean pistas.

Nueve pistas:

- **Verde** (fácil)
- **Azul** (media: más angosta, curvas cerradas y más obstáculos)
- **Roja** (avanzada: 11 m de ancho, eses encadenadas, pendiente intermedia y 3 saltos)
- **Negra** (difícil: 9 m de ancho, más empinada, obstáculos en el centro y 4 saltos)
- **Alpina** (media: descenso largo de pendiente variable, palas, travesía y eses amplias; 18 m de ancho, rocas y 3 saltos opcionales)
- **Inicial** (Slalom nivel 1: 10 banderines y giros suaves)
- **Intermedia** (Slalom nivel 2: 12 banderines y pendiente variable)
- **Avanzada** (Slalom nivel 3: 18 banderines más juntos y giros amplios)
- **Experto** (Slalom nivel 4: 24 banderines muy juntos, mayor pendiente y cambios de pendiente continuos)

En Slalom, rodea cada banderín por el exterior indicado por su flecha, dentro
de la pista y en sentido de bajada. El resultado es el tiempo de bajada en
segundos más las penalizaciones: tocar un palo suma 2 s; omitir una puerta,
cruzarla por el lado incorrecto o en sentido contrario suma 50 s. Cada puerta
recibe como máximo una sanción de 50 s, que sustituye un toque previo.
El marcador muestra las penalizaciones y la siguiente dirección; al llegar
se desglosan el tiempo y las sanciones. Los récords y el ranking usan el total.

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
- Las pistas son datos: añade un archivo en `src/tracks/` con puntos de control, obstáculos, `category` y `difficultyLevel`, y regístralo en `src/track-catalog.js`. Las nuevas categorías se declaran en `CATEGORIES`; el orden y el requisito anterior se calculan automáticamente.

## Verificación e2e

Query params de ayuda: `?autopilot=1` (steering automático) y `?timescale=4` (acelera el tiempo).

El botón **📹** durante la carrera y la opción **Cámara** de la pausa permiten elegir entre primera persona (predeterminada) y vista trasera con un esquiador creado en Three.js. La elección se conserva en este navegador.
