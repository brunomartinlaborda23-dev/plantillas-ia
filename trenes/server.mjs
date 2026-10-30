// Servidor de TrenVivo: sirve la web y hace de intermediario con los datos abiertos de Renfe
// (los navegadores no pueden pedirlos directamente por CORS). Sin dependencias: `node server.mjs`.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const PORT = process.env.PORT || 8090;
const PUBLIC = fileURLToPath(new URL('./public/', import.meta.url));

const FUENTES = {
  ld: 'https://tiempo-real.largorecorrido.renfe.com/renfe-visor/flotaLD.json',
  cerPosiciones: 'https://gtfsrt.renfe.com/vehicle_positions.json',
  cerRetrasos: 'https://gtfsrt.renfe.com/trip_updates.json',
  alertas: 'https://gtfsrt.renfe.com/alerts.json',
  gtfsLD: 'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip',
  gtfsCer: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
};

const cache = new Map();
async function obtener(url, segundos, tipo = 'json') {
  const c = cache.get(url);
  if (c && Date.now() - c.t < segundos * 1000) return c.v;
  const r = await fetch(url, { headers: { 'User-Agent': 'TrenVivo/1.0' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  const v = tipo === 'json' ? await r.json() : Buffer.from(await r.arrayBuffer());
  cache.set(url, { t: Date.now(), v });
  return v;
}

// Extrae un fichero de un .zip (lo justo para leer stops.txt de los GTFS de Renfe)
function leerDeZip(buf, nombre) {
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('zip no válido');
  let p = buf.readUInt32LE(fin + 16);
  const total = buf.readUInt16LE(fin + 10);
  for (let i = 0; i < total; i++) {
    const metodo = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20);
    const ln = buf.readUInt16LE(p + 28), le = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const n = buf.toString('utf8', p + 46, p + 46 + ln);
    if (n.endsWith(nombre)) {
      const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const datos = buf.subarray(ini, ini + tam);
      return (metodo === 8 ? zlib.inflateRawSync(datos) : datos).toString('utf8');
    }
    p += 46 + ln + le + lc;
  }
  throw new Error(`${nombre} no está en el zip`);
}

function parsearCSV(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const campos = l => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
  const cab = campos(lineas[0]);
  return lineas.slice(1).map(l => Object.fromEntries(campos(l).map((v, i) => [cab[i], v])));
}

async function estaciones() {
  const c = cache.get('estaciones');
  if (c && Date.now() - c.t < 24 * 3600e3) return c.v;
  const res = {};
  for (const url of [FUENTES.gtfsCer, FUENTES.gtfsLD]) {
    try {
      for (const s of parsearCSV(leerDeZip(await obtener(url, 86400, 'bin'), 'stops.txt'))) {
        if (s.stop_id && s.stop_name) res[s.stop_id] = { n: s.stop_name, lat: +s.stop_lat, lon: +s.stop_lon };
      }
    } catch (e) { console.warn('Estaciones:', e.message); }
  }
  if (Object.keys(res).length) cache.set('estaciones', { t: Date.now(), v: res });
  return res;
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const ruta = new URL(req.url, 'http://x').pathname;
  const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(obj)); };
  try {
    if (ruta === '/api/trenes') {
      const [ld, pos, ret] = await Promise.allSettled([obtener(FUENTES.ld, 15), obtener(FUENTES.cerPosiciones, 15), obtener(FUENTES.cerRetrasos, 15)]);
      return json(200, {
        ld: ld.status === 'fulfilled' ? ld.value : null,
        cerPosiciones: pos.status === 'fulfilled' ? pos.value : null,
        cerRetrasos: ret.status === 'fulfilled' ? ret.value : null,
        errores: [ld, pos, ret].filter(x => x.status === 'rejected').map(x => x.reason.message),
      });
    }
    if (ruta === '/api/alertas') return json(200, await obtener(FUENTES.alertas, 60));
    if (ruta === '/api/estaciones') return json(200, await estaciones());
    const fichero = normalize(join(PUBLIC, ruta === '/' ? 'index.html' : ruta));
    if (!fichero.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    const datos = await readFile(fichero);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(fichero)] || 'application/octet-stream' });
    res.end(datos);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404); return res.end('No encontrado'); }
    json(502, { error: e.message });
  }
}).listen(PORT, () => console.log(`TrenVivo en http://localhost:${PORT}`));
