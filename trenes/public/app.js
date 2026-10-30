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

function normalizarCercanias(posiciones, retrasos) {
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
    const [, linea = '', numero = ''] = etiqueta.match(/^([A-Z]\d+[a-z]?)-(\d+)/i) || [];
    return {
      id: 'CER-' + (viaje || etiqueta),
      tipo: 'CER',
      producto: 'Cercanías',
      numero: numero || v.vehicle?.id || viaje,
      linea,
      origen: '', destino: '',
      anterior: '',
      codSiguiente: String(v.stopId ?? ''),
      siguiente: v.stopId ? nombre(v.stopId) : '—',
      enParada: v.currentStatus === 'STOPPED_AT',
      horaSig: null,
      retraso: retrasoPorViaje[viaje] ?? null,
      lat: v.position?.latitude ?? null,
      lon: v.position?.longitude ?? null,
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
      const azar = Math.abs(Math.sin(semilla + Math.floor(ahora / 30)));
      const retraso = azar < 0.7 ? Math.floor(azar / 0.7 * 5) : azar < 0.92 ? 6 + Math.floor((azar - 0.7) / 0.22 * 10) : 16 + Math.floor((azar - 0.92) / 0.08 * 40);
      const fecha = new Date(); const minDia = fecha.getHours() * 60 + fecha.getMinutes();
      trenes.push({
        id: `LD-D${i}${k}`, tipo: 'LD', producto: prod, numero: String(2000 + i * 40 + k * 3).padStart(5, '0'), linea: '',
        origen: A.n, destino: B.n, anterior: A.n, codSiguiente: d, siguiente: B.n,
        horaSig: (minDia + Math.round((1 - f) * duracion) + retraso) % 1440,
        retraso, lat: A.lat + (B.lat - A.lat) * f, lon: A.lon + (B.lon - A.lon) * f, gps: true, material: '',
      });
    }
  });
  return {
    trenes,
    alertas: [{ titulo: 'DEMO · Incidencia en infraestructura entre Madrid y Toledo', texto: 'Datos de ejemplo: así se verán los avisos oficiales de Renfe.', lineas: ['Avant'] }],
  };
}

// ---------- Carga ----------

async function cargar() {
  let ld = null, pos = null, ret = null, alertas = null, fuente = 'vivo';
  if (!new URLSearchParams(location.search).has('demo')) {
    try {
      const d = await pedir('api/trenes');
      ({ ld, cerPosiciones: pos, cerRetrasos: ret } = d);
      alertas = await pedir('api/alertas').catch(() => null);
    } catch {
      [ld, pos, ret, alertas] = await Promise.all(Object.values(RENFE).map(u => pedir(u).catch(() => null)));
    }
  }
  let trenes = [...(ld ? normalizarLD(ld) : []), ...(pos ? normalizarCercanias(pos, ret) : [])];
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
const chipTipo = t => `<span class="tipo ${t.tipo === 'CER' ? 'cer' : ''}">${esc(t.tipo === 'CER' ? (t.linea || 'Cerc.') : t.producto)}</span>`;

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
  pintarPanel(); pintarLista(); pintarIncidencias(); pintarMapa();
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

let mapa, capa;
function pintarMapa() {
  if (!window.L || !$('#v-mapa').classList.contains('activa')) return;
  if (!mapa) {
    mapa = L.map('mapa', { preferCanvas: true }).setView([40.2, -3.7], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18, attribution: '© OpenStreetMap · © CARTO',
    }).addTo(mapa);
    capa = L.layerGroup().addTo(mapa);
  }
  capa.clearLayers();
  const colores = { 0: '#2fbf71', 1: '#a3d65c', 2: '#f5a623', 3: '#ef4b4b', n: '#8ea0b2' };
  for (const t of estado.trenes) {
    if (t.lat == null || t.lon == null || !t.gps) continue;
    L.circleMarker([t.lat, t.lon], { radius: t.tipo === 'CER' ? 4 : 6, weight: 1, color: '#0008', fillColor: colores[claseRetraso(t.retraso)], fillOpacity: .95 })
      .bindTooltip(`${t.tipo === 'CER' ? t.linea : t.producto} ${t.numero} · ${textoRetraso(t.retraso)}`)
      .on('click', () => abrirDetalle(t.id)).addTo(capa);
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
  const fila = e.target.closest('tr[data-id]'); if (fila) abrirDetalle(fila.dataset.id);
  if (e.target.matches('.cerrar') || e.target.id === 'detalle') $('#detalle').hidden = true;
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#detalle').hidden = true; });
setInterval(() => { $('#tabReloj').textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }, 1000);

document.querySelector(`.pestanas button[data-vista="${leer('vista', 'panel')}"]`)?.click();
cargarEstaciones().then(cargar);
setInterval(cargar, REFRESCO_MS);
