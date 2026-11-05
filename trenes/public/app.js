// TrenVivo: lee los datos abiertos en tiempo real de Renfe y los muestra como panel de estación, lista y mapa.
// Orden de fuentes: servidor propio (/api, sin problemas de CORS) → Renfe directo → modo demo simulado.
'use strict';

const REFRESCO_MS = 30000;
const RENFE = {
  ld: 'https://tiempo-real.largorecorrido.renfe.com/renfe-visor/flotaLD.json',
  cerPosiciones: 'https://gtfsrt.renfe.com/vehicle_positions.json',
  cerRetrasos: 'https://gtfsrt.renfe.com/trip_updates.json',
  alertas: 'https://gtfsrt.renfe.com/alerts.json',
};

// Estaciones principales (se completan con el listado completo que da el servidor)
const ESTACIONES = {
  '60000': { n: 'Madrid-Puerta de Atocha', lat: 40.4066, lon: -3.6908 },
  '17000': { n: 'Madrid-Chamartín', lat: 40.4722, lon: -3.6827 },
  '71801': { n: 'Barcelona-Sants', lat: 41.3791, lon: 2.1403 },
  '51003': { n: 'Sevilla-Santa Justa', lat: 37.3917, lon: -5.9754 },
  '50500': { n: 'Córdoba', lat: 37.8885, lon: -4.7895 },
  '54413': { n: 'Málaga-María Zambrano', lat: 36.7118, lon: -4.4325 },
  '04040': { n: 'Zaragoza-Delicias', lat: 41.6588, lon: -0.9116 },
  '10600': { n: 'Valladolid-Campo Grande', lat: 41.6435, lon: -4.734 },
  '03216': { n: 'València-Joaquín Sorolla', lat: 39.4592, lon: -0.3826 },
  '60911': { n: 'Alacant Terminal', lat: 38.3443, lon: -0.495 },
  '13200': { n: 'Bilbao-Abando', lat: 43.2603, lon: -2.9277 },
  '31412': { n: 'A Coruña', lat: 43.3534, lon: -8.4093 },
  '31400': { n: 'Santiago de Compostela', lat: 42.8706, lon: -8.5445 },
  '15100': { n: 'León', lat: 42.5964, lon: -5.5847 },
};

const estado = { trenes: [], alertas: [], fuente: '', actualizado: null, vigilados: new Set(leer('vigilados', [])), ultimoAviso: {} };

function leer(clave, defecto) { try { return JSON.parse(localStorage.getItem('tv_' + clave)) ?? defecto; } catch { return defecto; } }
function guardar(clave, valor) { try { localStorage.setItem('tv_' + clave, JSON.stringify(valor)); } catch {} }
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nombre = cod => (cod == null || cod === '') ? '—' : (ESTACIONES[String(cod)]?.n || ESTACIONES[String(cod).padStart(5, '0')]?.n || `Est. ${cod}`);
const primero = (o, ...claves) => { for (const k of claves) if (o?.[k] != null && o[k] !== '') return o[k]; };

