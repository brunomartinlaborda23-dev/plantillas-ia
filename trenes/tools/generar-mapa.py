"""Genera public/mapa-espana.js a partir de Natural Earth (dominio público):
contorno de España y vecinos, provincias, red ferroviaria y recorridos de demo sobre las vías.
Uso: python3 generar-mapa.py CARPETA_CON_LOS_GEOJSON  (ne_10m_railroads, ne_10m_admin_0_countries,
ne_10m_admin_1_states_provinces, descargados de github.com/nvkelso/natural-earth-vector/geojson)"""
import heapq, json, math, sys
from pathlib import Path

ORIGEN = Path(sys.argv[1])
SALIDA = Path(__file__).resolve().parent.parent / 'public' / 'mapa-espana.js'
CAJA = (-10.0, 35.6, 4.6, 44.2)  # península y Baleares

def dentro(c): return CAJA[0] <= c[0] <= CAJA[2] and CAJA[1] <= c[1] <= CAJA[3]

def simplificar(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1e-12
    dmax, i = max(((abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / L, k) for k, p in enumerate(pts[1:-1], 1)), default=(0, 0))
    if dmax <= tol: return [a, b]
    return simplificar(pts[:i + 1], tol)[:-1] + simplificar(pts[i:], tol)

def simplificar_anillo(anillo, tol):
    """Los anillos cerrados se parten en dos mitades para que el primer y último punto no coincidan."""
    m = len(anillo) // 2
    return simplificar(anillo[:m + 1], tol)[:-1] + simplificar(anillo[m:], tol)

def lineas(geom):
    t, c = geom['type'], geom['coordinates']
    return {'LineString': [c], 'MultiLineString': c, 'Polygon': c, 'MultiPolygon': [r for p in c for r in p]}[t]

def recortar(linea):
    """Trozos de la línea que caen dentro de la caja."""
    trozos, actual = [], []
    for c in linea:
        if dentro(c): actual.append(c)
        elif actual: trozos.append(actual); actual = []
    if actual: trozos.append(actual)
    return [t for t in trozos if len(t) > 1]

r3 = lambda pts: [[round(x, 3), round(y, 3)] for x, y in pts]

# Países (contorno de España destacado, vecinos en gris)
paises = {}
for f in json.load(open(ORIGEN / 'ne_10m_admin_0_countries.geojson'))['features']:
    iso = f['properties']['ADM0_A3']
    if iso not in ('ESP', 'PRT', 'FRA', 'AND', 'MAR', 'DZA', 'GIB'): continue
    anillos = []
    for anillo in lineas(f['geometry']):
        if not any(dentro(c) for c in anillo): continue
        s = simplificar_anillo(anillo, 0.01)
        if len(s) > 3: anillos.append(r3(s))
    paises[iso] = anillos

# Provincias de España con su nombre actual (sin Canarias, Ceuta y Melilla: no tienen tren de Renfe)
NOMBRES = {'La Coruña': 'A Coruña', 'Gerona': 'Girona', 'Lérida': 'Lleida', 'Orense': 'Ourense', 'Baleares': 'Illes Balears',
           'Álava': 'Araba/Álava', 'Castellón': 'Castelló', 'Alicante': 'Alacant/Alicante', 'Valencia': 'València'}
COMUNIDADES = {'Valenciana': 'Comunitat Valenciana', 'Foral de Navarra': 'Navarra', 'Islas Baleares': 'Illes Balears'}
provincias = []
for f in json.load(open(ORIGEN / 'ne_10m_admin_1_states_provinces.geojson'))['features']:
    pr = f['properties']
    if pr.get('adm0_a3') != 'ESP' or pr['name'] in ('Ceuta', 'Melilla', 'Las Palmas', 'Santa Cruz de Tenerife'): continue
    anillos = [r3(s) for a in lineas(f['geometry']) if all(dentro(c) for c in a) for s in [simplificar_anillo(a, 0.015)] if len(s) > 3]
    provincias.append({'n': NOMBRES.get(pr['name'], pr['name']), 'c': COMUNIDADES.get(pr['region'], pr['region']), 'r': anillos})
provincias.sort(key=lambda p: p['n'])

# Red ferroviaria
vias = []
for f in json.load(open(ORIGEN / 'ne_10m_railroads.geojson'))['features']:
    if f['properties'].get('continent') != 'Europe': continue
    for l in lineas(f['geometry']):
        for t in recortar(l):
            vias.append(t)

# Grafo de la red para trazar los recorridos de demo por las vías
def km(a, b):
    return math.hypot((a[0] - b[0]) * 111.32 * math.cos(math.radians((a[1] + b[1]) / 2)), (a[1] - b[1]) * 110.57)
clave = lambda c: (round(c[0], 3), round(c[1], 3))
grafo = {}
def unir(a, b):
    d = km(a, b); grafo.setdefault(a, {})[b] = d; grafo.setdefault(b, {})[a] = d
for v in vias:
    for p, q in zip(v, v[1:]): unir(clave(p), clave(q))
# Empalma extremos sueltos que están a menos de 1,5 km (los tramos de Natural Earth no siempre se tocan)
extremos = [clave(v[0]) for v in vias] + [clave(v[-1]) for v in vias]
nodos = list(grafo)
for e in extremos:
    for n in nodos:
        if n != e and km(e, n) < 1.5: unir(e, n)

def cercano(lon, lat): return min(grafo, key=lambda n: km(n, (lon, lat)))
def camino(a, b):
    dist, prev, cola = {a: 0}, {}, [(0, a)]
    while cola:
        d, n = heapq.heappop(cola)
        if n == b: break
        if d > dist[n]: continue
        for m, w in grafo[n].items():
            if d + w < dist.get(m, 1e18): dist[m] = d + w; prev[m] = n; heapq.heappush(cola, (d + w, m))
    if b not in dist: return None
    ruta = [b]
    while ruta[-1] != a: ruta.append(prev[ruta[-1]])
    return ruta[::-1]

ESTACIONES = {  # mismas que en app.js
    '60000': (-3.6908, 40.4066), '17000': (-3.6827, 40.4722), '71801': (2.1403, 41.3791), '51003': (-5.9754, 37.3917),
    '50500': (-4.7895, 37.8885), '54413': (-4.4325, 36.7118), '04040': (-0.9116, 41.6588), '10600': (-4.734, 41.6435),
    '03216': (-0.3826, 39.4592), '60911': (-0.495, 38.3443), '13200': (-2.9277, 43.2603), '31412': (-8.4093, 43.3534),
    '31400': (-8.5445, 42.8706), '15100': (-5.5847, 42.5964),
}
RUTAS = [('60000', '71801'), ('60000', '51003'), ('60000', '54413'), ('60000', '03216'), ('17000', '10600'),
         ('17000', '31400'), ('31412', '17000'), ('17000', '13200'), ('60000', '60911'), ('71801', '04040'),
         ('50500', '51003'), ('17000', '15100')]
recorridos = {}
for o, d in RUTAS:
    c = camino(cercano(*ESTACIONES[o]), cercano(*ESTACIONES[d]))
    if c:
        pts = [list(ESTACIONES[o])] + [list(p) for p in c] + [list(ESTACIONES[d])]
        recorridos[f'{o}-{d}'] = r3(simplificar(pts, 0.002))
        print(f'{o}-{d}: {sum(km(p, q) for p, q in zip(c, c[1:])):.0f} km por vía')
    else:
        print(f'{o}-{d}: sin camino, se usará línea recta')

# Líneas de Cercanías para el modo demo: paradas (nombre, lon, lat) por orden; se trazan por la vía
CERCANIAS = {
    'Madrid': {
        'C2': [('Guadalajara', -3.1786, 40.6441), ('Alcalá de Henares', -3.3667, 40.4893), ('Atocha', -3.6908, 40.4066), ('Chamartín', -3.6827, 40.4722)],
        'C3': [('Aranjuez', -3.6006, 40.0337), ('Pinto', -3.6987, 40.2423), ('Atocha', -3.6908, 40.4066), ('Sol', -3.7038, 40.4169)],
        'C4': [('Parla', -3.7680, 40.2370), ('Getafe Centro', -3.7319, 40.3080), ('Atocha', -3.6908, 40.4066), ('Alcobendas', -3.6380, 40.5370)],
        'C5': [('Móstoles', -3.8640, 40.3220), ('Fuenlabrada', -3.7960, 40.2840), ('Atocha', -3.6908, 40.4066), ('Humanes', -3.8270, 40.2520)],
        'C10': [('Villalba', -4.0050, 40.6360), ('Pozuelo', -3.8120, 40.4350), ('Príncipe Pío', -3.7200, 40.4210), ('Atocha', -3.6908, 40.4066)],
    },
    'Rodalies Catalunya': {
        'R1': [('L\'Hospitalet', 2.1000, 41.3600), ('Barcelona-Sants', 2.1403, 41.3791), ('Badalona', 2.2450, 41.4500), ('Mataró', 2.4440, 41.5370)],
        'R2': [('Castelldefels', 1.9760, 41.2800), ('Barcelona-Sants', 2.1403, 41.3791), ('Montcada', 2.1790, 41.4900), ('Granollers', 2.2870, 41.6080)],
        'R4': [('Sant Vicenç de Calders', 1.5340, 41.1880), ('Barcelona-Sants', 2.1403, 41.3791), ('Terrassa', 2.0130, 41.5620), ('Manresa', 1.8260, 41.7250)],
    },
    'València': {
        'C1': [('València Nord', -0.3770, 39.4660), ('Silla', -0.4120, 39.3630), ('Cullera', -0.2540, 39.1660), ('Gandia', -0.1800, 38.9700)],
        'C2': [('València Nord', -0.3770, 39.4660), ('Alzira', -0.4370, 39.1520), ('Xàtiva', -0.5190, 38.9900)],
        'C6': [('València Nord', -0.3770, 39.4660), ('Sagunt', -0.2690, 39.6780), ('Castelló', -0.0510, 39.9870)],
    },
    'Sevilla': {
        'C1': [('Lora del Río', -5.5310, 37.6560), ('Santa Justa', -5.9754, 37.3917), ('Dos Hermanas', -5.9230, 37.2830), ('Utrera', -5.7790, 37.1830)],
    },
    'Bilbao': {
        'C1': [('Abando', -2.9277, 43.2603), ('Barakaldo', -2.9890, 43.2970), ('Santurtzi', -3.0320, 43.3290)],
        'C3': [('Abando', -2.9277, 43.2603), ('Llodio', -2.9630, 43.1430), ('Orduña', -3.0100, 42.9930)],
    },
    'Málaga': {
        'C1': [('Málaga Centro', -4.4280, 36.7150), ('Aeropuerto', -4.4910, 36.6740), ('Torremolinos', -4.4990, 36.6250), ('Fuengirola', -4.6250, 36.5400)],
    },
    'Asturias': {
        'C1': [('Gijón', -5.6630, 43.5380), ('Oviedo', -5.8540, 43.3670), ('Mieres', -5.7720, 43.2510)],
    },
}
cercanias = {}
for nucleo, lineas_n in CERCANIAS.items():
    for linea, paradas in lineas_n.items():
        pts = [paradas[0][1:]]
        for (_, *a), (_, *b) in zip(paradas, paradas[1:]):
            c = camino(cercano(*a), cercano(*b))
            recta = km(a, b)
            if c and sum(km(p, q) for p, q in zip(c, c[1:])) < 3 * recta + 5: pts += [list(p) for p in c]
            pts.append(b)
        largo = [0]
        for p, q in zip(pts, pts[1:]): largo.append(largo[-1] + km(p, q))
        fracs, k = [], 0
        for n, lon, lat in paradas:  # fracción del recorrido en la que está cada parada
            k = min(range(k, len(pts)), key=lambda i: km(pts[i], (lon, lat)))
            fracs.append(round(largo[k] / largo[-1], 4))
        cercanias.setdefault(nucleo, {})[linea] = {'pts': r3(simplificar(pts, 0.001)), 'km': round(largo[-1]),
                                                   'paradas': [[n, lon, lat, f] for (n, lon, lat), f in zip(paradas, fracs)]}
        print(f'Cercanías {nucleo} {linea}: {largo[-1]:.0f} km')

vias = [r3(simplificar(v, 0.002)) for v in vias]
datos = {'paises': paises, 'provincias': provincias, 'vias': vias, 'recorridos': recorridos, 'cercanias': cercanias}
SALIDA.write_text('// Generado por tools/generar-mapa.py con datos de Natural Earth (dominio público).\n'
                  'window.MAPA_ESPANA = ' + json.dumps(datos, separators=(',', ':')) + ';\n')
print(SALIDA, f'{SALIDA.stat().st_size / 1024:.0f} KB', len(vias), 'tramos de vía')
