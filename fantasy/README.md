# Liga Fantasy Colmenar Viejo

Liga fantasy de fútbol del Colmenar Viejo Cadete D: los jugadores del mercado sois vosotros.

1. **Inscripción:** cada uno abre el enlace y se apunta con su nombre, dorsal y posición.
2. **Crear la liga:** cuando estáis todos, el administrador (dueño de la página) pulsa "Crear la liga":
   todos los apuntados entran al mercado con el mismo precio y cada mánager recibe 30 M.
3. **Fichar:** cada uno hace su equipo comprando a compañeros al valor de mercado del momento; si vende, cobra
   lo que valga entonces. El capitán puntúa doble.
4. **Jornadas:** el admin cierra alineaciones antes del partido; después sube capturas del acta de Matchapp y Claude rellena quién jugó, goles, tarjetas y resultado. Las paradas se meten a mano tras ver el vídeo.
5. **Valor de mercado:** tras cada partido, cada punto por encima de 3 sube el valor 0,1 M (y por debajo lo baja,
   con mínimo 0,5 M).

Es un único `index.html` publicado como Artifact de Claude con base de datos compartida (`db`), identidad
(`user`) y subida de fotos (`assets`). Solo funciona dentro del visor de Artifacts. Los resultados no se leen
solos de la web de la federación: el admin los mete tras cada partido.
