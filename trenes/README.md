# 🚆 TrenVivo — trenes de España en tiempo real

Web/app que muestra todos los trenes de Renfe que circulan ahora mismo: su retraso, su próxima parada y la hora
prevista de llegada, con un **panel de estación** como los de los andenes, un **mapa**, una **lista filtrable** y una
pestaña de **incidencias**.

## Cómo arrancarla

Necesitas [Node.js](https://nodejs.org) 18 o superior (no hace falta instalar nada más):

```bash
cd trenes
node server.mjs
```

Abre <http://localhost:8090>. Desde el móvil (en la misma wifi) abre `http://IP-de-tu-ordenador:8090`
y usa "Añadir a pantalla de inicio" para tenerla como app.

Para ver la interfaz con datos simulados: <http://localhost:8090/?demo>.

## Qué muestra

- **Panel de estación**: elige una estación y ves los trenes que van hacia ella, con la hora prevista y su estado
  (EN HORA, +7 MIN, RETRASO 25 MIN parpadeando).
- **Mi provincia**: eliges tu provincia (o pulsas "Usar mi ubicación") y, si quieres, una ciudad o estación.
  Ves los trenes que van a llegar allí con una cuenta atrás ("llega en 12 min") y la hora prevista, y los trenes que
  circulan ahora mismo por la provincia. "Ver en el mapa" te lleva al mapa con la provincia resaltada.
- **Cercanías**: eliges el núcleo (Madrid, Rodalies Catalunya, València, Sevilla, Bilbao, Málaga, Asturias…) y ves
  sus líneas (C1, C2, R2…) con cuántos trenes llevan y su retraso medio. Al tocar una línea ves solo sus trenes, con
  origen, destino, próxima parada y cuánto les falta. En el mapa, los trenes de Cercanías llevan el borde del color
  de su línea y se pueden mostrar u ocultar.
- **Todos los trenes**: búsqueda por número, línea o estación; filtros por tipo (larga/media distancia o Cercanías)
  y por retraso.
- **Mapa**: posición GPS de cada tren, con un color según el retraso (verde, lima, naranja, rojo).
- **Incidencias**: avisos oficiales de Renfe, trenes con más de 15 minutos de retraso y retraso medio por tipo/línea.
- **Vigilar un tren**: toca un tren → "Vigilar" y la app te avisa si su retraso sube 5 minutos o más.
- Se actualiza sola cada 30 segundos.

## De dónde salen los datos

Son datos abiertos de Renfe ([data.renfe.com](https://data.renfe.com)):

| Dato | Fuente |
|---|---|
| Larga y media distancia (posición, retraso, próxima parada) | `tiempo-real.largorecorrido.renfe.com/renfe-visor/flotaLD.json` |
| Cercanías: posición | `gtfsrt.renfe.com/vehicle_positions.json` (GTFS-RT) |
| Cercanías: retrasos | `gtfsrt.renfe.com/trip_updates.json` (GTFS-RT) |
| Cercanías: línea, color, origen, destino y hora en cada parada | horario GTFS de Cercanías (`fomento_transit.zip`) |
| Avisos | `gtfsrt.renfe.com/alerts.json` (GTFS-RT) |
| Mapa, vías y provincias | Natural Earth (dominio público), generado con `tools/generar-mapa.py` |
| Nombres de estaciones | `stops.txt` de los GTFS de Renfe (se descargan una vez al día) |

El navegador no puede pedir esos datos directamente (bloqueo CORS), por eso `server.mjs` hace de intermediario
y guarda en caché las respuestas 15 segundos. Si el servidor no está, la web intenta pedirlos directamente a Renfe;
si tampoco puede, pasa a **MODO DEMO**, y lo indica arriba en naranja.

Para Cercanías, el servidor cruza cada tren en tiempo real con el horario oficial (GTFS) por su id de viaje
o, si no coincide, por su número de tren. La hora de llegada que se muestra es la programada más el retraso
que publica Renfe. El núcleo se deduce de la provincia en la que está el tren.

Para probar el servidor con datos propios, cada fuente se puede sustituir con una variable de entorno, por ejemplo
`FUENTE_cerPosiciones=http://localhost:8000/vp.json node server.mjs`.

Los campos de Renfe no tienen documentación formal, así que la app acepta varios nombres posibles
(`app.js`, funciones `normalizarLD` y `normalizarCercanias`). Si Renfe cambia el formato, el ajuste se hace ahí.

## Aviso importante

Es una herramienta **informativa y no oficial**. Muestra los mismos datos que publica Renfe, así que no detecta
fallos de vía, señales ni averías: la seguridad ferroviaria depende de los sistemas de Adif y Renfe
(ASFA, ERTMS, centros de control). Para viajar, consulta siempre la información oficial.

El mapa usa [Leaflet](https://leafletjs.com) (incluido en `public/vendor`, licencia BSD-2) y teselas de © OpenStreetMap / © CARTO.
