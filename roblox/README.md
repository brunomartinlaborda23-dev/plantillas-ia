# Parking Pro 3D para Roblox

Versión de Roblox del juego: los mismos 10 niveles, la ciudad (aquí **multijugador**: todos conducen juntos),
los 8 coches con sus medidas reales, la misma física (derrapes incluidos), garaje, taller, monedas guardadas
y panel de admin.

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `ParkingPro3D.rbxlx` | **El juego.** Se abre con Roblox Studio. |
| `models/*.glb` | Los 8 coches en 3D para importarlos. |
| `sounds/*.ogg` | El sonido de cada motor para subirlo a Roblox. |
| `src/` | El código (Luau) por separado, por si usas Rojo (`default.project.json`). |
| `tests/` | Prueba de la física fuera de Roblox (`npm install fengari` y `node roblox/tests/run.cjs`). |

## Paso a paso

Necesitas un **ordenador (Windows o Mac)** con **Roblox Studio** (gratis: <https://create.roblox.com>) y tu cuenta de Roblox.

### 1. Abrir el juego
Abre `ParkingPro3D.rbxlx` con Roblox Studio (doble clic o *File → Open from File*).
Pulsa **Play** (F5): ya funciona, con coches provisionales de bloques. Sigue con el paso 2 para ver los coches de verdad.

### 2. Importar los coches
Para cada archivo de `models/` (`sedan`, `hatch`, `suv`, `pickup`, `sport`, `cs`, `rs`, `hyper`):

1. *Home → Import 3D* (o *File → Import 3D*) y elige el `.glb`.
2. En la ventana del importador deja las opciones por defecto y pulsa **Import**.
3. El coche aparece en *Workspace*. En el *Explorer*, **arrástralo a `ReplicatedStorage → Cars`**.
4. Comprueba que se llama exactamente igual que el archivo (`sedan`, `rs`...). Si no, renómbralo.

No hace falta colocarlos ni escalarlos: el juego los ajusta a su tamaño real, los pinta del color elegido y hace
girar las ruedas por su cuenta (busca las piezas por su nombre: `Body`, `Glass`, `Tire_FL`...).
Si algún coche saliera mirando hacia atrás, pon `Config.MODEL_YAW_FIX = 180` en `ReplicatedStorage → ParkingShared → Config`.

### 3. Sonido de los motores (opcional)
1. En <https://create.roblox.com> → *Creations → Development Items → Audio*, sube los 7 archivos de `sounds/`.
2. Copia el número (ID) de cada uno y pégalo en `Config.SOUND_IDS` (en `ReplicatedStorage → ParkingShared → Config`).

### 4. Publicar
1. *File → Publish to Roblox* y ponle nombre ("Parking Pro 3D").
2. *Home → Game Settings → Security* → activa **Enable Studio Access to API Services** (para que se guarden las partidas).
3. En el Creator Hub, en la página del juego, ponlo como **Público** cuando quieras que entre gente.
   Roblox te pedirá rellenar el cuestionario de madurez del contenido antes de publicarlo.

## Controles

- **Ordenador:** W/S o flechas para acelerar, frenar y marcha atrás (la marcha cambia sola), A/D para girar,
  espacio = freno de mano (derrape a velocidad), C = cámara.
- **Móvil/tablet:** botones ◀ ▶, GAS, FRENO, D/R y P (freno de mano).

## Admin

Eres admin automáticamente si eres el **creador del juego**, y siempre al probar en Studio.
Para añadir a otra persona, pon su UserId en `Config.ADMIN_USER_IDS`.
En el menú aparece el botón **🛠️ Admin**: monedas, todos los coches, todas las piezas, niveles con 3 estrellas,
modo sin choques y reiniciar la partida. A diferencia de la versión web, aquí no hay PIN: el servidor comprueba
quién eres, así que nadie más puede usarlo.

## Diferencias con la versión web

- **Taller:** en Roblox están las llantas, la suspensión y el neón. Los alerones y los body kits todavía no.
- **Sonido de motor:** cada jugador oye solo su propio coche.
- **Seguridad:** el servidor comprueba las recompensas (que de verdad estés aparcado en la plaza y el tiempo real),
  así que no se pueden falsear las monedas desde el cliente.

## Nombres y marcas

Los coches tienen nombres propios (Vector CS, Strada RS, Fulmine HY) y no llevan logotipos. No les pongas
nombres ni logos de marcas reales: las normas de Roblox lo prohíben y las marcas pueden pedir que se retire el juego.
