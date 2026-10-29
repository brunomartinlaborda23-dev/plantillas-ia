// Partida guardada en el dispositivo.
const KEY = 'parkingpro_save_v1';
const DEFAULTS = { coins: 0, owned: ['sedan'], car: 'sedan', color: '#d62828', stars: {}, muted: false };

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const save = load();

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Almacenamiento no disponible: la partida dura solo esta sesión.
  }
}
