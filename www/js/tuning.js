// Catálogo del taller: piezas que se compran con monedas para cada coche.
// value: dato que usa el modelo 3D (p. ej. el color de las llantas o del neón).
export const TUNING = {
  spoiler: {
    label: 'Alerón',
    options: [
      { id: 'stock', name: 'De serie', price: 0 },
      { id: 'lip', name: 'Labio', price: 300 },
      { id: 'ducktail', name: 'Cola de pato', price: 700 },
      { id: 'gt', name: 'Alerón GT', price: 1500 },
    ],
  },
  kit: {
    label: 'Body kit',
    options: [
      { id: 'stock', name: 'De serie', price: 0 },
      { id: 'sport', name: 'Deportivo', price: 1200 },
      { id: 'wide', name: 'Carrocería ancha', price: 3000 },
    ],
  },
  rims: {
    label: 'Llantas',
    options: [
      { id: 'stock', name: 'De serie', price: 0 },
      { id: 'black', name: 'Negras', price: 250, value: '#1b1c1f' },
      { id: 'white', name: 'Blancas', price: 250, value: '#e9ecef' },
      { id: 'gold', name: 'Doradas', price: 400, value: '#b8913a' },
      { id: 'red', name: 'Rojas', price: 300, value: '#b4161b' },
      { id: 'chrome', name: 'Cromadas', price: 500, value: '#f2f4f7' },
    ],
  },
  height: {
    label: 'Suspensión',
    options: [
      { id: 'stock', name: 'De serie', price: 0, value: 0 },
      { id: 'low', name: 'Rebajada', price: 800, value: -0.03 },
      { id: 'slammed', name: 'Muy rebajada', price: 1500, value: -0.055 },
    ],
  },
  neon: {
    label: 'Neón',
    options: [
      { id: 'stock', name: 'Sin neón', price: 0 },
      { id: 'blue', name: 'Azul', price: 500, value: '#2f7bff' },
      { id: 'purple', name: 'Morado', price: 500, value: '#a24bff' },
      { id: 'green', name: 'Verde', price: 500, value: '#22e06b' },
      { id: 'red', name: 'Rojo', price: 500, value: '#ff2d2d' },
      { id: 'white', name: 'Blanco', price: 500, value: '#f4f7ff' },
    ],
  },
};

export const TUNING_ORDER = ['spoiler', 'kit', 'rims', 'height', 'neon'];

export const DEFAULT_TUNING = { spoiler: 'stock', kit: 'stock', rims: 'stock', height: 'stock', neon: 'stock' };

export function tuningOption(cat, id) {
  return TUNING[cat].options.find(o => o.id === id) || TUNING[cat].options[0];
}
