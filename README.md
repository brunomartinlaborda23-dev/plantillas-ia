# 🚗 Parking Pro 3D

Juego 3D de aparcamiento para iPhone y iPad, inspirado en los juegos de parking tipo *Car Parking*.
Hecho con **Three.js** (gráficos 3D) y empaquetado para iOS con **Capacitor**. No necesita conexión a internet.

## Qué incluye

- **10 niveles** de dificultad creciente: plaza simple, entre coches, pasillo estrecho, aparcamiento en línea,
  garaje, slalom de conos, batería en diagonal, parking subterráneo con columnas, línea experto y laberinto.
- **Modo ciudad libre**: ciudad con calles, edificios y aparcamientos; 40 monedas que recoger.
- **Garaje**: 8 coches con física distinta y 12 colores, que se compran con las monedas del juego:

  | Coche | Precio | Potencia | 0-100 km/h | Inspirado en |
  |---|---|---|---|---|
  | Berlina | gratis | 150 CV | 9,5 s | berlina familiar |
  | Compacto | 400 | 110 CV | 10,8 s | utilitario |
  | Todoterreno | 1.200 | 190 CV | 8,9 s | SUV |
  | Pick-up | 1.800 | 210 CV | 9,8 s | pick-up americana |
  | Deportivo | 3.000 | 340 CV | 5,2 s | coupé deportivo |
  | **Vector CS** | 4.000 | 550 CV | 3,4 s | BMW M4 CS |
  | **Strada RS** | 6.000 | 525 CV | 3,2 s | Porsche 911 GT3 RS |
  | **Fulmine HY** | 10.000 | 963 CV | 2,6 s | Ferrari LaFerrari |
- **Controles táctiles** como en los juegos de parking: volante giratorio (o botones ◀ ▶, se elige en
  el menú con "🎮 Dirección"), pedales de gas y freno progresivos, marcha D/R y freno de mano.
  En ordenador: flechas/WASD, espacio (freno de mano), C (cámara), Esc (pausa).
- **Conducción**: física a paso fijo (120 Hz), giro sobre el eje trasero, dirección que se suaviza con la
  velocidad, derrape con el freno de mano a más de 15 km/h, y en la ciudad el coche resbala a lo largo de
  las paredes en lugar de quedarse clavado.
- **Realismo**: modelos 3D con carrocería curva, pasos de rueda, llantas con radios, discos y pinzas de freno;
  pintura con barniz y reflejos del entorno; la carrocería se inclina al frenar, acelerar y girar;
  caja de cambios automática con sonido de motor según las revoluciones (cada coche suena distinto);
  límite de agarre en curva (los coches subviran si vas demasiado rápido); chirrido de neumáticos y
  marcas de frenada en el suelo.
- Física de giro sobre el eje trasero, **sensores de aparcamiento** con pitidos,
  luces de freno y marcha atrás, 4 cámaras (y arrastrar en pantalla para girar la vista).
- Estrellas según el tiempo, monedas, progreso guardado en el dispositivo, sonidos sintetizados.

## Taller y sonido de motor

- **Taller** (Garaje → 🔧 Taller): cada coche se tunea por separado. Las piezas se compran una vez por coche
  y luego se cambian gratis.

  | Categoría | Opciones (precio en monedas) |
  |---|---|
  | Alerón | Labio 300 · Cola de pato 700 · Alerón GT 1.500 |
  | Body kit | Deportivo 1.200 (labio, faldones, difusor) · Carrocería ancha 3.000 (aletas y vías más anchas) |
  | Llantas | Negras 250 · Blancas 250 · Rojas 300 · Doradas 400 · Cromadas 500 |
  | Suspensión | Rebajada 800 · Muy rebajada 1.500 |
  | Neón | Azul, morado, verde, rojo o blanco · 500 |

- **Motor propio de cada coche** (Garaje → 🔊 Escuchar motor para oír arranque y acelerones):
  Berlina y Compacto 4 cilindros · Todoterreno V6 · Pick-up V8 atmosférico · Deportivo V6 biturbo ·
  Vector CS 6 en línea biturbo · Strada RS bóxer 6 atmosférico a 9.000 rpm · Fulmine HY V12 híbrido.
  El sonido se sintetiza en tiempo real (`www/js/engine-sound.js`): armónicos propios de cada motor,
  irregularidad del ralentí, distorsión de escape, admisión, silbido y soplido de turbo, petardeos al
  soltar el gas y zumbido eléctrico en el híbrido. No usa grabaciones.

## Modo admin

