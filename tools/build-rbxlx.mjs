// Empaqueta roblox/src en un archivo de lugar de Roblox (roblox/ParkingPro3D.rbxlx)
// que se abre directamente con Roblox Studio. Uso: node tools/build-rbxlx.mjs
//   *.server.lua -> Script, *.client.lua -> LocalScript, *.lua -> ModuleScript, carpetas -> Folder
//   (las carpetas de primer nivel son servicios: ReplicatedStorage, ServerScriptService, StarterPlayer...)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const root = new URL('../roblox/src/', import.meta.url).pathname;
let ref = 0;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// CDATA no admite "]]>": se parte en dos secciones si aparece.
const cdata = (s) => '<![CDATA[' + s.split(']]>').join(']]]]><![CDATA[>') + ']]>';

function item(cls, name, inner = '', source = null) {
  const props = [`<string name="Name">${esc(name)}</string>`];
  if (source !== null) props.push(`<ProtectedString name="Source">${cdata(source)}</ProtectedString>`);
  return `<Item class="${cls}" referent="RBX${(ref++).toString(16).toUpperCase().padStart(8, '0')}"><Properties>${props.join('')}</Properties>${inner}</Item>`;
}

// Clases de las carpetas especiales (servicios y contenedores de Roblox).
const SERVICE = { ReplicatedStorage: 1, ServerScriptService: 1, StarterPlayer: 1, StarterPlayerScripts: 1, StarterGui: 1, Workspace: 1 };

let scripts = 0;
function dir(path, name, top) {
  const children = readdirSync(path).sort().map((f) => {
    const p = join(path, f);
    if (statSync(p).isDirectory()) return dir(p, f, false);
    const src = readFileSync(p, 'utf8');
    scripts++;
    if (f.endsWith('.server.lua')) return item('Script', basename(f, '.server.lua'), '', src);
    if (f.endsWith('.client.lua')) return item('LocalScript', basename(f, '.client.lua'), '', src);
    return item('ModuleScript', basename(f, '.lua'), '', src);
  }).join('');
  const cls = SERVICE[name] && (top || name === 'StarterPlayerScripts') ? name : 'Folder';
  return item(cls, name, children);
}

const services = readdirSync(root).sort().map((d) => {
  let inner = dir(join(root, d), d, true);
  // Carpeta vacía donde se arrastran los coches importados (.glb).
  if (d === 'ReplicatedStorage') inner = inner.replace(/<\/Item>$/, item('Folder', 'Cars') + '</Item>');
  return inner;
}).join('');

const xml = `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">${services}</roblox>\n`;
const out = new URL('../roblox/ParkingPro3D.rbxlx', import.meta.url).pathname;
writeFileSync(out, xml);
console.log(`ParkingPro3D.rbxlx: ${scripts} scripts, ${(xml.length / 1024).toFixed(0)} KB`);
