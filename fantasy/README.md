# Liga Fantasy Colmenar Viejo

Liga fantasy de fútbol del Colmenar Viejo Cadete D: los jugadores del mercado sois vosotros.

1. **Inscripción:** cada uno abre el enlace y se apunta con su nombre, dorsal y posición.
2. **Crear la liga:** cuando estáis todos, el administrador (dueño de la página) pulsa "Crear la liga":
   todos los apuntados entran al mercado con el mismo precio y cada mánager recibe 30 M.
3. **Fichar:** cada uno hace su equipo comprando a compañeros al valor de mercado del momento; si vende, cobra
   lo que valga entonces. El capitán puntúa doble.
4. **Jornadas:** el admin cierra alineaciones antes del partido; después sube capturas del acta de Matchapp y Claude rellena quién jugó, goles, tarjetas y resultado. Las paradas se meten a mano tras ver el vídeo.
5. **Media y valor:** todos empiezan con media 50. Tras cada partido jugado la media cambia (puntos − 3,
   entre −8 y +10) y cada punto de media sube el precio un 4 %. Derrota −1 y tarjetas (amarilla −2, roja −4)
   restan puntos, media y valor.
6. **Paradas:** en el editor de la jornada, botón "Contar" junto al portero para ir sumando mientras se ve el vídeo.

Es un único `index.html` publicado como Artifact de Claude con base de datos compartida (`db`), identidad
(`user`) y subida de fotos (`assets`). Solo funciona dentro del visor de Artifacts. Los resultados no se leen
solos de la web de la federación: el admin los mete tras cada partido.

**Extras:** equipación blanca con banda roja en diagonal y el dorsal en cada jugador; el admin marca a los
capitanes del equipo (brazalete "C"); botón "Finalizar liga" arriba (solo admin) que borra equipos, jornadas y
mercado y vuelve a la inscripción, conservando a los apuntados.

**Bots y mercado diario:** al crear la liga cada mánager tiene una plantilla de bots (0 puntos) y el mercado
abre 7 días después. Cada día a las 12:00 (hora de Madrid) salen al azar N jugadores disponibles (por defecto 8),
los mismos para todos; solo se puede fichar a esos. El admin puede abrir el mercado antes, cambiar el de hoy para
probar y marcar jugadores como no disponibles.