Toca **5 veces seguidas el título** "PARKING PRO 3D" del menú (o abre el juego con `#admin` al final del
enlace) e introduce el PIN. **El PIN inicial es `1234`**: cámbialo desde el propio panel.
Desde el panel puedes sumar monedas, darte todos los coches, desbloquear todos los niveles con 3 estrellas,
activar el modo sin choques, darte todas las piezas del taller y reiniciar la partida.

> El PIN se guarda en el dispositivo y protege el panel de jugadores normales, pero no es seguridad real:
> alguien con conocimientos técnicos podría saltárselo. Para un juego sin compras con dinero real es suficiente.

## Probarlo en el navegador

```bash
npm start          # abre http://localhost:8080
npm test           # verifica que todos los niveles son jugables y la física de conducción
```

## Publicarlo en la App Store (paso a paso)

Necesitas: **un Mac** con **Xcode** (gratis en la Mac App Store), **Node.js** y una cuenta de
**Apple Developer Program** (99 $/año, en <https://developer.apple.com/programs/>).

1. **Preparar el proyecto iOS** (en el Mac, dentro de esta carpeta):
   ```bash
   npm install
   npm run ios:add      # crea la carpeta ios/
   npm run ios:icons    # genera todos los iconos a partir de resources/icon.png
   npm run ios:sync
   npm run ios:open     # abre el proyecto en Xcode
   ```
2. **En Xcode** (target *App* → *Signing & Capabilities*): elige tu *Team* (tu cuenta de desarrollador).
   Si el identificador `com.brunomartin.parkingpro3d` estuviera cogido, cámbialo aquí y en `capacitor.config.json`.
3. **Orientación horizontal**: en *General → Deployment Info* marca solo *Landscape Left* y *Landscape Right*
   (y activa *Requires full screen*).
4. **Probar en tu iPhone**: conéctalo por cable, selecciónalo arriba en Xcode y pulsa ▶.
5. **Crear la ficha en App Store Connect** (<https://appstoreconnect.apple.com>) → *Apps* → *+ Nueva app*:
   nombre "Parking Pro 3D", idioma Español, el mismo *Bundle ID*.
6. **Subir la build**: en Xcode, *Product → Archive* → *Distribute App* → *App Store Connect* → *Upload*.
7. **Completar la ficha**: capturas de pantalla (iPhone 6,9" y iPad 13"), descripción, palabras clave,
   categoría *Juegos → Carreras/Simulación*, clasificación por edades (4+),
   **URL de política de privacidad** (publica `www/privacy.html`, por ejemplo con GitHub Pages)
   y en *Privacidad de la app* marca **"No se recopilan datos"**.
8. **Enviar a revisión**. Apple suele responder en 1–3 días.

> ⚠️ No uses el nombre, logotipo ni imágenes de *Car Parking Multiplayer*: son marcas de su creador
> y Apple rechazaría la app (guía 4.1 "Copycats" y 5.2 propiedad intelectual).
>
> ⚠️ **Coches reales**: Porsche, BMW y Ferrari protegen sus nombres, logotipos y diseños. Por eso los
> superdeportivos del juego tienen nombres propios (Vector CS, Strada RS, Fulmine HY), no llevan logos y
> sus formas son una interpretación libre. No pongas los nombres reales en la app ni en la ficha de la
> App Store salvo que consigas una licencia del fabricante.

## Estructura

```
www/                 Juego (lo que se empaqueta en la app)
  index.html         Pantallas e interfaz
  css/style.css      Estilos (adaptados a notch y zonas seguras del iPhone)
  js/main.js         Bucle del juego, cámaras, menús, garaje
  js/physics.js      Física del coche y colisiones
  js/levels.js       Niveles y mapa de la ciudad
  js/cars.js         Modelos 3D de los coches (perfiles de carrocería, ruedas, detalles)
  js/specs.js        Datos de cada coche: medidas reales, potencia, precio, agarre, motor
  js/effects.js      Caja de cambios, suspensión y marcas de neumático
  js/engine-sound.js Sintetizador de motor (un sonido por tipo de motor)
  js/tuning.js       Catálogo y precios del taller
  js/world.js        Escenario 3D
  js/controls.js     Volante, pedales y teclado
  js/audio.js        Sonidos
  vendor/            Three.js r169 (licencia MIT)
resources/icon.png   Icono 1024×1024 para la App Store
tests/               Comprobación automática de los niveles y vista previa de los coches
                     (npx http-server . y abrir /tests/car-preview.html)
```

## Ideas para siguientes versiones

- **Multijugador online** (como el original): requiere un servidor (p. ej. WebSockets en Node) para
  sincronizar coches entre jugadores.
- Más niveles, gasolinera, tuneado, conducción con motor/caja de cambios manual, modelos 3D detallados (.glb).
