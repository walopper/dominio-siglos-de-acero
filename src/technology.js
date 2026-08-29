/**
 * Árbol tecnológico canónico de DOMINIO: SIGLOS DE ACERO.
 *
 * Este módulo no conoce la simulación ni el DOM. Sus datos y helpers son puros
 * para que economía, campaña e IA puedan integrarlos sin compartir estado.
 */

export const TECHNOLOGY_ERAS = deepFreeze([
  {
    id: 0, key: 'vapor', nombre: 'Era del Vapor', desde: 1800, hasta: 1899,
    descripcion: 'Mecanización mediante vapor, ferrocarril y comunicaciones eléctricas tempranas.',
  },
  {
    id: 1, key: 'industria-electrica', nombre: 'Era de la Industria Eléctrica', desde: 1900, hasta: 1999,
    descripcion: 'Electricidad, combustión, producción en serie, aviación y fuerzas blindadas.',
  },
  {
    id: 2, key: 'red', nombre: 'Era de la Red', desde: 2000, hasta: 2099,
    descripcion: 'Redes digitales, navegación satelital, sistemas no tripulados y energía distribuida.',
  },
  {
    id: 3, key: 'orbital', nombre: 'Era Orbital', desde: 2100, hasta: 2199,
    descripcion: 'Fusión comercial, autonomía avanzada e infraestructura industrial fuera de la Tierra.',
  },
]);