async function pedir(url) {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---------- Normalización de las fuentes de Renfe ----------

function horaAMinutos(h) {
  if (h == null || h === '') return null;
  if (typeof h === 'number' || /^\d{10,13}$/.test(h)) { const d = new Date(+h < 1e12 ? +h * 1000 : +h); return d.getHours() * 60 + d.getMinutes(); }
  const m = String(h).match(/(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}
const minutosAHora = m => m == null ? '—' : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function normalizarLD(datos) {
  const lista = Array.isArray(datos) ? datos : (datos?.trenes || datos?.data || []);
  return lista.map(t => {
    const ret = primero(t, 'ultRetraso', 'retraso', 'delay');
    return {
      id: 'LD-' + primero(t, 'codComercial', 'idTren', 'codTren'),
      tipo: 'LD',
      producto: primero(t, 'desProducto', 'producto', 'desCorridor') || 'Larga/Media dist.',
      numero: String(primero(t, 'codComercial', 'idTren', 'codTren') ?? '?'),
      linea: primero(t, 'desCorridor', 'corredor') || '',
      origen: nombre(primero(t, 'codOrigen', 'codEstOrig')),
      destino: nombre(primero(t, 'codDestino', 'codEstDest')),
      anterior: nombre(primero(t, 'codEstAnt')),
      codSiguiente: String(primero(t, 'codEstSig') ?? ''),
      siguiente: nombre(primero(t, 'codEstSig')),
      horaSig: horaAMinutos(primero(t, 'horaLlegadaSigEst', 'horaSig')),
      retraso: ret == null || isNaN(+ret) ? null : Math.round(+ret),
      lat: +primero(t, 'latitud', 'lat') || null,
      lon: +primero(t, 'longitud', 'lon') || null,
      gps: primero(t, 'GPS') !== 'N',
      material: primero(t, 'mat') || '',
    };
  }).filter(t => t.numero !== '?');
}

// Núcleo de Cercanías según la provincia en la que está el tren
const NUCLEOS = {
  Madrid: 'Madrid', Guadalajara: 'Madrid', Toledo: 'Madrid', Segovia: 'Madrid',
  Barcelona: 'Rodalies Catalunya', Girona: 'Rodalies Catalunya', Tarragona: 'Rodalies Catalunya', Lleida: 'Rodalies Catalunya',
  'València': 'València', 'Castelló': 'València', 'Alacant/Alicante': 'Murcia/Alicante', Murcia: 'Murcia/Alicante',
  Sevilla: 'Sevilla', 'Cádiz': 'Cádiz', 'Málaga': 'Málaga', Bizkaia: 'Bilbao', 'Araba/Álava': 'Bilbao',
  Cantabria: 'Santander', Gipuzkoa: 'San Sebastián', Navarra: 'San Sebastián', Asturias: 'Asturias', Zaragoza: 'Zaragoza',
};
const PALETA = ['#4fb3ff', '#e5484d', '#30a46c', '#f5a623', '#8e4ec6', '#e93d82', '#12a594', '#ffb224', '#3e63dd', '#a18072', '#0090ff', '#d6409f'];
function colorLinea(nucleo, linea) {
  let h = 0; for (const c of `${nucleo}${linea}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

function normalizarCercanias(posiciones, retrasos, info = {}) {
  const retrasoPorViaje = {};
  for (const e of retrasos?.entity || []) {
    const tu = e.tripUpdate; if (!tu) continue;
    const stu = tu.stopTimeUpdate?.[0];
    const seg = primero(tu, 'delay') ?? stu?.arrival?.delay ?? stu?.departure?.delay;
    if (seg != null) retrasoPorViaje[tu.trip?.tripId] = Math.round(+seg / 60);
  }
  return (posiciones?.entity || []).map(e => {
    const v = e.vehicle || {}, viaje = v.trip?.tripId || e.id;
    const etiqueta = v.vehicle?.label || '';
    const [, lineaEtiqueta = '', numero = ''] = etiqueta.match(/^([A-Z]\d+[a-z]?)-(\d+)/i) || [];
    const extra = info[viaje] || {};
    const linea = extra.linea || lineaEtiqueta;
    const lat = v.position?.latitude ?? null, lon = v.position?.longitude ?? null;
    const prov = provinciaDe(lat, lon), nucleo = NUCLEOS[prov] || prov || 'Otros';
    return {
      id: 'CER-' + (viaje || etiqueta),
      tipo: 'CER',
      producto: 'Cercanías',
      numero: numero || v.vehicle?.id || viaje,
      linea, nucleo, color: extra.color || colorLinea(nucleo, linea),
      origen: extra.origen || '', destino: extra.destino || '',
      anterior: '',
      codSiguiente: String(v.stopId ?? ''),
      siguiente: v.stopId ? nombre(v.stopId) : '—',
      enParada: v.currentStatus === 'STOPPED_AT',
      horaSig: extra.horaSig ?? null,
      retraso: retrasoPorViaje[viaje] ?? null,
      lat, lon,
      gps: true,
    };
  });
}

function normalizarAlertas(datos) {
  const txt = x => x?.translation?.find(t => /^es/i.test(t.language || 'es'))?.text || x?.translation?.[0]?.text || '';
  return (datos?.entity || []).map(e => e.alert).filter(Boolean).map(a => ({
    titulo: txt(a.headerText) || 'Aviso',
    texto: txt(a.descriptionText),
    lineas: [...new Set((a.informedEntity || []).map(i => i.routeId).filter(Boolean))],
  }));
}

// ---------- Modo demo: trenes simulados para probar la app sin conexión a Renfe ----------

// Número pseudoaleatorio uniforme entre 0 y 1, siempre el mismo para la misma semilla
const aleatorio = x => { const v = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };

function generarDemo() {
  const rutas = [['60000', '71801', 'AVE'], ['71801', '60000', 'AVE'], ['60000', '51003', 'AVE'], ['51003', '60000', 'AVE'],
    ['60000', '54413', 'AVE'], ['54413', '60000', 'AVLO'], ['60000', '03216', 'AVE'], ['03216', '60000', 'Alvia'],
    ['17000', '10600', 'Avant'], ['10600', '17000', 'Avant'], ['17000', '31400', 'Alvia'], ['31412', '17000', 'Alvia'],
    ['17000', '13200', 'Alvia'], ['13200', '17000', 'Alvia'], ['60000', '60911', 'AVE'], ['60911', '60000', 'Intercity'],
    ['71801', '04040', 'Avant'], ['04040', '71801', 'AVE'], ['50500', '51003', 'Media Distancia'], ['17000', '15100', 'Alvia']];
  const ahora = Date.now() / 60000;
  const trenes = [];
  rutas.forEach(([o, d, prod], i) => {
    for (let k = 0; k < 4; k++) {
      const semilla = i * 7 + k * 13;
      const duracion = 150 + (semilla % 5) * 30;
      const f = ((ahora / duracion) + k / 4 + i * 0.037) % 1;
      const A = ESTACIONES[o], B = ESTACIONES[d];
      const [lat, lon] = puntoEnRecorrido(recorrido(o, d), f);
      const azar = aleatorio(semilla + Math.floor(ahora / 30));
      const retraso = azar < 0.7 ? Math.floor(azar / 0.7 * 5) : azar < 0.92 ? 6 + Math.floor((azar - 0.7) / 0.22 * 10) : 16 + Math.floor((azar - 0.92) / 0.08 * 40);
      const fecha = new Date(); const minDia = fecha.getHours() * 60 + fecha.getMinutes();
      trenes.push({
        id: `LD-D${i}${k}`, tipo: 'LD', producto: prod, numero: String(2000 + i * 40 + k * 3).padStart(5, '0'), linea: '',
        origen: A.n, destino: B.n, anterior: A.n, codSiguiente: d, siguiente: B.n,
        horaSig: (minDia + Math.round((1 - f) * duracion) + retraso) % 1440,
        retraso, lat, lon, gps: true, material: '',
      });
    }
  });
  trenes.push(...generarDemoCercanias(ahora));
  return {
    trenes,
    alertas: [{ titulo: 'DEMO · Incidencia en infraestructura entre Madrid y Toledo', texto: 'Datos de ejemplo: así se verán los avisos oficiales de Renfe.', lineas: ['Avant'] }],
  };
}

// Trenes de Cercanías simulados: cada línea con trenes cada 12 min en los dos sentidos, a unos 40 km/h de media
function generarDemoCercanias(ahora) {
  const trenes = [], fecha = new Date(), minDia = fecha.getHours() * 60 + fecha.getMinutes() + fecha.getSeconds() / 60;
  let n = 0;
  for (const [nucleo, lineas] of Object.entries(window.MAPA_ESPANA?.cercanias || {})) {
    for (const [linea, { pts, km, paradas }] of Object.entries(lineas)) {
      for (const [, nom, lon, lat] of paradas.map(p => [0, ...p])) ESTACIONES[`D-${nucleo}-${nom}`] = { n: nom, lat, lon };
      const duracion = Math.max(20, km * 1.5), cada = 12, color = colorLinea(nucleo, linea);
      for (const sentido of [1, -1]) {
        for (let k = 0; k * cada < duracion; k++) {
          const avance = (((ahora - k * cada) % duracion) + duracion) % duracion / duracion;
          const f = sentido === 1 ? avance : 1 - avance;
          const azar = aleatorio(++n * 7.13 + Math.floor(ahora / 20));
          const retraso = azar < 0.75 ? Math.floor(azar / 0.75 * 3) : azar < 0.95 ? 4 + Math.floor((azar - 0.75) / 0.2 * 8) : 16 + Math.floor((azar - 0.95) / 0.05 * 20);
          const delante = sentido === 1 ? paradas.find(p => p[3] > f) : [...paradas].reverse().find(p => p[3] < f);
          const sig = delante || paradas[sentido === 1 ? paradas.length - 1 : 0];
          const [origen, destino] = sentido === 1 ? [paradas[0][0], paradas.at(-1)[0]] : [paradas.at(-1)[0], paradas[0][0]];
          const [la, lo] = puntoEnRecorrido(pts, f);
          trenes.push({
            id: `CER-D${n}`, tipo: 'CER', producto: 'Cercanías', numero: String(20000 + n * 37 % 9000), linea, nucleo, color,
            origen, destino, anterior: '', codSiguiente: `D-${nucleo}-${sig[0]}`, siguiente: sig[0], enParada: false,
            horaSig: Math.round(minDia + Math.abs(sig[3] - f) * duracion + retraso) % 1440,
            retraso, lat: la, lon: lo, gps: true,
          });
        }
      }
    }
  }
  return trenes;
}

// Recorrido sobre las vías entre dos estaciones (de mapa-espana.js), o línea recta si no hay
function recorrido(o, d) {
  const r = window.MAPA_ESPANA?.recorridos || {};
  if (r[`${o}-${d}`]) return r[`${o}-${d}`];
  if (r[`${d}-${o}`]) return [...r[`${d}-${o}`]].reverse();
  return [[ESTACIONES[o].lon, ESTACIONES[o].lat], [ESTACIONES[d].lon, ESTACIONES[d].lat]];
}

function puntoEnRecorrido(pts, f) {
  const tramos = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let resto = f * tramos.reduce((a, b) => a + b, 0);
  for (let i = 0; i < tramos.length; i++) {
    if (resto <= tramos[i]) { const t = resto / (tramos[i] || 1), a = pts[i], b = pts[i + 1]; return [a[1] + (b[1] - a[1]) * t, a[0] + (b[0] - a[0]) * t]; }
    resto -= tramos[i];
  }
  const u = pts[pts.length - 1]; return [u[1], u[0]];
}

// ---------- Carga ----------

async function cargar() {
  let ld = null, pos = null, ret = null, cerInfo = {}, alertas = null, fuente = 'vivo';
  if (!new URLSearchParams(location.search).has('demo')) {
    try {
      const d = await pedir('api/trenes');
      ({ ld, cerPosiciones: pos, cerRetrasos: ret, cerInfo } = d);
      alertas = await pedir('api/alertas').catch(() => null);
    } catch {
      [ld, pos, ret, alertas] = await Promise.all(Object.values(RENFE).map(u => pedir(u).catch(() => null)));
    }
  }
  let trenes = [...(ld ? normalizarLD(ld) : []), ...(pos ? normalizarCercanias(pos, ret, cerInfo) : [])];
  let avisos = alertas ? normalizarAlertas(alertas) : [];
  if (!trenes.length) { ({ trenes, alertas: avisos } = generarDemo()); fuente = 'demo'; }
  Object.assign(estado, { trenes, alertas: avisos, fuente, actualizado: new Date() });
  comprobarVigilados();
  pintar();
}

async function cargarEstaciones() {
  try { Object.assign(ESTACIONES, await pedir('api/estaciones')); } catch {}
}

// ---------- Interfaz ----------

const claseRetraso = r => r == null ? 'n' : r <= 0 ? 0 : r <= 5 ? 1 : r <= 15 ? 2 : 3;
const textoRetraso = r => r == null ? 'sin dato' : r <= 0 ? 'puntual' : `+${r} min`;
const chipRetraso = r => `<span class="ret r${claseRetraso(r)}">${textoRetraso(r)}</span>`;
const chipTipo = t => t.tipo === 'CER'
  ? `<span class="tipo cer" style="background:${esc(t.color || '#3a2140')}">${esc(t.linea || 'Cerc.')}</span>`
  : `<span class="tipo">${esc(t.producto)}</span>`;

function pintar() {
  const { trenes } = estado;
  const conDato = trenes.filter(t => t.retraso != null);
  $('#kActivos').textContent = trenes.length;
  $('#kPuntuales').textContent = conDato.filter(t => t.retraso <= 5).length;
  $('#kRetraso').textContent = conDato.filter(t => t.retraso > 5 && t.retraso <= 15).length;
  $('#kGrave').textContent = conDato.filter(t => t.retraso > 15).length;
  $('#kMedia').textContent = conDato.length ? (conDato.reduce((s, t) => s + Math.max(0, t.retraso), 0) / conDato.length).toFixed(1) + ' min' : '–';
  const f = $('#fuente');
  f.className = 'chip ' + estado.fuente;
  f.textContent = estado.fuente === 'vivo' ? 'EN VIVO' : 'MODO DEMO (datos simulados)';
  $('#hora').textContent = 'Actualizado ' + estado.actualizado.toLocaleTimeString('es-ES');
  const nInc = estado.alertas.length + trenes.filter(t => t.retraso > 15).length;
  $('#nInc').textContent = nInc || '';
  pintarPanel(); pintarProvincia(); pintarCercanias(); pintarLista(); pintarIncidencias(); pintarMapa();
}

function pintarPanel() {
  const sel = $('#selEstacion');
  const cuenta = {};
  for (const t of estado.trenes) if (t.codSiguiente) cuenta[t.codSiguiente] = (cuenta[t.codSiguiente] || 0) + 1;
  const codigos = Object.keys(cuenta).sort((a, b) => nombre(a).localeCompare(nombre(b), 'es'));
  const actual = sel.value || leer('estacion', '') || codigos.sort((a, b) => cuenta[b] - cuenta[a])[0];
  codigos.sort((a, b) => nombre(a).localeCompare(nombre(b), 'es'));
  sel.innerHTML = codigos.map(c => `<option value="${esc(c)}">${esc(nombre(c))} (${cuenta[c]})</option>`).join('');
  if (codigos.includes(actual)) sel.value = actual;
  const cod = sel.value;
  $('#tabNombre').textContent = cod ? nombre(cod) : 'Sin trenes';
  const filas = estado.trenes.filter(t => t.codSiguiente === cod)
    .sort((a, b) => (a.horaSig ?? 1e9) - (b.horaSig ?? 1e9));
  $('#tabFilas').innerHTML = filas.map(t => {
    const c = claseRetraso(t.retraso);
    const est = t.retraso == null ? '—' : t.retraso <= 0 ? 'EN HORA' : t.retraso <= 15 ? `+${t.retraso} MIN` : `RETRASO ${t.retraso} MIN`;
    return `<tr data-id="${esc(t.id)}"><td>${minutosAHora(t.horaSig)}</td><td>${esc(t.tipo === 'CER' ? t.linea : t.producto)} ${esc(t.numero)}</td>
      <td>${esc(t.destino || '—')}</td><td>${esc(t.origen || '—')}</td>
      <td class="${c === 'n' ? '' : c <= 1 ? 'est-ok' : c === 2 ? 'est-aviso' : 'est-mal'}">${est}</td></tr>`;
  }).join('') || '<tr><td colspan="5">No hay trenes en camino a esta estación</td></tr>';
}

function filtrados() {
  const q = $('#buscar').value.trim().toLowerCase(), tipo = $('#filTipo').value, min = +$('#filRetraso').value;
  const lista = estado.trenes.filter(t => (!tipo || t.tipo === tipo) && (!min || (t.retraso ?? -1) >= min) &&
    (!q || [t.numero, t.linea, t.producto, t.origen, t.destino, t.siguiente].join(' ').toLowerCase().includes(q)));
  return $('#orden').value === 'numero'
    ? lista.sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }))
    : lista.sort((a, b) => (b.retraso ?? -99) - (a.retraso ?? -99));
}

function pintarLista() {
  const lista = filtrados();
  $('#listaFilas').innerHTML = lista.slice(0, 400).map(t => `<tr data-id="${esc(t.id)}">
    <td>${estado.vigilados.has(t.id) ? '⭐' : ''}</td>
    <td>${chipTipo(t)} <span class="num">${esc(t.numero)}</span></td>
    <td>${t.origen ? `${esc(t.origen)} → ${esc(t.destino)}` : '<span class="sub">—</span>'}</td>
    <td>${esc(t.siguiente)}${t.enParada ? ' <span class="sub">(en andén)</span>' : ''}</td>
    <td>${minutosAHora(t.horaSig)}</td><td>${chipRetraso(t.retraso)}</td></tr>`).join('')
    || '<tr><td colspan="6" class="vacio">Ningún tren coincide con los filtros</td></tr>';
  $('#listaCuenta').textContent = `${lista.length} trenes${lista.length > 400 ? ' (se muestran los 400 primeros)' : ''}`;
}

function pintarIncidencias() {
  $('#alertas').innerHTML = estado.alertas.map(a => `<div class="alerta"><b>${esc(a.titulo)}</b>
    ${a.texto ? `<p>${esc(a.texto)}</p>` : ''}${a.lineas.length ? `<p>Afecta a: ${esc(a.lineas.join(', '))}</p>` : ''}</div>`).join('')
    || '<p class="vacio">No hay avisos publicados ahora mismo.</p>';
  const graves = estado.trenes.filter(t => t.retraso > 15).sort((a, b) => b.retraso - a.retraso);
  $('#graves').innerHTML = graves.length ? `<table class="lista"><tbody>${graves.map(t => `<tr data-id="${esc(t.id)}">
    <td>${chipTipo(t)} <span class="num">${esc(t.numero)}</span></td><td>${esc(t.origen ? `${t.origen} → ${t.destino}` : t.siguiente)}</td>
    <td>${chipRetraso(t.retraso)}</td></tr>`).join('')}</tbody></table>` : '<p class="vacio">Ningún tren supera los 15 minutos de retraso. 👍</p>';
  const grupos = {};
  for (const t of estado.trenes) if (t.retraso != null) {
    const g = t.tipo === 'CER' ? `Cercanías ${t.linea}`.trim() : t.producto;
    (grupos[g] ||= []).push(Math.max(0, t.retraso));
  }
  const filas = Object.entries(grupos).map(([g, v]) => [g, v.reduce((a, b) => a + b, 0) / v.length, v.length]).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const max = Math.max(1, ...filas.map(f => f[1]));
  $('#porTipo').innerHTML = filas.map(([g, m, n]) => `<div class="barra"><span>${esc(g)} <span class="sub">(${n})</span></span>
    <div style="width:${Math.max(2, m / max * 100)}%;background:var(--${m > 15 ? 'mal' : m > 5 ? 'aviso' : 'ok'})"></div><span>${m.toFixed(1)} min</span></div>`).join('')
    || '<p class="vacio">Sin datos de retraso.</p>';
}

// Coloca el punto sobre la vía dibujada si el GPS está a menos de 3 km de ella (solo afecta al dibujo)
let indiceVias;
function ajustarAVia(lat, lon) {
  const vias = window.MAPA_ESPANA?.vias; if (!vias) return [lat, lon];
  const celda = (x, y) => `${Math.floor(x * 10)},${Math.floor(y * 10)}`;
  if (!indiceVias) {
    indiceVias = {};
    for (const v of vias) for (let i = 1; i < v.length; i++) {
      const [a, b] = [v[i - 1], v[i]];
      for (let x = Math.floor(Math.min(a[0], b[0]) * 10); x <= Math.floor(Math.max(a[0], b[0]) * 10); x++)
        for (let y = Math.floor(Math.min(a[1], b[1]) * 10); y <= Math.floor(Math.max(a[1], b[1]) * 10); y++)
          (indiceVias[`${x},${y}`] ||= []).push([a, b]);
    }
  }
  const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
  let mejor = null, dmin = 3;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    for (const [a, b] of indiceVias[celda(lon + dx / 10, lat + dy / 10)] || []) {
      const ax = (a[0] - lon) * kx, ay = (a[1] - lat) * ky, bx = (b[0] - lon) * kx, by = (b[1] - lat) * ky;
      const L2 = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = L2 ? Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / L2)) : 0;
      const d = Math.hypot(ax + t * (bx - ax), ay + t * (by - ay));
      if (d < dmin) { dmin = d; mejor = [a[1] + t * (b[1] - a[1]), a[0] + t * (b[0] - a[0])]; }
    }
  }
  return mejor || [lat, lon];
}

const PRINCIPALES = ['60000', '71801', '51003', '50500', '54413', '04040', '10600', '03216', '60911', '13200', '31412', '31400', '15100'];

function crearMapa() {
  mapa = L.map('mapa', { preferCanvas: true, zoomSnap: 0.5, minZoom: 5, maxBounds: [[33, -13], [46, 7]] }).fitBounds([[36, -9.3], [43.8, 3.3]]);
  const M = window.MAPA_ESPANA;
  if (M) {
    const anillos = a => a.map(r => r.map(([x, y]) => [y, x]));
    for (const [iso, a] of Object.entries(M.paises)) {
      const esp = iso === 'ESP';
      L.polygon(anillos(a).map(r => [r]), { stroke: esp, color: '#3d5468', weight: 1.2, fillColor: esp ? '#1b2836' : '#121b24', fillOpacity: 1, interactive: false }).addTo(mapa);
    }
    L.polyline(anillos(M.provincias.flatMap(p => p.r)), { color: '#2a3b4c', weight: .7, interactive: false }).addTo(mapa);
    L.polyline(anillos(M.vias), { color: '#0b1118', weight: 4, opacity: .9, interactive: false }).addTo(mapa);
    L.polyline(anillos(M.vias), { color: '#6f8396', weight: 1.6, dashArray: null, interactive: false }).addTo(mapa);
  }
  for (const c of PRINCIPALES) {
    const e = ESTACIONES[c]; if (!e) continue;
    L.marker([e.lat, e.lon], { interactive: false, icon: L.divIcon({ className: 'ciudad', html: `<i></i><span>${esc(e.n.replace(/-.*/, ''))}</span>`, iconSize: [0, 0] }) }).addTo(mapa);
  }
  const calles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18, attribution: '© OpenStreetMap · © CARTO' });
  capaLD = L.layerGroup().addTo(mapa); capaCER = L.layerGroup().addTo(mapa);
  L.control.layers(null, { 'Larga y media distancia': capaLD, 'Cercanías': capaCER, 'Calles (OpenStreetMap)': calles }, { position: 'topright', collapsed: false }).addTo(mapa);
  mapa.attributionControl.addAttribution('Vías y límites: Natural Earth');
  zonaResaltada = L.layerGroup().addTo(mapa);
}

let mapa, capaLD, capaCER, zonaResaltada;
function pintarMapa() {
  if (!window.L || !$('#v-mapa').classList.contains('activa')) return;
  if (!mapa) crearMapa();
  capaLD.clearLayers(); capaCER.clearLayers();
  const colores = { 0: '#2fbf71', 1: '#a3d65c', 2: '#f5a623', 3: '#ef4b4b', n: '#8ea0b2' };
  for (const t of estado.trenes) {
    if (t.lat == null || t.lon == null || !t.gps) continue;
    L.circleMarker(ajustarAVia(+t.lat, +t.lon), { radius: t.tipo === 'CER' ? 4.5 : 6.5, weight: t.tipo === 'CER' ? 2 : 1.5, color: t.tipo === 'CER' ? t.color : '#0b1118', fillColor: colores[claseRetraso(t.retraso)], fillOpacity: 1 })
      .bindTooltip(`${t.tipo === 'CER' ? t.linea : t.producto} ${t.numero} · ${textoRetraso(t.retraso)}`)
      .on('click', () => abrirDetalle(t.id)).addTo(t.tipo === 'CER' ? capaCER : capaLD);
  }
}

function abrirDetalle(id) {
  const t = estado.trenes.find(x => x.id === id); if (!t) return;
  const vig = estado.vigilados.has(id);
  $('#detalleCuerpo').innerHTML = `<h2>${chipTipo(t)} Tren ${esc(t.numero)}</h2>
    <dl>${t.origen ? `<dt>Recorrido</dt><dd>${esc(t.origen)} → ${esc(t.destino)}</dd>` : ''}
    ${t.anterior ? `<dt>Última estación</dt><dd>${esc(t.anterior)}</dd>` : ''}
    <dt>Próxima parada</dt><dd>${esc(t.siguiente)}${t.enParada ? ' (detenido en andén)' : ''}</dd>
    <dt>Llegada prevista</dt><dd>${minutosAHora(t.horaSig)}</dd>
    <dt>Retraso</dt><dd>${chipRetraso(t.retraso)}</dd>
    ${t.lat != null ? `<dt>Posición</dt><dd>${(+t.lat).toFixed(4)}, ${(+t.lon).toFixed(4)}</dd>` : ''}
    ${t.material ? `<dt>Material</dt><dd>${esc(t.material)}</dd>` : ''}</dl>
    <button class="boton ${vig ? 'on' : ''}" id="btnVigilar">${vig ? '⭐ Vigilando (pulsa para dejar)' : '☆ Vigilar este tren'}</button>
    <p class="nota">Si lo vigilas, te avisamos cuando su retraso aumente 5 minutos o más.</p>`;
  $('#btnVigilar').onclick = () => {
    if (vig) estado.vigilados.delete(id); else { estado.vigilados.add(id); estado.ultimoAviso[id] = t.retraso ?? 0; if (window.Notification?.permission === 'default') Notification.requestPermission(); }
    guardar('vigilados', [...estado.vigilados]); abrirDetalle(id); pintarLista();
  };
  $('#detalle').hidden = false;
}

function comprobarVigilados() {
  for (const id of estado.vigilados) {
    const t = estado.trenes.find(x => x.id === id);
    if (!t || t.retraso == null) continue;
    const antes = estado.ultimoAviso[id];
    if (antes != null && t.retraso - antes >= 5) {
      const msg = `El tren ${t.numero} lleva ahora ${t.retraso} min de retraso (antes ${antes}).`;
      if (window.Notification?.permission === 'granted') new Notification('TrenVivo', { body: msg }); else alert(msg);
    }
    if (antes == null || t.retraso - antes >= 5 || t.retraso < antes) estado.ultimoAviso[id] = t.retraso;
  }
}

// ---------- Mi provincia ----------

const PROVINCIAS = window.MAPA_ESPANA?.provincias || [];
for (const p of PROVINCIAS) {
  const pts = p.r.flat();
  p.caja = [Math.min(...pts.map(c => c[0])), Math.min(...pts.map(c => c[1])), Math.max(...pts.map(c => c[0])), Math.max(...pts.map(c => c[1]))];
}

// Regla par-impar sobre todos los anillos, así los enclaves (Treviño, Llívia…) quedan bien
function enProvincia(p, lat, lon) {
  if (lon < p.caja[0] || lon > p.caja[2] || lat < p.caja[1] || lat > p.caja[3]) return false;
  let dentro = false;
  for (const r of p.r) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
const provinciaDe = (lat, lon) => lat == null || lon == null ? null : PROVINCIAS.find(p => enProvincia(p, +lat, +lon))?.n ?? null;
const provinciaEstacion = {};
function provinciaDeEstacion(cod) {
  if (!(cod in provinciaEstacion)) { const e = ESTACIONES[cod] || ESTACIONES[String(cod).padStart(5, '0')]; provinciaEstacion[cod] = e ? provinciaDe(e.lat, e.lon) : null; }
  return provinciaEstacion[cod];
}

// Minutos que faltan para la hora prevista (minutos del día); null si no hay hora o ya pasó hace rato
function minutosHasta(horaSig) {
  if (horaSig == null) return null;
  const d = new Date(), ahora = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const m = ((horaSig - ahora) % 1440 + 1440) % 1440;
  return m > 1380 ? 0 : Math.round(m);
}
const textoLlegada = m => m == null ? '—' : m <= 1 ? 'Llegando' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;

function tarjeta(t, mostrarParada) {
  const m = minutosHasta(t.horaSig);
  return `<div class="tarjeta" data-id="${esc(t.id)}">
    <div class="cuenta ${m != null && m <= 5 ? 'pronto' : ''}"><small>${m == null ? 'llegada' : m <= 1 ? '' : 'llega en'}</small><b>${textoLlegada(m)}</b><small>${minutosAHora(t.horaSig)}</small></div>
    <div class="info"><div>${chipTipo(t)} <span class="num">${esc(t.numero)}</span> ${chipRetraso(t.retraso)}</div>
      ${t.origen ? `<div>${esc(t.origen)} → <b>${esc(t.destino)}</b></div>` : ''}
      ${mostrarParada ? `<div class="sub">Próxima parada: ${esc(t.siguiente)}${t.enParada ? ' (en andén)' : ''}</div>` : `<div class="sub">Llega a ${esc(t.siguiente)}</div>`}</div></div>`;
}

function pintarProvincia() {
  const selP = $('#selProvincia'), selC = $('#selCiudad');
  if (!selP.options.length) {
    const porComunidad = {};
    for (const p of PROVINCIAS) (porComunidad[p.c] ||= []).push(p.n);
    selP.innerHTML = Object.keys(porComunidad).sort((a, b) => a.localeCompare(b, 'es')).map(c =>
      `<optgroup label="${esc(c)}">${porComunidad[c].sort((a, b) => a.localeCompare(b, 'es')).map(n => `<option>${esc(n)}</option>`).join('')}</optgroup>`).join('');
    selP.value = leer('provincia', 'Madrid');
  }
  const prov = selP.value;
  const llegan = estado.trenes.filter(t => t.codSiguiente && provinciaDeEstacion(t.codSiguiente) === prov);
  const circulan = estado.trenes.filter(t => t.gps && provinciaDe(t.lat, t.lon) === prov);

  // Ciudades/estaciones de la provincia hacia las que va algún tren
  const estaciones = [...new Set(llegan.map(t => t.codSiguiente))].sort((a, b) => nombre(a).localeCompare(nombre(b), 'es'));
  const ciudadAntes = selC.value;
  selC.innerHTML = `<option value="">Todas (${llegan.length} trenes)</option>` + estaciones.map(c =>
    `<option value="${esc(c)}">${esc(nombre(c))} (${llegan.filter(t => t.codSiguiente === c).length})</option>`).join('');
  if (estaciones.includes(ciudadAntes)) selC.value = ciudadAntes;
  const ciudad = selC.value;

  const lista = llegan.filter(t => !ciudad || t.codSiguiente === ciudad)
    .sort((a, b) => (minutosHasta(a.horaSig) ?? 1e9) - (minutosHasta(b.horaSig) ?? 1e9));
  const conDato = [...new Set([...llegan, ...circulan])].filter(t => t.retraso != null);
  $('#pLlegan').textContent = llegan.filter(t => (minutosHasta(t.horaSig) ?? 999) <= 60).length;
  $('#pCirculan').textContent = circulan.length;
  $('#pMedia').textContent = conDato.length ? (conDato.reduce((s, t) => s + Math.max(0, t.retraso), 0) / conDato.length).toFixed(1) + ' min' : '–';
  $('#pTitulo').textContent = ciudad ? `a ${nombre(ciudad)}` : `a estaciones de ${prov}`;
  $('#pNombre').textContent = prov;
  $('#pLlegadas').innerHTML = lista.map(t => tarjeta(t, false)).join('') || `<p class="vacio">Ahora mismo no hay trenes en camino a ${esc(ciudad ? nombre(ciudad) : prov)}.</p>`;
  $('#pCirculando').innerHTML = circulan.sort((a, b) => (minutosHasta(a.horaSig) ?? 1e9) - (minutosHasta(b.horaSig) ?? 1e9))
    .map(t => tarjeta(t, true)).join('') || `<p class="vacio">No hay trenes con GPS dentro de ${esc(prov)} ahora mismo.</p>`;
}

function verProvinciaEnMapa() {
  const p = PROVINCIAS.find(x => x.n === $('#selProvincia').value); if (!p || !window.L) return;
  document.querySelector('.pestanas button[data-vista="mapa"]').click();
  setTimeout(() => {
    zonaResaltada.clearLayers();
    L.polygon(p.r.map(r => [r.map(([x, y]) => [y, x])]), { color: '#4fb3ff', weight: 2, fillColor: '#4fb3ff', fillOpacity: .08, interactive: false }).addTo(zonaResaltada);
    mapa.fitBounds([[p.caja[1], p.caja[0]], [p.caja[3], p.caja[2]]], { padding: [20, 20] });
  }, 80);
}

// ---------- Cercanías ----------

let lineaElegida = '';
function pintarCercanias() {
  const cer = estado.trenes.filter(t => t.tipo === 'CER');
  const sel = $('#selNucleo');
  const nucleos = {};
  for (const t of cer) nucleos[t.nucleo] = (nucleos[t.nucleo] || 0) + 1;
  const nombres = Object.keys(nucleos).sort((a, b) => nucleos[b] - nucleos[a]);
  const actual = sel.value || leer('nucleo', '') || nombres[0];
  sel.innerHTML = nombres.map(n => `<option value="${esc(n)}">${esc(n)} (${nucleos[n]})</option>`).join('');
  if (nombres.includes(actual)) sel.value = actual;
  const nucleo = sel.value;
  const delNucleo = cer.filter(t => t.nucleo === nucleo);

  const porLinea = {};
  for (const t of delNucleo) (porLinea[t.linea || '?'] ||= []).push(t);
  const lineas = Object.keys(porLinea).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  if (lineaElegida && !lineas.includes(lineaElegida)) lineaElegida = '';
  const media = ts => { const c = ts.filter(t => t.retraso != null); return c.length ? c.reduce((s, t) => s + Math.max(0, t.retraso), 0) / c.length : null; };
  $('#lineasCer').innerHTML = `<button class="linea ${lineaElegida ? '' : 'activa'}" data-linea="">Todas <small>${delNucleo.length}</small></button>` +
    lineas.map(l => { const m = media(porLinea[l]), c = claseRetraso(m == null ? null : Math.round(m));
      return `<button class="linea ${lineaElegida === l ? 'activa' : ''}" data-linea="${esc(l)}" style="--c:${esc(porLinea[l][0].color)}">
        <b>${esc(l)}</b><small>${porLinea[l].length} trenes</small><span class="ret r${c}">${m == null ? 'sin dato' : m < 0.5 ? 'puntual' : '+' + m.toFixed(1) + ' min'}</span></button>`; }).join('');

  const lista = delNucleo.filter(t => !lineaElegida || t.linea === lineaElegida)
    .sort((a, b) => a.linea.localeCompare(b.linea, 'es', { numeric: true }) || (minutosHasta(a.horaSig) ?? 1e9) - (minutosHasta(b.horaSig) ?? 1e9));
  $('#cerTitulo').textContent = lineaElegida ? `Línea ${lineaElegida}` : `Todas las líneas de ${nucleo || 'Cercanías'}`;
  $('#cerTrenes').innerHTML = lista.map(t => tarjeta(t, true)).join('') ||
    '<p class="vacio">Renfe no está publicando ahora mismo trenes de Cercanías en circulación.</p>';
}

function verNucleoEnMapa() {
  const ts = estado.trenes.filter(t => t.tipo === 'CER' && t.nucleo === $('#selNucleo').value && t.lat != null && (!lineaElegida || t.linea === lineaElegida));
  if (!ts.length || !window.L) return;
  document.querySelector('.pestanas button[data-vista="mapa"]').click();
  setTimeout(() => { zonaResaltada.clearLayers(); mapa.fitBounds(ts.map(t => [t.lat, t.lon]), { padding: [40, 40], maxZoom: 11 }); }, 80);
}

// ---------- Eventos ----------

document.querySelectorAll('.pestanas button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.pestanas button, .vista').forEach(x => x.classList.remove('activa'));
  b.classList.add('activa'); $('#v-' + b.dataset.vista).classList.add('activa');
  guardar('vista', b.dataset.vista);
  if (b.dataset.vista === 'mapa') { pintarMapa(); setTimeout(() => mapa?.invalidateSize(), 50); }
});
['#buscar', '#filTipo', '#filRetraso', '#orden'].forEach(s => $(s).addEventListener('input', pintarLista));
$('#selEstacion').onchange = () => { guardar('estacion', $('#selEstacion').value); pintarPanel(); };
document.addEventListener('click', e => {
  const fila = e.target.closest('tr[data-id], .tarjeta[data-id]'); if (fila) abrirDetalle(fila.dataset.id);
  if (e.target.matches('.cerrar') || e.target.id === 'detalle') $('#detalle').hidden = true;
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#detalle').hidden = true; });
$('#selProvincia').onchange = () => { guardar('provincia', $('#selProvincia').value); $('#selCiudad').value = ''; pintarProvincia(); };
$('#selCiudad').onchange = pintarProvincia;
$('#btnVerMapa').onclick = verProvinciaEnMapa;
$('#selNucleo').onchange = () => { guardar('nucleo', $('#selNucleo').value); lineaElegida = ''; pintarCercanias(); };
$('#lineasCer').onclick = e => { const b = e.target.closest('.linea'); if (b) { lineaElegida = b.dataset.linea; pintarCercanias(); } };
$('#btnVerNucleo').onclick = verNucleoEnMapa;
$('#btnUbicacion').onclick = () => {
  const b = $('#btnUbicacion');
  if (!navigator.geolocation) { b.textContent = 'Ubicación no disponible'; return; }
  b.textContent = 'Buscando…';
  navigator.geolocation.getCurrentPosition(pos => {
    const p = provinciaDe(pos.coords.latitude, pos.coords.longitude);
    b.textContent = p ? `📍 ${p}` : 'Fuera de las provincias con tren';
    if (p) { $('#selProvincia').value = p; $('#selProvincia').onchange(); }
  }, () => { b.textContent = 'No se pudo obtener tu ubicación'; }, { timeout: 10000 });
};
setInterval(() => { if (!estado.actualizado) return; if ($('#v-provincia').classList.contains('activa')) pintarProvincia(); if ($('#v-cercanias').classList.contains('activa')) pintarCercanias(); }, 20000);
setInterval(() => { $('#tabReloj').textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }, 1000);

document.querySelector(`.pestanas button[data-vista="${leer('vista', 'panel')}"]`)?.click();
cargarEstaciones().then(cargar);
setInterval(cargar, REFRESCO_MS);
