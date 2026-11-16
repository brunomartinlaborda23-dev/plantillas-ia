# 📸 FotoVende — fotos que venden en Vinted

Web/app para sacar, mejorar y preparar las fotos de lo que vendes en Vinted, Wallapop, eBay o Milanuncios.
Todo se hace **en tu propio móvil**: las fotos no se suben a ningún servidor.

## Los 3 apartados

1. **Fotos** — cámara dentro de la página (con cuadrícula, linterna y cambio de cámara), o la cámara normal del
   móvil (máxima calidad), o fotos de la galería. Consejos para que la prenda se venda antes.
2. **Mejorar** — para cada foto:
   - **Auto-mejora** (corrige luz y tonos amarillentos) + brillo, contraste, color, calidez y nitidez.
   - **Fondo**: la IA recorta la prenda y pone fondo blanco, gris claro, de color o desenfocado, con sombra suave.
     La primera vez descarga el modelo de IA (~45 MB); después queda en caché.
   - **Formato**: 3:4 (el de Vinted), cuadrada, 4:5 u original, y girar. Con fondo cambiado, la prenda se centra sola.
   - "Mantén para ver el original", "Aplicar a todas" y "Restablecer".
3. **Publicar** — fotos finales a 2048 px, ordenables (la 1ª es la portada). **Guardar/compartir** (abre el menú
   de compartir del móvil para guardarlas en la galería o mandarlas a la app) o **Descargar todas**, y accesos
   directos para crear el anuncio en Vinted (eliges país), Wallapop, eBay y Milanuncios. Incluye un generador de
   título y descripción para copiar y pegar.

> Vinted no tiene una forma pública de subir anuncios desde otra web, así que el paso final es: guardar las fotos →
> abrir Vinted → elegirlas de la galería.

## Cómo usarla

En el ordenador:

```bash
npx http-server fotovende -p 8080
```

y abre <http://localhost:8080>.

**En el móvil** la cámara del navegador sólo funciona con **https**. Lo más fácil es publicar la carpeta
`fotovende/` gratis en Netlify (arrastrar la carpeta a <https://app.netlify.com/drop>), GitHub Pages o Vercel, abrir
el enlace en el móvil y pulsar "Añadir a pantalla de inicio" para tenerla como una app. Los botones
"Cámara del móvil" y "Galería" funcionan incluso sin https.

## Versión en un solo archivo

`FotoVende.html` lleva todo dentro (estilos, código y la librería de recorte). Se regenera con
`node fotovende/build-single.mjs` después de cambiar la app.

## Archivos

- `index.html`, `style.css`, `app.js` — la app (sin dependencias, sin compilar).
- `vendor/background-removal.mjs` — librería de recorte con IA [@imgly/background-removal](https://github.com/imgly/background-removal-js)
  1.7.0 empaquetada (licencia AGPL, ver `vendor/LICENSE-background-removal.md`; bien para uso personal). El modelo y
  los archivos wasm se descargan de `staticimgly.com` la primera vez.
- `vendor/heic2any.mjs` — [heic2any](https://github.com/alexcorvi/heic2any) (MIT) para abrir fotos HEIC de iPhone/Samsung.

## Versión con enlace (claude.ai)

`FotoVende-enlace.html` es la misma app preparada para publicarse como página en claude.ai. Allí no se puede descargar
nada de otros servidores, así que la IA de recorte se publica junto a la página en la carpeta `ia/`:
`ort.wasm.min.mjs`, `ort-wasm-simd-threaded.mjs/.wasm` (de `onnxruntime-web@1.21.0`) y el modelo `isnet_quint8`
de `@imgly/background-removal-data@1.4.5` partido en trozos `modelo-XX.wasm` + `modelo.json`. Esos archivos (~57 MB)
no se guardan en el repositorio.