export const TECHNOLOGIES = deepFreeze([
  {
    id: 'maquina-de-vapor', nombre: 'Máquina de vapor industrial', era: 0, anio: 1800,
    descripcion: 'Convierte el calor del carbón en trabajo mecánico estable para minas, talleres y transporte.',
    prerequisitos: [], costo: { madera: 120, acero: 80, conocimiento: 70 }, tiempo: 34,
    edificio: 'universidad',
    efectos: {
      economia: { produccion: 0.08, recoleccionAcero: 0.1 },
      desbloqueos: { edificios: ['fabrica'] },
    },
  },
  {
    id: 'ferrocarril', nombre: 'Ferrocarril de vapor', era: 0, anio: 1825,
    descripcion: 'Conecta centros industriales y reduce el coste estratégico de transportar tropas y materiales.',
    prerequisitos: ['maquina-de-vapor'], costo: { madera: 160, acero: 130, conocimiento: 90 }, tiempo: 42,
    edificio: 'universidad',
    efectos: {
      logistica: { velocidadTerrestre: 0.12, capacidadSuministro: 0.15 },
      desbloqueos: { edificios: ['estacion-ferroviaria'] },
    },
  },
  {
    id: 'telegrafo', nombre: 'Telégrafo eléctrico', era: 0, anio: 1844,
    descripcion: 'Transmite órdenes a distancia y coordina guarniciones, ferrocarriles y reservas militares.',
    prerequisitos: ['maquina-de-vapor'], costo: { acero: 75, energia: 35, conocimiento: 130 }, tiempo: 38,
    edificio: 'universidad',
    efectos: {
      mando: { vision: 0.1, velocidadOrdenes: 0.18 },
      desbloqueos: { edificios: ['estacion-telegrafica'] },
    },
  },
  {
    id: 'produccion-mecanizada', nombre: 'Producción mecanizada', era: 0, anio: 1850,
    descripcion: 'Estandariza herramientas y piezas para fabricar equipos con mayor velocidad y regularidad.',
    prerequisitos: ['maquina-de-vapor'], costo: { madera: 110, acero: 150, conocimiento: 115 }, tiempo: 45,
    edificio: 'fabrica',
    efectos: { economia: { produccion: 0.07 }, unidades: { tiempoEntrenamiento: -0.06 } },
  },

  {
    id: 'red-electrica', nombre: 'Red eléctrica', era: 1, anio: 1900,
    descripcion: 'Distribuye energía entre fábricas, viviendas y defensas para sostener producción continua.',
    prerequisitos: ['produccion-mecanizada'], costo: { acero: 180, energia: 120, conocimiento: 160 }, tiempo: 52,
    edificio: 'universidad',
    efectos: {
      economia: { produccion: 0.07, energia: 0.18 },
      desbloqueos: { edificios: ['central'] },
    },
  },
  {
    id: 'motor-combustion', nombre: 'Motor de combustión', era: 1, anio: 1900,
    descripcion: 'Proporciona propulsión compacta a vehículos terrestres y abre el camino a la aviación.',
    prerequisitos: ['produccion-mecanizada'], costo: { acero: 190, energia: 105, conocimiento: 145 }, tiempo: 48,
    edificio: 'fabrica',
    efectos: {
      unidades: { velocidadVehiculos: 0.12 },
      desbloqueos: { unidades: ['vehiculo-exploracion'] },
    },
  },
  {
    id: 'aviacion', nombre: 'Aviación propulsada', era: 1, anio: 1903,
    descripcion: 'Lleva reconocimiento y ataque al aire mediante aeronaves controladas y motores ligeros.',
    prerequisitos: ['motor-combustion'], costo: { acero: 210, energia: 150, conocimiento: 220 }, tiempo: 58,
    edificio: 'universidad',
    efectos: {
      mando: { vision: 0.14 },
      desbloqueos: { edificios: ['aerodromo'], unidades: ['observador-aereo'] },
    },
  },
  {
    id: 'produccion-en-serie', nombre: 'Producción en serie', era: 1, anio: 1913,
    descripcion: 'Organiza cadenas de montaje y piezas intercambiables para fabricar equipos a gran escala.',
    prerequisitos: ['produccion-mecanizada', 'red-electrica'],
    costo: { acero: 240, energia: 170, conocimiento: 210 }, tiempo: 61,
    edificio: 'fabrica',
    efectos: { economia: { produccion: 0.14 }, unidades: { tiempoEntrenamiento: -0.1 } },
  },
  {
    id: 'blindados', nombre: 'Fuerzas blindadas', era: 1, anio: 1916,
    descripcion: 'Combina protección, orugas y potencia de fuego para atravesar posiciones defensivas preparadas.',
    prerequisitos: ['motor-combustion', 'produccion-en-serie'],
    costo: { acero: 320, energia: 210, conocimiento: 230 }, tiempo: 68,
    edificio: 'fabrica',
    efectos: {
      unidades: { armaduraVehiculos: 0.12 },
      desbloqueos: { unidades: ['tanque'] },
    },
  },

  {
    id: 'redes-digitales', nombre: 'Redes digitales', era: 2, anio: 2000,
    descripcion: 'Integra sensores, centros de datos y comunicaciones resistentes en una red de mando común.',
    prerequisitos: ['telegrafo', 'red-electrica'],
    costo: { energia: 290, acero: 130, conocimiento: 380 }, tiempo: 72,
    edificio: 'universidad',
    efectos: {
      mando: { velocidadOrdenes: 0.22, vision: 0.08 },
      desbloqueos: { edificios: ['centro-datos'] },
    },
  },
  {
    id: 'gps', nombre: 'Navegación satelital GPS', era: 2, anio: 2000,
    descripcion: 'Aporta posicionamiento y tiempo precisos para movimiento coordinado y ataques de precisión.',
    prerequisitos: ['redes-digitales'], costo: { energia: 250, acero: 100, conocimiento: 410 }, tiempo: 64,
    edificio: 'universidad',
    efectos: { unidades: { precision: 0.14, velocidadTerrestre: 0.06 }, mando: { vision: 0.06 } },
  },
  {
    id: 'drones', nombre: 'Sistemas aéreos no tripulados', era: 2, anio: 2000,
    descripcion: 'Despliega aeronaves remotas para reconocer, designar objetivos y atacar sin tripulación a bordo.',
    prerequisitos: ['redes-digitales', 'gps'], costo: { acero: 180, energia: 330, conocimiento: 390 }, tiempo: 70,
    edificio: 'fabrica',
    efectos: {
      mando: { vision: 0.12 },
      desbloqueos: { unidades: ['dron'] },
    },
  },
  {
    id: 'blindaje-reactivo', nombre: 'Blindaje reactivo', era: 2, anio: 2000,
    descripcion: 'Añade módulos defensivos que reducen la penetración de cargas explosivas contra vehículos.',
    prerequisitos: ['blindados', 'redes-digitales'], costo: { acero: 360, energia: 210, conocimiento: 320 }, tiempo: 66,
    edificio: 'fabrica',
    efectos: { unidades: { armaduraVehiculos: 0.18, resistenciaExplosiva: 0.22 } },
  },
  {
    id: 'microredes', nombre: 'Microredes resilientes', era: 2, anio: 2000,
    descripcion: 'Aísla generación y almacenamiento locales para mantener instalaciones críticas bajo ataque.',
    prerequisitos: ['red-electrica', 'redes-digitales'],
    costo: { acero: 190, energia: 350, conocimiento: 330 }, tiempo: 69,
    edificio: 'central',
    efectos: { economia: { energia: 0.2 }, edificios: { resistenciaEnergetica: 0.25 } },
  },

  {
    id: 'fusion-comercial', nombre: 'Fusión comercial', era: 3, anio: 2100,
    descripcion: 'Convierte reactores de fusión maduros en una fuente continua para industria y logística orbital.',
    prerequisitos: ['microredes'], costo: { acero: 620, energia: 780, conocimiento: 900 }, tiempo: 110,
    edificio: 'central',
    efectos: { economia: { energia: 0.45 }, desbloqueos: { edificios: ['reactor-fusion'] } },
  },
  {
    id: 'autonomia-robotica', nombre: 'Autonomía robótica cooperativa', era: 3, anio: 2100,
    descripcion: 'Coordina robots capaces de repartirse tareas, mantener infraestructura y operar sin enlace constante.',
    prerequisitos: ['drones', 'redes-digitales'],
    costo: { acero: 380, energia: 520, conocimiento: 760 }, tiempo: 96,
    edificio: 'universidad',
    efectos: {
      economia: { construccion: 0.2 }, unidades: { precision: 0.1 },
      desbloqueos: { unidades: ['robot-cooperativo'] },
    },
  },
  {
    id: 'energia-superficial-lunar', nombre: 'Energía superficial lunar', era: 3, anio: 2100,
    descripcion: 'Distribuye generación y almacenamiento resistentes para sostener operaciones durante el ciclo lunar.',
    prerequisitos: ['microredes'], costo: { acero: 440, energia: 600, conocimiento: 610 }, tiempo: 92,
    edificio: 'central',
    efectos: {
      edificios: { resistenciaEnergetica: 0.3 },
      desbloqueos: { edificios: ['nodo-energia-lunar'] },
    },
  },
  {
    id: 'isru-lunar', nombre: 'Utilización de recursos lunares', era: 3, anio: 2100,
    descripcion: 'Extrae y procesa materiales locales para reducir la masa que debe transportarse desde la Tierra.',
    prerequisitos: ['autonomia-robotica', 'energia-superficial-lunar'],
    costo: { acero: 530, energia: 680, conocimiento: 820 }, tiempo: 104,
    edificio: 'universidad',
    efectos: {
      economia: { recoleccionAcero: 0.28, construccion: 0.15 },
      desbloqueos: { edificios: ['planta-isru'] },
    },
  },
  {
    id: 'infraestructura-orbital', nombre: 'Infraestructura orbital integrada', era: 3, anio: 2100,
    descripcion: 'Enlaza puertos, repetidores, hábitats y transporte para sostener una economía cislunar permanente.',
    prerequisitos: ['isru-lunar', 'gps', 'fusion-comercial'],
    costo: { acero: 760, energia: 880, conocimiento: 980 }, tiempo: 124,
    edificio: 'cuartelGeneral',
    efectos: {
      logistica: { capacidadSuministro: 0.35 },
      desbloqueos: { edificios: ['puerto-orbital', 'repetidor-orbital', 'habitat-lunar'] },
    },
  },
]);

