// Datos de los coches (sin dependencias de Three.js para poder testearlos en Node).
export const CARS = {
  sedan:  { name: 'Berlina',     price: 0,    w: 1.84, l: 4.5,  h: 1.45, wb: 2.7,  wheelR: 0.34, accel: 5.5, brake: 9,   maxSpeed: 17, maxReverse: 5, maxSteer: 0.62, steerRate: 2.2, style: 'sedan' },
  hatch:  { name: 'Compacto',    price: 400,  w: 1.76, l: 3.95, h: 1.5,  wb: 2.45, wheelR: 0.32, accel: 6,   brake: 9.5, maxSpeed: 16, maxReverse: 5, maxSteer: 0.66, steerRate: 2.4, style: 'hatch' },
  suv:    { name: 'Todoterreno', price: 1200, w: 1.98, l: 4.7,  h: 1.8,  wb: 2.85, wheelR: 0.4,  accel: 5,   brake: 8.5, maxSpeed: 17, maxReverse: 5, maxSteer: 0.58, steerRate: 2.0, style: 'suv' },
  pickup: { name: 'Pick-up',     price: 1800, w: 2.0,  l: 5.1,  h: 1.85, wb: 3.1,  wheelR: 0.42, accel: 4.8, brake: 8,   maxSpeed: 17, maxReverse: 5, maxSteer: 0.6,  steerRate: 2.0, style: 'pickup' },
  sport:  { name: 'Deportivo',   price: 3000, w: 1.95, l: 4.45, h: 1.2,  wb: 2.6,  wheelR: 0.35, accel: 9.5, brake: 11,  maxSpeed: 28, maxReverse: 6, maxSteer: 0.6,  steerRate: 2.6, style: 'sport' },
};

export const CAR_ORDER = ['sedan', 'hatch', 'suv', 'pickup', 'sport'];

export const COLORS = ['#d62828', '#f77f00', '#fcbf49', '#2a9d8f', '#1d4ed8', '#7c3aed', '#111827', '#f1f5f9', '#64748b', '#ec4899'];
