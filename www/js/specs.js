// Datos de los coches (sin dependencias de Three.js para poder testearlos en Node).
// Medidas en metros. gears: velocidad (m/s) al corte de cada marcha, para el sonido del motor.
const ENG_STD = { idle: 850, red: 6200, gears: [8, 14, 21, 28, 36], tone: 2 };

export const CARS = {
  sedan:  { name: 'Berlina',     price: 0, grip: 8.5, hp: 150, zero100: 9.5,  w: 1.84, l: 4.6,  h: 1.45, wb: 2.75, wheelR: 0.33, accel: 5.5,  brake: 9,   maxSpeed: 17, maxReverse: 5, maxSteer: 0.62, steerRate: 2.2, engine: ENG_STD },
  hatch:  { name: 'Compacto',    price: 400, grip: 8.5, hp: 110, zero100: 10.8, w: 1.78, l: 4.05, h: 1.47, wb: 2.55, wheelR: 0.32, accel: 6,    brake: 9.5, maxSpeed: 16, maxReverse: 5, maxSteer: 0.66, steerRate: 2.4, engine: { ...ENG_STD, red: 6500 } },
  suv:    { name: 'Todoterreno', price: 1200, grip: 7.5, hp: 190, zero100: 8.9,  w: 1.95, l: 4.7,  h: 1.72, wb: 2.85, wheelR: 0.38, accel: 5,    brake: 8.5, maxSpeed: 17, maxReverse: 5, maxSteer: 0.58, steerRate: 2.0, engine: { ...ENG_STD, red: 4800, tone: 2 } },
  pickup: { name: 'Pick-up',     price: 1800, grip: 7.5, hp: 210, zero100: 9.8,  w: 2.0,  l: 5.1,  h: 1.85, wb: 3.1,  wheelR: 0.4,  accel: 4.8,  brake: 8,   maxSpeed: 17, maxReverse: 5, maxSteer: 0.6,  steerRate: 2.0, engine: { idle: 700, red: 5200, gears: [7, 13, 20, 27, 36], tone: 4 } },
  sport:  { name: 'Deportivo',   price: 3000, grip: 10, hp: 340, zero100: 5.2,  w: 1.92, l: 4.45, h: 1.28, wb: 2.6,  wheelR: 0.34, accel: 9.5,  brake: 11,  maxSpeed: 28, maxReverse: 6, maxSteer: 0.6,  steerRate: 2.6, engine: { idle: 900, red: 7000, gears: [10, 17, 25, 33, 42], tone: 3 } },
  // Superdeportivos (inspirados en coches reales, con nombre propio y sin logotipos)
  cs:     { name: 'Vector CS',   price: 4000, grip: 11, hp: 550, zero100: 3.4,  w: 1.89, l: 4.8,  h: 1.39, wb: 2.86, wheelR: 0.34, accel: 10.5, brake: 12,  maxSpeed: 34, maxReverse: 6, maxSteer: 0.6,  steerRate: 2.8, engine: { idle: 950, red: 7200, gears: [11, 18, 26, 34, 44], tone: 3 } },
  rs:     { name: 'Strada RS',   price: 6000, grip: 12, hp: 525, zero100: 3.2,  w: 1.9,  l: 4.57, h: 1.32, wb: 2.45, wheelR: 0.35, accel: 11,   brake: 13,  maxSpeed: 35, maxReverse: 6, maxSteer: 0.62, steerRate: 3.0, engine: { idle: 1000, red: 9000, gears: [12, 19, 27, 35, 45], tone: 3 } },
  hyper:  { name: 'Fulmine HY',  price: 10000, grip: 12.5, hp: 963, zero100: 2.6,  w: 1.99, l: 4.7,  h: 1.12, wb: 2.65, wheelR: 0.35, accel: 13,   brake: 14,  maxSpeed: 40, maxReverse: 6, maxSteer: 0.58, steerRate: 3.0, engine: { idle: 1000, red: 9250, gears: [13, 21, 30, 39, 50], tone: 6 } },
};

export const CAR_ORDER = ['sedan', 'hatch', 'suv', 'pickup', 'sport', 'cs', 'rs', 'hyper'];

export const COLORS = ['#d62828', '#f77f00', '#fcbf49', '#2a9d8f', '#1d4ed8', '#7c3aed', '#111827', '#f1f5f9', '#64748b', '#ec4899', '#6b8e23', '#0ea5e9'];