/** Devuelve un diagnóstico completo sin alterar el grafo recibido. */
export function validateTechnologyGraph(technologies = TECHNOLOGIES, eras = TECHNOLOGY_ERAS) {
  const errors = [];
  if (!Array.isArray(technologies)) return { valid: false, errors: ['El grafo de tecnologías debe ser un arreglo.'] };

  const eraById = new Map(eras.map((era) => [era.id, era]));
  const byId = new Map();
  for (const technology of technologies) {
    if (!technology || typeof technology.id !== 'string' || !technology.id) {
      errors.push('Cada tecnología debe tener un id no vacío.');
      continue;
    }
    if (byId.has(technology.id)) errors.push(`Id de tecnología duplicado: ${technology.id}.`);
    else byId.set(technology.id, technology);

    const era = eraById.get(technology.era);
    if (!era) errors.push(`Era desconocida para ${technology.id}: ${String(technology.era)}.`);
    else if (!Number.isInteger(technology.anio) || technology.anio < era.desde || technology.anio > era.hasta) {
      errors.push(`El año de ${technology.id} queda fuera de su banda temporal.`);
    }
    if (!Array.isArray(technology.prerequisitos)) errors.push(`Prerequisitos inválidos en ${technology.id}.`);
    if (!isPositiveCost(technology.costo)) errors.push(`Coste inválido en ${technology.id}.`);
    if (!Number.isFinite(technology.tiempo) || technology.tiempo <= 0) errors.push(`Tiempo inválido en ${technology.id}.`);
    if (typeof technology.edificio !== 'string' || !technology.edificio) errors.push(`Edificio inválido en ${technology.id}.`);
    if (!isPlainObject(technology.efectos) || !Object.keys(technology.efectos).length) errors.push(`Efectos inválidos en ${technology.id}.`);
  }

  for (const technology of technologies) {
    if (!technology?.id || !Array.isArray(technology.prerequisitos)) continue;
    for (const prerequisite of technology.prerequisitos) {
      const parent = byId.get(prerequisite);
      if (!parent) errors.push(`Prerequisito inexistente en ${technology.id}: ${prerequisite}.`);
      else if (parent.era > technology.era) errors.push(`Prerequisito futuro en ${technology.id}: ${prerequisite}.`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (id, path) => {
    if (visiting.has(id)) {
      errors.push(`Ciclo tecnológico detectado: ${[...path, id].join(' -> ')}.`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const technology = byId.get(id);
    for (const prerequisite of technology?.prerequisitos ?? []) {
      if (byId.has(prerequisite)) visit(prerequisite, [...path, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id, []);

  return { valid: errors.length === 0, errors };
}

/** Explica si una tecnología concreta puede investigarse en el estado dado. */
export function technologyAvailability(id, state = {}, technologies = TECHNOLOGIES) {
  const technology = technologies.find((candidate) => candidate.id === id);
  if (!technology) throw new RangeError(`Tecnología desconocida: ${String(id)}.`);

  const researched = new Set(state.researched ?? []);
  const buildings = new Set(state.buildings ?? []);
  const alreadyResearched = researched.has(id);
  const eraLocked = (state.era ?? 0) < technology.era;
  const buildingAvailable = buildings.has(technology.edificio);
  const missingPrerequisites = technology.prerequisitos.filter((prerequisite) => !researched.has(prerequisite));
  return {
    id,
    available: !alreadyResearched && !eraLocked && buildingAvailable && missingPrerequisites.length === 0,
    alreadyResearched,
    eraLocked,
    requiredBuilding: technology.edificio,
    buildingAvailable,
    missingPrerequisites,
  };
}

/** Lista tecnologías investigables conservando el orden canónico. */
export function availableTechnologies(state = {}, technologies = TECHNOLOGIES) {
  return technologies.filter((technology) => technologyAvailability(technology.id, state, technologies).available);
}

/** Acumula efectos numéricos y desbloqueos sin mutar las definiciones. */
export function accumulateTechnologyEffects(researchedIds = [], technologies = TECHNOLOGIES) {
  const byId = new Map(technologies.map((technology) => [technology.id, technology]));
  const result = {};
  for (const id of new Set(researchedIds)) {
    const technology = byId.get(id);
    if (!technology) throw new RangeError(`Tecnología desconocida: ${String(id)}.`);
    mergeEffects(result, technology.efectos);
  }
  return result;
}

function mergeEffects(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number') {
      target[key] = Number(((target[key] ?? 0) + value).toFixed(10));
    } else if (Array.isArray(value)) {
      target[key] = [...new Set([...(target[key] ?? []), ...value])];
    } else if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) target[key] = {};
      mergeEffects(target[key], value);
    } else if (typeof value === 'boolean') {
      target[key] = Boolean(target[key] || value);
    }
  }
}

function isPositiveCost(cost) {
  return isPlainObject(cost)
    && Object.keys(cost).length > 0
    && Object.values(cost).every((amount) => Number.isFinite(amount) && amount > 0);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const canonicalValidation = validateTechnologyGraph();
if (!canonicalValidation.valid) {
  throw new Error(`Árbol tecnológico inválido: ${canonicalValidation.errors.join(' ')}`);
}
