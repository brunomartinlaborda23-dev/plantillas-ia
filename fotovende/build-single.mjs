// Junta la app en un único archivo: node build-single.mjs → FotoVende.html
import { readFileSync, writeFileSync } from 'node:fs';
const r = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const lib = r('./vendor/background-removal.mjs');
const heic = r('./vendor/heic2any.mjs');
let app = r('./app.js').replace(
  "import('./vendor/background-removal.mjs')",
  "import(URL.createObjectURL(new Blob([document.getElementById('bgr-lib').textContent], { type: 'text/javascript' })))",
);
app = app.replace(
  "import('./vendor/heic2any.mjs')",
  "import(URL.createObjectURL(new Blob([document.getElementById('heic-lib').textContent], { type: 'text/javascript' })))",
);
if (!app.includes('bgr-lib') || !app.includes('heic-lib')) throw new Error('no se encontró el import de la librería');
for (const [n, s] of [['lib', lib], ['heic', heic], ['app', app]]) if (/<\/script/i.test(s)) throw new Error(`</script> en ${n}`);
const icon = 'data:image/svg+xml;base64,' + Buffer.from(r('./icon.svg')).toString('base64');
let html = r('./index.html')
  .replace(/<link rel="manifest"[^>]*>\n\s*/, '')
  .replaceAll('icon.svg', icon)
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${r('./style.css')}</style>`)
  .replace('<script type="module" src="app.js"></script>', () =>
    `<script type="text/plain" id="bgr-lib">${lib}</script>\n<script type="text/plain" id="heic-lib">${heic}</script>\n<script type="module">\n${app}</script>`);
writeFileSync(new URL('./FotoVende.html', import.meta.url), html);
console.log('FotoVende.html', (html.length / 1024).toFixed(0), 'KB');

// Versión para publicar como página en claude.ai (sin IA de fondo, que allí no puede descargarse).
{
  const heicIife = r('./vendor/heic2any.iife.js');
  if (/<\/script/i.test(heicIife)) throw new Error('</script> en heic iife');
  const appA = r('./app.js').replace(
    "import('./vendor/heic2any.mjs')",
    'Promise.resolve({ default: window.heic2anyLib.default })',
  );
  const body = r('./index.html').split('<body>')[1].split('</body>')[0]
    .replace('<script type="module" src="app.js"></script>', () =>
      `<script>window.FV_ARTIFACT = true;</script>\n<script>${heicIife}</script>\n<script type="module">\n${appA}</script>`);
  const page = `<title>FotoVende</title>\n<meta name="theme-color" content="#14161c">\n<style>\n${r('./style.css')}</style>\n${body}`;
  writeFileSync(new URL('./FotoVende-enlace.html', import.meta.url), page);
  console.log('FotoVende-enlace.html', (page.length / 1024).toFixed(0), 'KB');
}
