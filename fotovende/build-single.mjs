// Junta la app en un único archivo: node build-single.mjs → FotoVende.html
import { readFileSync, writeFileSync } from 'node:fs';
const r = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const lib = r('./vendor/background-removal.mjs');
let app = r('./app.js').replace(
  "import('./vendor/background-removal.mjs')",
  "import(URL.createObjectURL(new Blob([document.getElementById('bgr-lib').textContent], { type: 'text/javascript' })))",
);
if (!app.includes('bgr-lib')) throw new Error('no se encontró el import de la librería');
for (const [n, s] of [['lib', lib], ['app', app]]) if (/<\/script/i.test(s)) throw new Error(`</script> en ${n}`);
const icon = 'data:image/svg+xml;base64,' + Buffer.from(r('./icon.svg')).toString('base64');
let html = r('./index.html')
  .replace(/<link rel="manifest"[^>]*>\n\s*/, '')
  .replaceAll('icon.svg', icon)
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${r('./style.css')}</style>`)
  .replace('<script type="module" src="app.js"></script>', () =>
    `<script type="text/plain" id="bgr-lib">${lib}</script>\n<script type="module">\n${app}</script>`);
writeFileSync(new URL('./FotoVende.html', import.meta.url), html);
console.log('FotoVende.html', (html.length / 1024).toFixed(0), 'KB');
