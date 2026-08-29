import { TECHNOLOGIES, accumulateTechnologyEffects, technologyAvailability } from './technology.js';

/**
 * Núcleo determinista de simulación para "Horizontes 1800–2100".
 *
 * El módulo no depende del DOM ni de Three.js. El renderizador sólo consume
 * `getRenderState()` y traduce las coordenadas del mundo (x, z) a la escena.
 * Todas las mutaciones pasan por métodos de `SimulacionRTS`, lo que permite
 * repetir una partida exactamente usando la misma semilla y las mismas órdenes.
 */

const FIXED_STEP = 1 / 20;
const MAX_EVENTS = 80;
const MAP_BOUNDS = Object.freeze({ minX: -80, maxX: 80, minZ: -60, maxZ: 60 });
const NAVIGATION_CLEARANCE = 0.32;
const UNIT_SEPARATION_CLEARANCE = 0.08;
const REPAIR_HP_PER_SECOND = 18;
const REPAIR_STEEL_PER_HP = 0.08;
const FOG_CELL_SIZE = 4;
const FOG_COLUMNS = Math.ceil((MAP_BOUNDS.maxX - MAP_BOUNDS.minX) / FOG_CELL_SIZE);
const FOG_ROWS = Math.ceil((MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ) / FOG_CELL_SIZE);
const AI_BASE_DEFENSE_RADIUS = 32;
const FORMATION_SPACING = 2.4;
const DEFENSIVE_PURSUIT_RADIUS = 10;
const AI_FORCE_PROFILES = Object.freeze([
  Object.freeze({ fusilero: 4, caballeria: 1 }),
  Object.freeze({ fusilero: 3, artilleria: 1, tanque: 1 }),
  Object.freeze({ fusilero: 2, artilleria: 1, tanque: 1, dron: 2 }),
  Object.freeze({ exotraje: 2, dron: 1, caminante: 1 }),
]);

export const ERAS = Object.freeze([
  Object.freeze({
    id: 0,
    year: 1800,
    key: 'vapor',
    nombre: 'Era del Vapor',
    periodo: '1800–1899',
    descripcion: 'Vapor, ferrocarril y nacimiento de la producción mecanizada.',
    color: '#c98b48',
    costo: null,
  }),
  Object.freeze({
    id: 1,
    year: 1900,
    key: 'industria',
    nombre: 'Era de la Industria Eléctrica',
    periodo: '1900–1999',
    descripcion: 'Electricidad, combustión, producción en masa, aviación y fuerzas blindadas.',
    color: '#7f8d76',
    costo: Object.freeze({ alimentos: 420, madera: 240, acero: 320, energia: 120, conocimiento: 140 }),
  }),
  Object.freeze({
    id: 2,
    year: 2000,
    key: 'red',
    nombre: 'Era de la Red',
    periodo: '2000–2099',
    descripcion: 'Redes digitales, navegación satelital, microredes, drones y guerra de precisión.',
    color: '#27b9d6',
    costo: Object.freeze({ alimentos: 650, madera: 260, acero: 560, energia: 420, conocimiento: 520 }),
  }),
  Object.freeze({
    id: 3,
    year: 2100,
    key: 'orbital',
    nombre: 'Era Orbital',
    periodo: '2100–2199',
    descripcion: 'IA soberana, fusión, enjambres y dominio aeroespacial.',
    color: '#b87aff',
    costo: Object.freeze({ alimentos: 880, madera: 300, acero: 800, energia: 820, conocimiento: 980 }),
  }),
]);

const RESOURCE_KEYS = Object.freeze(['alimentos', 'madera', 'acero', 'energia', 'conocimiento']);

export const UNIT_DEFINITIONS = deepFreeze({
  obrero: {
    nombre: 'Pionero', era: 0, costo: { alimentos: 45 }, tiempo: 9, poblacion: 1,
    vida: 72, velocidad: 4.8, vision: 17, alcance: 1.6, ataque: 5, armadura: 0, cadencia: 1.15,
    rol: 'economia', radio: 0.55,
  },
  fusilero: {
    nombre: 'Fusilero de línea', era: 0, costo: { alimentos: 58, acero: 24 }, tiempo: 12, poblacion: 1,
    vida: 92, velocidad: 4.2, vision: 20, alcance: 8.5, ataque: 13, armadura: 1, cadencia: 1.4,
    rol: 'infanteria', radio: 0.58,
  },
  caballeria: {
    nombre: 'Caballería de exploración', era: 0, costo: { alimentos: 90, acero: 34 }, tiempo: 18, poblacion: 2,
    vida: 155, velocidad: 7.2, vision: 25, alcance: 2.1, ataque: 18, armadura: 2, cadencia: 1.2,
    rol: 'caballeria', radio: 0.78,
  },
  artilleria: {
    nombre: 'Artillería de campaña', era: 1, costo: { madera: 45, acero: 120, energia: 30 }, tiempo: 27, poblacion: 3,
    vida: 125, velocidad: 2.6, vision: 26, alcance: 18, ataque: 48, armadura: 2, cadencia: 4.1,
    rol: 'asedio', radio: 1.05, bonusEdificio: 1.7,
  },
  tanque: {
    nombre: 'Tanque de batalla', era: 1, costo: { acero: 180, energia: 90 }, tiempo: 31, poblacion: 4,
    vida: 390, velocidad: 4.5, vision: 24, alcance: 10.5, ataque: 39, armadura: 8, cadencia: 2.35,
    rol: 'blindado', radio: 1.2,
  },
  dron: {
    nombre: 'Enjambre de drones', era: 2, costo: { acero: 68, energia: 125, conocimiento: 55 }, tiempo: 24, poblacion: 2,
    vida: 130, velocidad: 8.4, vision: 32, alcance: 12.5, ataque: 26, armadura: 3, cadencia: 1.05,
    rol: 'aereo', radio: 0.8, altura: 3.5,
  },
  exotraje: {
    nombre: 'Infantería de exotraje', era: 3, costo: { alimentos: 75, acero: 110, energia: 95, conocimiento: 70 }, tiempo: 22, poblacion: 2,
    vida: 265, velocidad: 5.7, vision: 27, alcance: 11.5, ataque: 35, armadura: 7, cadencia: 0.85,
    rol: 'infanteria', radio: 0.72,
  },
  caminante: {
    nombre: 'Caminante autónomo', era: 3, costo: { acero: 260, energia: 240, conocimiento: 150 }, tiempo: 38, poblacion: 5,
    vida: 620, velocidad: 3.8, vision: 30, alcance: 16, ataque: 67, armadura: 12, cadencia: 2.7,
    rol: 'blindado', radio: 1.5, bonusEdificio: 1.25,
  },
});

export const BUILDING_DEFINITIONS = deepFreeze({
  cuartelGeneral: {
    nombre: 'Centro de mando', era: 0, costo: { madera: 360, acero: 220 }, tiempo: 65,
    vida: 1900, armadura: 8, radio: 4.2, vision: 28, poblacion: 18, produce: ['obrero'], depositoRecursos: true,
  },
  vivienda: {
    nombre: 'Barrio residencial', era: 0, costo: { madera: 85, acero: 18 }, tiempo: 22,
    vida: 460, armadura: 3, radio: 2.35, vision: 12, poblacion: 8, produce: [],
  },
  cuartel: {
    nombre: 'Cuartel', era: 0, costo: { madera: 135, acero: 75 }, tiempo: 35,
    vida: 810, armadura: 5, radio: 3.1, vision: 18, poblacion: 0, produce: ['fusilero', 'caballeria', 'exotraje'],
  },
  fabrica: {
    nombre: 'Complejo fabril', era: 1, costo: { madera: 140, acero: 230, energia: 80 }, tiempo: 52,
    vida: 1050, armadura: 7, radio: 3.75, vision: 20, poblacion: 0, produce: ['artilleria', 'tanque', 'dron', 'caminante'],
  },
  universidad: {
    nombre: 'Instituto de investigación', era: 0, costo: { madera: 175, acero: 110, conocimiento: 60 }, tiempo: 46,
    vida: 720, armadura: 4, radio: 3.25, vision: 22, poblacion: 0, produce: [], conocimientoPorSegundo: 0.75,
  },
  central: {
    nombre: 'Central energética', era: 1, costo: { madera: 90, acero: 165 }, tiempo: 41,
    vida: 760, armadura: 5, radio: 3.15, vision: 16, poblacion: 0, produce: [], energiaPorSegundo: 2.2,
  },
  bastion: {
    nombre: 'Bastión defensivo', era: 0, costo: { madera: 85, acero: 115 }, tiempo: 38,
    vida: 980, armadura: 9, radio: 2.1, vision: 24, poblacion: 0, produce: [],
    alcance: 15, ataque: 22, cadencia: 1.6,
  },
});

export const RESOURCE_DEFINITIONS = deepFreeze({
  alimentos: { nombre: 'Alimentos', color: '#e3b65c', tasa: 7.2, capacidadCarga: 24 },
  madera: { nombre: 'Madera', color: '#6f9b55', tasa: 5.6, capacidadCarga: 20 },
  acero: { nombre: 'Acero', color: '#8fa2ad', tasa: 4.5, capacidadCarga: 18 },
  energia: { nombre: 'Energía', color: '#e8d84b', tasa: 3.8, capacidadCarga: 16 },
  conocimiento: { nombre: 'Conocimiento', color: '#4fd4f2', tasa: 2.8, capacidadCarga: 14 },
});

export const SIMULATION_CONSTANTS = deepFreeze({
  fixedStep: FIXED_STEP,
  mapBounds: MAP_BOUNDS,
  fogCellSize: FOG_CELL_SIZE,
  dominationSeconds: 90,
  dominationPointsRequired: 2,
  maxMatchSeconds: 35 * 60,
  maxSelection: 60,
  defensivePursuitRadius: DEFENSIVE_PURSUIT_RADIUS,
});

export const FORMATIONS = deepFreeze({
  linea: { nombre: 'Línea' },
  columna: { nombre: 'Columna' },
  cuna: { nombre: 'Cuña' },
});

export const UNIT_STANCES = deepFreeze({
  agresiva: { nombre: 'Agresiva' },
  defensiva: { nombre: 'Defensiva' },
  mantener_posicion: { nombre: 'Mantener posición' },
});

/** Crea una partida nueva. Es la entrada recomendada para main.js. */
export function createSimulation(options = {}) {
  return new SimulacionRTS(options);
}

/** Restaura una partida serializada por `SimulacionRTS.serialize()`. */
export function createSimulationFromSave(payload) {
  const parsed = parseSavePayload(payload);
  const simulation = new SimulacionRTS({
    seed: parsed.seed,
    ai: parsed.ai,
    difficulty: parsed.difficulty,
    startingEra: parsed.startingEra ?? parsed.state.teams.player.era,
  });
  simulation.load(parsed);
  return simulation;
}

export class SimulacionRTS {
  constructor({ seed = 18002100, ai = true, difficulty = 'normal', startingEra = 0 } = {}) {
    this.seed = normalizeSeed(seed);
    this.aiEnabled = Boolean(ai);
    this.difficulty = ['facil', 'normal', 'dificil'].includes(difficulty) ? difficulty : 'normal';
    this.startingEra = clamp(Math.floor(Number(startingEra) || 0), 0, ERAS.length - 1);
    this._listeners = new Set();
    this._accumulator = 0;
    this._nextEntityId = 1;
    this._nextEventId = 1;
    this._nextEffectId = 1;
    this._nextShotSequence = 1;
    this._rng = createRng(this.seed);
    this.state = createInitialState(this);
    this._updateFogOfWar();
    this._emit('partida_iniciada', 'La campaña Horizontes 1800–2100 ha comenzado.', { seed: this.seed });
  }

  /** Instantánea profunda y serializable. Modificarla no altera la simulación. */
  getState() {
    return clone(this.state);
  }

  /** Estado compacto pensado para render, HUD y window.render_game_to_text. */
  getRenderState() {
    const s = this.state;
    const localTeamId = s.localTeamId;
    return {
      version: s.version,
      mode: s.mode,
      paused: s.paused,
      time: round(s.time, 3),
      coordinateSystem: 'Origen en el centro; +x este/derecha, +z sur/abajo.',
      map: s.map,
      localTeamId,
      selectedIds: [...s.selectedIds],
      hoveredId: s.hoveredId,
      teams: Object.fromEntries(Object.entries(s.teams).map(([id, team]) => [id, {
        id: team.id,
        nombre: team.nombre,
        color: team.color,
        era: team.era,
        eraInfo: ERAS[team.era],
        recursos: { ...team.recursos },
        poblacion: team.poblacion,
        capacidad: team.capacidad,
        formation: normalizeFormation(team.formation),
        research: team.research ? { ...team.research } : null,
        technologies: {
          researched: [...(team.technologies?.researched || [])],
          active: team.technologies?.active ? { ...team.technologies.active } : null,
        },
        dominationTime: round(team.dominationTime, 2),
      }])),
      entities: s.entities
        .filter((entity) => entity.alive && this._isVisibleToTeam(entity, localTeamId))
        .map(renderEntity),
      resourceNodes: s.resourceNodes
        .filter((node) => node.amount > 0 && this._isVisibleToTeam(node, localTeamId))
        .map((node) => ({ ...node, amount: round(node.amount, 1) })),
      controlPoints: s.controlPoints.map((p) => ({ ...p, capture: round(p.capture, 2) })),
      fogOfWar: this.getFogOfWarSummary(localTeamId),
      effects: s.effects.map((e) => ({ ...e })),
      result: s.result ? { ...s.result } : null,
      recentEvents: s.events.slice(-8).map((e) => ({ ...e })),
    };
  }

  serialize() {
    return JSON.stringify({
      format: 'dominio-partida',
      version: 1,
      savedAt: new Date().toISOString(),
      seed: this.seed,
      ai: this.aiEnabled,
      difficulty: this.difficulty,
      startingEra: this.startingEra,
      rngState: this._rng.getState(),
      accumulator: this._accumulator,
      counters: {
        entity: this._nextEntityId,
        event: this._nextEventId,
        effect: this._nextEffectId,
        shot: this._nextShotSequence,
      },
      state: this.state,
    });
  }

  /** Carga in-place sin perder suscriptores del renderizador. */
  load(payload) {
    const parsed = parseSavePayload(payload);
    this.seed = normalizeSeed(parsed.seed);
    this.aiEnabled = Boolean(parsed.ai);
    this.difficulty = ['facil', 'normal', 'dificil'].includes(parsed.difficulty) ? parsed.difficulty : 'normal';
    this.startingEra = clamp(Math.floor(Number(parsed.startingEra ?? parsed.state.teams.player.era) || 0), 0, ERAS.length - 1);
    this.state = clone(parsed.state);
    this._accumulator = Number.isFinite(parsed.accumulator) ? clamp(parsed.accumulator, 0, FIXED_STEP) : 0;
    this._rng = createRng(this.seed, parsed.rngState);
    this._nextEntityId = nextCounter(parsed.counters?.entity, this.state.entities.map((entity) => Number(entity.id) || 0));
    this._nextEventId = nextCounter(parsed.counters?.event, this.state.events.map((event) => Number(event.id) || 0));
    this._nextEffectId = nextCounter(parsed.counters?.effect, this.state.effects.map((effect) => Number(String(effect.id).replace(/\D/g, '')) || 0));
    this._nextShotSequence = nextCounter(parsed.counters?.shot, this.state.effects.map((effect) => Number(effect.shotSequence) || 0));
    Object.values(this.state.teams).forEach((team) => {
      normalizeTeamTechnologies(team);
      team.formation = normalizeFormation(team.formation);
    });
    normalizeAIState(this.state);
    normalizeEconomicCarryState(this.state);
    normalizeUnitStances(this.state);
    Object.keys(this.state.teams).forEach((teamId) => this._refreshTeamTechnologyStats(teamId));
    for (const entity of this.state.entities) {
      if (entity.kind === 'building') entity.vision = BUILDING_DEFINITIONS[entity.type]?.vision || 0;
    }
    normalizeFogOfWar(this.state);
    this._updateFogOfWar();
    this.state.selectedIds = this.state.selectedIds.filter((id) => this._entity(id)?.alive);
    this._notify();
    return this.getRenderState();
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('subscribe requiere una función.');
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  setPaused(paused = true) {
    this.state.paused = Boolean(paused);
    this._touch();
    return this.state.paused;
  }

  togglePause() {
    return this.setPaused(!this.state.paused);
  }

  /** Avanza tiempo real en segundos usando ticks fijos de 50 ms. */
  step(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('step(seconds) requiere un valor finito no negativo.');
    if (this.state.paused || this.state.mode !== 'jugando') return this.getRenderState();
    this._accumulator += Math.min(seconds, 2);
    let steps = 0;
    while (this._accumulator + 1e-10 >= FIXED_STEP && steps < 40) {
      this._fixedUpdate(FIXED_STEP);
      this._accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (steps) this._notify();
    return this.getRenderState();
  }

  /** Conveniencia compatible con window.advanceTime(ms). */
  advance(milliseconds) {
    return this.step(milliseconds / 1000);
  }

  clearSelection() {
    this.state.selectedIds = [];
    this._touch();
    return [];
  }

  selectUnits(ids, { append = false } = {}) {
    const requested = new Set(Array.isArray(ids) ? ids : [ids]);
    const valid = this.state.entities
      .filter((e) => requested.has(e.id) && e.alive && e.teamId === this.state.localTeamId)
      .slice(0, SIMULATION_CONSTANTS.maxSelection)
      .map((e) => e.id);
    this.state.selectedIds = append
      ? [...new Set([...this.state.selectedIds, ...valid])].slice(0, SIMULATION_CONSTANTS.maxSelection)
      : valid;
    this._touch();
    return [...this.state.selectedIds];
  }

  selectAt(x, z, { radius = 1.6, append = false } = {}) {
    const candidate = this.state.entities
      .filter((e) => e.alive && e.teamId === this.state.localTeamId && distanceSq(e, { x, z }) <= (radius + e.radius) ** 2)
      .sort((a, b) => distanceSq(a, { x, z }) - distanceSq(b, { x, z }) || a.id - b.id)[0];
    if (!candidate) return append ? [...this.state.selectedIds] : this.clearSelection();
    return this.selectUnits(candidate.id, { append });
  }

  selectBox(minX, minZ, maxX, maxZ, { append = false, unitsOnly = true } = {}) {
    const left = Math.min(minX, maxX);
    const right = Math.max(minX, maxX);
    const top = Math.min(minZ, maxZ);
    const bottom = Math.max(minZ, maxZ);
    const ids = this.state.entities
      .filter((e) => e.alive && e.teamId === this.state.localTeamId && (!unitsOnly || e.kind === 'unit'))
      .filter((e) => e.x >= left && e.x <= right && e.z >= top && e.z <= bottom)
      .map((e) => e.id);
    return this.selectUnits(ids, { append });
  }

  setHovered(id = null) {
    this.state.hoveredId = this._entity(id)?.alive ? id : null;
  }

  setFormation(formation, teamId = this.state.localTeamId) {
    const team = this.state.teams[teamId];
    const canonical = normalizeFormation(formation, null);
    if (!team || !canonical) return this._failure('FORMACION_INVALIDA', 'La formación solicitada no existe.');
    team.formation = canonical;
    this._emit('formacion_seleccionada', `${team.nombre} adoptó formación de ${FORMATIONS[canonical].nombre.toLowerCase()}.`, {
      teamId,
      formation: canonical,
    });
    this._touch();
    return canonical;
  }

  setStance(stance) {
    const canonical = normalizeUnitStance(stance, null);
    if (!canonical) return this._failure('POSTURA_INVALIDA', 'La postura solicitada no existe.');
    const units = this._selectedUnits();
    if (!units.length) return this._failure('SIN_UNIDADES', 'Selecciona al menos una unidad.');
    units.forEach((unit) => {
      const activeOrder = unit.orders[0];
      if (activeOrder?.type === 'attack' && activeOrder.automatic) this._releaseAutomaticAttack(unit, activeOrder);
      unit.stance = canonical;
      unit.stanceAnchor = { x: unit.x, z: unit.z };
    });
    this._emit('postura_seleccionada', `${units.length} unidad(es) adoptaron postura ${UNIT_STANCES[canonical].nombre.toLowerCase()}.`, {
      stance: canonical,
      unitIds: units.map((unit) => unit.id),
    });
    this._touch();
    return { ok: true, stance: canonical, units: units.length };
  }

  issueMove(x, z, { queued = false, attackMove = false } = {}) {
    const destination = clampPoint({ x, z });
    const units = this._selectedUnits();
    const formation = normalizeFormation(this._localTeam().formation);
    const assignments = formationAssignments(units, destination, formation, queued);
    units.forEach((unit, index) => {
      const assignment = assignments[index];
      this._giveOrder(unit, {
        type: attackMove ? 'attackMove' : 'move',
        x: assignment.x,
        z: assignment.z,
        formation,
        formationSlot: index,
      }, queued);
    });
    if (units.length) this._emit('orden_movimiento', `${units.length} unidad(es) en marcha.`, { x, z, attackMove, formation });
    this._touch();
    return units.length;
  }

  issuePatrol(x, z, { queued = false } = {}) {
    const destination = clampPoint({ x, z });
    const units = this._selectedUnits();
    const formation = normalizeFormation(this._localTeam().formation);
    const assignments = formationAssignments(units, destination, formation, queued);
    units.forEach((unit, index) => {
      this._giveOrder(unit, {
        type: 'patrol',
        points: [
          queuedOrderOrigin(unit, queued),
          { x: assignments[index].x, z: assignments[index].z },
        ],
        pointIndex: 1,
        formation,
        formationSlot: index,
      }, queued);
    });
    if (units.length) this._emit('orden_patrulla', `Patrulla asignada a ${units.length} unidad(es).`, { x, z, formation });
    this._touch();
    return units.length;
  }

  issueAttack(targetId, { queued = false } = {}) {
    const target = this._entity(targetId);
    if (!target?.alive || target.teamId === this.state.localTeamId) return false;
    const units = this._selectedUnits().filter((u) => u.attack > 0);
    units.forEach((u) => this._giveOrder(u, {
      type: 'attack',
      targetId,
      anchor: { x: u.x, z: u.z },
    }, queued));
    if (units.length) this._emit('orden_ataque', `Objetivo fijado: ${target.nombre}.`, { targetId });
    this._touch();
    return units.length > 0;
  }

  issueGather(nodeId, { queued = false } = {}) {
    const node = this.state.resourceNodes.find((n) => n.id === nodeId && n.amount > 0);
    if (!node) return false;
    const workers = this._selectedUnits().filter((u) => u.type === 'obrero');
    workers.forEach((u) => {
      const cargo = normalizeWorkerCargo(u);
      const order = { type: 'gather', nodeId, phase: cargo.amount > 0 ? 'hacia_deposito' : 'hacia_recurso' };
      this._giveOrder(u, order, queued);
      if (!queued || u.orders[0] === order) u.gatherState = order.phase;
    });
    if (workers.length) this._emit('orden_recoleccion', `${workers.length} pionero(s) recolectarán ${RESOURCE_DEFINITIONS[node.resource].nombre}.`, { nodeId });
    this._touch();
    return workers.length > 0;
  }

  issueRepair(targetId, { queued = false } = {}) {
    const workers = this._selectedUnits().filter((unit) => unit.type === 'obrero');
    if (!workers.length) return this._failure('SIN_REPARADOR', 'Selecciona al menos un pionero para reparar.');

    const target = this._entity(targetId);
    if (!target?.alive || target.kind !== 'building' || !target.complete || target.teamId !== this.state.localTeamId) {
      return this._failure('EDIFICIO_INVALIDO', 'Solo se pueden reparar edificios aliados terminados.');
    }
    if (target.hp >= target.maxHp) return this._failure('REPARACION_INNECESARIA', 'El edificio ya está a plena vida.');
    if (this._localTeam().recursos.acero <= 0) return this._failure('ACERO_INSUFICIENTE', 'No hay acero disponible para reparar.');

    workers.forEach((worker) => this._giveOrder(worker, { type: 'repair', targetId }, queued));
    this._emit('orden_reparacion', `${workers.length} pionero(s) reparando ${target.nombre}.`, { targetId });
    this._touch();
    return { ok: true, targetId, workers: workers.length };
  }

  issueBuild(buildingType, x, z, { queued = false } = {}) {
    const def = BUILDING_DEFINITIONS[buildingType];
    const team = this._localTeam();
    const builders = this._selectedUnits().filter((u) => u.type === 'obrero');
    if (!def) return this._failure('TIPO_INVALIDO', 'Ese edificio no existe.');
    if (!builders.length) return this._failure('SIN_CONSTRUCTOR', 'Selecciona al menos un pionero.');
    if (def.era > team.era) return this._failure('ERA_INSUFICIENTE', `Requiere ${ERAS[def.era].nombre}.`);
    if (!canAfford(team.recursos, def.costo)) return this._failure('RECURSOS_INSUFICIENTES', 'No hay recursos suficientes.');
    const point = clampPoint({ x, z });
    if (!this._canPlace(point.x, point.z, def.radio)) return this._failure('UBICACION_BLOQUEADA', 'No se puede construir en esa ubicación.');
    spend(team.recursos, def.costo);
    const building = createBuilding(this, buildingType, team.id, point.x, point.z, false);
    this.state.entities.push(building);
    builders.forEach((u) => this._giveOrder(u, { type: 'build', targetId: building.id }, queued));
    this._emit('construccion_iniciada', `Comienza la construcción de ${def.nombre}.`, { entityId: building.id });
    this._touch();
    return { ok: true, entityId: building.id };
  }

  trainUnit(buildingId, unitType) {
    const building = this._entity(buildingId);
    const team = this._localTeam();
    const def = UNIT_DEFINITIONS[unitType];
    if (!building?.alive || building.kind !== 'building' || building.teamId !== team.id || !building.complete) {
      return this._failure('EDIFICIO_INVALIDO', 'Selecciona un edificio de producción terminado.');
    }
    if (!def || !BUILDING_DEFINITIONS[building.type].produce.includes(unitType)) {
      return this._failure('PRODUCCION_INVALIDA', 'Ese edificio no puede producir la unidad solicitada.');
    }
    if (def.era > team.era) return this._failure('ERA_INSUFICIENTE', `Requiere ${ERAS[def.era].nombre}.`);
    const reservedPop = this._reservedPopulation(team.id);
    if (team.poblacion + reservedPop + def.poblacion > team.capacidad) return this._failure('POBLACION_LLENA', 'Construye más viviendas.');
    if (!canAfford(team.recursos, def.costo)) return this._failure('RECURSOS_INSUFICIENTES', 'No hay recursos suficientes.');
    if (building.productionQueue.length >= 6) return this._failure('COLA_LLENA', 'La cola de producción está completa.');
    spend(team.recursos, def.costo);
    const trainingModifier = technologyEffects(team).unidades?.tiempoEntrenamiento || 0;
    building.productionQueue.push({ unitType, progress: 0, duration: def.tiempo * Math.max(0.4, 1 + trainingModifier) });
    this._emit('unidad_encolada', `${def.nombre} añadido a la cola.`, { buildingId, unitType });
    this._touch();
    return { ok: true, queueLength: building.productionQueue.length };
  }

  cancelTraining(buildingId, queueIndex = 0) {
    const building = this._entity(buildingId);
    if (!building?.alive || building.teamId !== this.state.localTeamId) return false;
    const [item] = building.productionQueue.splice(queueIndex, 1);
    if (!item) return false;
    refund(this._localTeam().recursos, UNIT_DEFINITIONS[item.unitType].costo, 0.75);
    this._touch();
    return true;
  }

  setRallyPoint(buildingId, x, z) {
    const building = this._entity(buildingId);
    if (!building?.alive || building.kind !== 'building' || building.teamId !== this.state.localTeamId) return false;
    building.rallyPoint = clampPoint({ x, z });
    this._touch();
    return true;
  }

  researchNextEra() {
    return this._beginEraResearch(this.state.localTeamId);
  }

  researchTechnology(buildingId, technologyId) {
    return this._beginTechnologyResearch(this.state.localTeamId, buildingId, technologyId);
  }

  cancelTechnologyResearch(teamId = this.state.localTeamId) {
    const team = this.state.teams[teamId];
    const active = team?.technologies?.active;
    if (!active) return false;
    const technology = TECHNOLOGIES.find((candidate) => candidate.id === active.id);
    if (technology) refund(team.recursos, technology.costo, 0.6);
    team.technologies.active = null;
    this._emit('tecnologia_cancelada', `${team.nombre} canceló la investigación.`, { teamId, technologyId: active.id });
    this._touch();
    return true;
  }

  /** Interfaz genérica útil para adaptar clic derecho/atajos desde main.js. */
  command(command) {
    if (!command || typeof command.type !== 'string') return this._failure('ORDEN_INVALIDA', 'La orden no es válida.');
    switch (command.type) {
      case 'move': return this.issueMove(command.x, command.z, command);
      case 'attackMove': return this.issueMove(command.x, command.z, { ...command, attackMove: true });
      case 'patrol': return this.issuePatrol(command.x, command.z, command);
      case 'formation':
      case 'setFormation': {
        const formation = this.setFormation(command.formation, command.teamId);
        return typeof formation === 'string' ? { ok: true, formation } : formation;
      }
      case 'stance':
      case 'setStance': return this.setStance(command.stance);
      case 'attack': return this.issueAttack(command.targetId, command);
      case 'gather': return this.issueGather(command.nodeId, command);
      case 'repair': return this.issueRepair(command.targetId, command);
      case 'build': return this.issueBuild(command.buildingType, command.x, command.z, command);
      case 'train': return this.trainUnit(command.buildingId, command.unitType);
      case 'researchEra': return this.researchNextEra();
      case 'researchTechnology': return this.researchTechnology(command.buildingId, command.technologyId);
      case 'stop': return this.issueStop();
      default: return this._failure('ORDEN_DESCONOCIDA', `Orden desconocida: ${command.type}.`);
    }
  }

  issueStop() {
    const units = this._selectedUnits();
    units.forEach((u) => {
      u.orders = [];
      u.velocity.x = 0;
      u.velocity.z = 0;
      if (u.type === 'obrero') u.gatherState = null;
    });
    this._touch();
    return units.length;
  }

  drainEvents() {
    const events = this.state.events.map((e) => ({ ...e }));
    this.state.events.length = 0;
    return events;
  }

  /** Resumen compacto para shaders, overlays y minimapa; los rangos son [inicio, longitud]. */
  getFogOfWarSummary(teamId = this.state.localTeamId) {
    const fog = normalizeFogOfWar(this.state);
    const explored = fog.exploredByTeam[teamId] || [];
    const visible = fog.visibleByTeam[teamId] || [];
    return {
      teamId,
      cellSize: fog.cellSize,
      columns: fog.columns,
      rows: fog.rows,
      origin: { x: MAP_BOUNDS.minX, z: MAP_BOUNDS.minZ },
      cellOrder: 'row-major-x',
      encoding: 'rle-index-ranges',
      exploredCount: explored.length,
      visibleCount: visible.length,
      exploredRanges: encodeIndexRanges(explored),
      visibleRanges: encodeIndexRanges(visible),
    };
  }

  _isVisibleToTeam(target, teamId) {
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return false;
    if (target.teamId === teamId) return true;
    const targetRadius = Math.max(0, Number(target.radius) || 0);
    return this.state.entities.some((observer) => {
      if (!observer.alive || observer.teamId !== teamId || !(observer.vision > 0)) return false;
      if (observer.kind === 'building' && !observer.complete) return false;
      const reach = observer.vision + targetRadius;
      return distanceSq(observer, target) <= reach * reach;
    });
  }

  _updateFogOfWar() {
    const fog = normalizeFogOfWar(this.state);
    for (const teamId of Object.keys(this.state.teams)) {
      const visible = new Set();
      const observers = this.state.entities.filter((entity) => (
        entity.alive
        && entity.teamId === teamId
        && entity.vision > 0
        && (entity.kind !== 'building' || entity.complete)
      ));
      for (const observer of observers) revealObserverCells(visible, observer, fog);
      const visibleCells = [...visible].sort((a, b) => a - b);
      fog.visibleByTeam[teamId] = visibleCells;
      fog.exploredByTeam[teamId] = mergeSortedIndices(fog.exploredByTeam[teamId], visibleCells);
    }
  }

  _fixedUpdate(dt) {
    this.state.time += dt;
    this._updatePassiveEconomy(dt);
    this._updateEraResearch(dt);
    this._updateTechnologyResearch(dt);
    this._updateConstructionAndProduction(dt);
    this._updateUnits(dt);
    this._resolveUnitSeparation();
    this._updateDefenses(dt);
    this._updateEffects(dt);
    this._updateControlPoints(dt);
    if (this.aiEnabled) this._updateAI(dt);
    this._cleanupDead();
    this._recalculatePopulation();
    this._updateFogOfWar();
    this._checkEndConditions();
    this._touch(false);
  }

  _updatePassiveEconomy(dt) {
    for (const building of this.state.entities) {
      if (!building.alive || building.kind !== 'building' || !building.complete) continue;
      const def = BUILDING_DEFINITIONS[building.type];
      const team = this.state.teams[building.teamId];
      const effects = technologyEffects(team);
      if (def.energiaPorSegundo) team.recursos.energia += def.energiaPorSegundo * (1 + (effects.economia?.energia || 0)) * dt;
      if (def.conocimientoPorSegundo) team.recursos.conocimiento += def.conocimientoPorSegundo * dt;
    }
    for (const team of Object.values(this.state.teams)) {
      for (const key of RESOURCE_KEYS) team.recursos[key] = round(Math.max(0, team.recursos[key]), 3);
    }
  }

  _updateEraResearch(dt) {
    for (const team of Object.values(this.state.teams)) {
      if (!team.research) continue;
      team.research.progress += dt;
      if (team.research.progress + 1e-9 < team.research.duration) continue;
      team.era = team.research.targetEra;
      team.research = null;
      this._emit('era_avanzada', `${team.nombre} ha alcanzado la ${ERAS[team.era].nombre}.`, { teamId: team.id, era: team.era });
    }
  }

  _updateTechnologyResearch(dt) {
    for (const team of Object.values(this.state.teams)) {
      const active = team.technologies?.active;
      if (!active) continue;
      const laboratory = this._entity(active.buildingId);
      if (!laboratory?.alive || !laboratory.complete || laboratory.teamId !== team.id) continue;
      active.progress += dt;
      if (active.progress + 1e-9 < active.duration) continue;
      if (!team.technologies.researched.includes(active.id)) team.technologies.researched.push(active.id);
      team.technologies.active = null;
      this._refreshTeamTechnologyStats(team.id);
      const technology = TECHNOLOGIES.find((candidate) => candidate.id === active.id);
      this._emit('tecnologia_completa', `${team.nombre} completó ${technology?.nombre || active.id}.`, {
        teamId: team.id,
        technologyId: active.id,
      });
    }
  }

  _updateConstructionAndProduction(dt) {
    for (const building of this.state.entities) {
      if (!building.alive || building.kind !== 'building') continue;
      if (!building.complete) {
        const builders = this.state.entities.filter((u) => u.alive && u.kind === 'unit' && u.type === 'obrero' && u.orders[0]?.type === 'build' && u.orders[0].targetId === building.id && distance(u, building) <= building.radius + 1.8);
        if (builders.length) {
          const constructionBonus = technologyEffects(this.state.teams[building.teamId]).economia?.construccion || 0;
          const speed = Math.min(2.75, (1 + (builders.length - 1) * 0.42) * (1 + constructionBonus));
          building.buildProgress += dt * speed / BUILDING_DEFINITIONS[building.type].tiempo;
          building.hp = Math.max(building.hp, building.maxHp * Math.min(1, 0.1 + building.buildProgress * 0.9));
          if (building.buildProgress >= 1) {
            building.buildProgress = 1;
            building.complete = true;
            building.hp = building.maxHp;
            building.action = 'operativo';
            builders.forEach((u) => u.orders.shift());
            this._emit('construccion_completa', `${building.nombre} está operativo.`, { entityId: building.id });
          }
        }
        continue;
      }
      const item = building.productionQueue[0];
      if (!item) continue;
      item.progress += dt;
      if (item.progress + 1e-9 < item.duration) continue;
      const unit = createUnit(this, item.unitType, building.teamId, building.x + building.radius + 1.2, building.z);
      unit.x = clamp(unit.x, MAP_BOUNDS.minX, MAP_BOUNDS.maxX);
      if (building.rallyPoint) unit.orders.push({ type: 'move', ...building.rallyPoint });
      this.state.entities.push(unit);
      building.productionQueue.shift();
      this._emit('unidad_lista', `${unit.nombre} listo para desplegar.`, { entityId: unit.id, buildingId: building.id });
    }
  }

  _updateUnits(dt) {
    const units = this.state.entities.filter((e) => e.alive && e.kind === 'unit');
    for (const unit of units) {
      unit.action = 'inactivo';
      unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
      let order = this._applyStanceBehavior(unit);
      if (unit.type === 'obrero' && order?.type !== 'gather') unit.gatherState = null;
      if (!order) {
        unit.velocity.x = approach(unit.velocity.x, 0, 12 * dt);
        unit.velocity.z = approach(unit.velocity.z, 0, 12 * dt);
        continue;
      }
      if (order.type === 'move' || order.type === 'attackMove' || order.type === 'patrol') {
        if (order.type === 'move' || order.type === 'attackMove') this._moveToward(unit, order, dt, true);
      }
      if (order.type === 'patrol') this._processPatrolOrder(unit, order, dt);
      if (order.type === 'attack') this._processAttackOrder(unit, order, dt);
      if (order.type === 'gather') this._processGatherOrder(unit, order, dt);
      if (order.type === 'build') this._processBuildOrder(unit, order, dt);
      if (order.type === 'repair') this._processRepairOrder(unit, order, dt);
    }
  }

  _applyStanceBehavior(unit) {
    unit.stance = normalizeUnitStance(unit.stance);
    if (!unit.stanceAnchor || !Number.isFinite(unit.stanceAnchor.x) || !Number.isFinite(unit.stanceAnchor.z)) {
      unit.stanceAnchor = { x: unit.x, z: unit.z };
    }
    let order = unit.orders[0];
    if (order?.type === 'attack') return order;
    if (order && !['move', 'attackMove', 'patrol'].includes(order.type)) return order;
    if (!order) unit.stanceAnchor = { x: unit.x, z: unit.z };

    const acquisitionRange = unit.stance === 'mantener_posicion' ? unit.range : unit.vision;
    const anchor = { x: unit.x, z: unit.z };
    const enemy = this._nearestEnemy(unit, acquisitionRange, (candidate) => {
      if (unit.stance !== 'defensiva') return true;
      const reach = unit.range + candidate.radius;
      return distanceSq(candidate, anchor) <= DEFENSIVE_PURSUIT_RADIUS ** 2
        || distanceSq(candidate, unit) <= reach ** 2;
    });
    if (!enemy) return order;

    const attackOrder = {
      type: 'attack',
      targetId: enemy.id,
      automatic: true,
      anchor,
    };
    if (order) attackOrder.resume = order;
    if (order) unit.orders[0] = attackOrder;
    else unit.orders.unshift(attackOrder);
    return attackOrder;
  }

  _releaseAutomaticAttack(unit, order) {
    if (unit.orders[0] !== order) return;
    unit.orders.shift();
    if (order.resume) unit.orders.unshift(order.resume);
  }

  _processPatrolOrder(unit, order, dt) {
    if (!Array.isArray(order.points) || order.points.length !== 2) {
      unit.orders.shift();
      return;
    }
    const pointIndex = order.pointIndex === 0 ? 0 : 1;
    const point = order.points[pointIndex];
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) {
      unit.orders.shift();
      return;
    }
    const reached = this._moveToward(unit, point, dt, false);
    unit.action = 'patrullando';
    if (reached) order.pointIndex = pointIndex === 0 ? 1 : 0;
  }

  _processAttackOrder(unit, order, dt) {
    const target = this._entity(order.targetId);
    if (!target?.alive || target.teamId === unit.teamId) {
      unit.orders.shift();
      if (order.resume) unit.orders.unshift(order.resume);
      return;
    }
    const reach = unit.range + target.radius;
    const anchor = order.anchor && Number.isFinite(order.anchor.x) && Number.isFinite(order.anchor.z)
      ? order.anchor
      : unit.stanceAnchor;
    const outsideDefensiveLeash = unit.stance === 'defensiva'
      && distanceSq(target, anchor) > DEFENSIVE_PURSUIT_RADIUS ** 2
      && distanceSq(unit, target) > reach * reach;
    const outsideHeldRange = unit.stance === 'mantener_posicion'
      && distanceSq(unit, target) > reach * reach;
    if (outsideDefensiveLeash || outsideHeldRange) {
      unit.velocity.x = approach(unit.velocity.x, 0, 15 * dt);
      unit.velocity.z = approach(unit.velocity.z, 0, 15 * dt);
      if (order.automatic) this._releaseAutomaticAttack(unit, order);
      else {
        unit.orders.shift();
        if (order.resume) unit.orders.unshift(order.resume);
      }
      return;
    }
    if (distanceSq(unit, target) <= reach * reach) {
      unit.velocity.x = approach(unit.velocity.x, 0, 15 * dt);
      unit.velocity.z = approach(unit.velocity.z, 0, 15 * dt);
      this._attack(unit, target);
    } else {
      this._moveToward(unit, target, dt, false, reach * 0.88);
    }
  }

  _processGatherOrder(unit, order, dt) {
    const cargo = normalizeWorkerCargo(unit);
    const node = this.state.resourceNodes.find((n) => n.id === order.nodeId);
    if (!['hacia_recurso', 'recolectando', 'hacia_deposito'].includes(order.phase)) {
      order.phase = cargo.amount > 0 ? 'hacia_deposito' : 'hacia_recurso';
    }

    if (cargo.amount > 0 && (!node || cargo.resource !== node.resource)) order.phase = 'hacia_deposito';
    if (order.phase === 'hacia_deposito') {
      const assignedDeposit = this._entity(order.depositId);
      const deposit = this._isValidResourceDeposit(assignedDeposit, unit.teamId)
        ? assignedDeposit
        : this._nearestResourceDeposit(unit, unit.teamId);
      if (!deposit) {
        delete order.depositId;
        unit.velocity.x = approach(unit.velocity.x, 0, 12 * dt);
        unit.velocity.z = approach(unit.velocity.z, 0, 12 * dt);
        unit.action = 'esperando_deposito';
        unit.gatherState = 'esperando_deposito';
        return;
      }
      order.depositId = deposit.id;
      unit.gatherState = 'hacia_deposito';
      unit.action = 'llevando_recursos';
      const depositReach = unit.radius + deposit.radius + 0.7;
      if (distanceSq(unit, deposit) > depositReach * depositReach) {
        this._moveToward(unit, deposit, dt, false, depositReach * 0.92);
        unit.action = 'llevando_recursos';
        return;
      }

      unit.velocity.x = approach(unit.velocity.x, 0, 12 * dt);
      unit.velocity.z = approach(unit.velocity.z, 0, 12 * dt);
      const deliveredResource = cargo.resource;
      const deliveredAmount = cargo.amount;
      if (deliveredResource && deliveredAmount > 0) {
        const team = this.state.teams[unit.teamId];
        team.recursos[deliveredResource] = round(team.recursos[deliveredResource] + deliveredAmount, 3);
        this._emit('recursos_depositados', `${unit.nombre} depositó ${deliveredAmount} de ${RESOURCE_DEFINITIONS[deliveredResource].nombre}.`, {
          entityId: unit.id,
          depositId: deposit.id,
          resource: deliveredResource,
          amount: deliveredAmount,
        });
      }
      resetWorkerCargo(unit);
      delete order.depositId;
      if (!node || node.amount <= 0) {
        unit.orders.shift();
        unit.gatherState = null;
        return;
      }
      order.phase = 'hacia_recurso';
      unit.gatherState = 'hacia_recurso';
      unit.action = 'regresando_recurso';
      return;
    }

    if (!node || node.amount <= 0) {
      unit.orders.shift();
      unit.gatherState = null;
      return;
    }
    if (cargo.amount <= 0) {
      cargo.resource = node.resource;
      cargo.capacity = RESOURCE_DEFINITIONS[node.resource].capacidadCarga;
    }
    const reach = unit.radius + node.radius + 0.45;
    if (distanceSq(unit, node) > reach * reach) {
      order.phase = 'hacia_recurso';
      unit.gatherState = 'hacia_recurso';
      this._moveToward(unit, node, dt, false, reach * 0.92);
      return;
    }
    unit.velocity.x = approach(unit.velocity.x, 0, 12 * dt);
    unit.velocity.z = approach(unit.velocity.z, 0, 12 * dt);
    const baseRate = RESOURCE_DEFINITIONS[node.resource].tasa;
    const team = this.state.teams[unit.teamId];
    const effects = technologyEffects(team);
    const eraBonus = 1 + team.era * 0.12;
    const technologyBonus = (effects.economia?.produccion || 0)
      + (node.resource === 'acero' ? (effects.economia?.recoleccionAcero || 0) : 0);
    const remainingCapacity = Math.max(0, cargo.capacity - cargo.amount);
    const amount = Math.min(node.amount, remainingCapacity, round(baseRate * eraBonus * (1 + technologyBonus) * dt, 3));
    node.amount = round(Math.max(0, node.amount - amount), 3);
    cargo.amount = round(cargo.amount + amount, 3);
    order.phase = 'recolectando';
    unit.gatherState = 'recolectando';
    unit.action = 'recolectando';
    if (node.amount <= 0) {
      this._emit('recurso_agotado', `Se agotó un depósito de ${RESOURCE_DEFINITIONS[node.resource].nombre}.`, { nodeId: node.id });
    }
    if (cargo.amount >= cargo.capacity || node.amount <= 0) {
      cargo.amount = Math.min(cargo.amount, cargo.capacity);
      order.phase = 'hacia_deposito';
      unit.gatherState = 'hacia_deposito';
      unit.action = 'llevando_recursos';
    }
  }

  _isValidResourceDeposit(entity, teamId) {
    return Boolean(entity?.alive
      && entity.kind === 'building'
      && entity.complete
      && entity.teamId === teamId
      && BUILDING_DEFINITIONS[entity.type]?.depositoRecursos);
  }

  _nearestResourceDeposit(entity, teamId) {
    return this.state.entities
      .filter((candidate) => this._isValidResourceDeposit(candidate, teamId))
      .sort((a, b) => distanceSq(a, entity) - distanceSq(b, entity) || a.id - b.id)[0] || null;
  }

  _processBuildOrder(unit, order, dt) {
    const building = this._entity(order.targetId);
    if (!building?.alive || building.complete) {
      unit.orders.shift();
      return;
    }
    const reach = unit.radius + building.radius + 0.7;
    if (distanceSq(unit, building) > reach * reach) this._moveToward(unit, building, dt, false, reach * 0.92);
    else {
      unit.velocity.x = approach(unit.velocity.x, 0, 12 * dt);
      unit.velocity.z = approach(unit.velocity.z, 0, 12 * dt);
      unit.action = 'construyendo';
    }
  }

  _processRepairOrder(unit, order, dt) {
    const building = this._entity(order.targetId);
    if (!building?.alive || building.kind !== 'building' || !building.complete || building.teamId !== unit.teamId) {
      unit.orders.shift();
      return;
    }
    if (building.hp >= building.maxHp) {
      building.hp = building.maxHp;
      unit.orders.shift();
      return;
    }

    const reach = unit.radius + building.radius + 0.7;
    if (distanceSq(unit, building) > reach * reach) {
      this._moveToward(unit, building, dt, false, reach * 0.92);
      return;
    }

    unit.velocity.x = approach(unit.velocity.x, 0, 12 * dt);
    unit.velocity.z = approach(unit.velocity.z, 0, 12 * dt);
    const team = this.state.teams[unit.teamId];
    const availableSteel = Math.max(0, team.recursos.acero);
    if (availableSteel <= 0) {
      unit.action = 'esperando_acero';
      return;
    }

    const missingHp = building.maxHp - building.hp;
    const repairedHp = Math.min(
      missingHp,
      REPAIR_HP_PER_SECOND * dt,
      availableSteel / REPAIR_STEEL_PER_HP,
    );
    if (repairedHp <= 0) return;

    building.hp = Math.min(building.maxHp, round(building.hp + repairedHp, 3));
    team.recursos.acero = round(Math.max(0, availableSteel - repairedHp * REPAIR_STEEL_PER_HP), 3);
    unit.action = 'reparando';

    if (building.hp >= building.maxHp) {
      building.hp = building.maxHp;
      unit.orders.shift();
      this._emit('reparacion_completa', `${building.nombre} reparado por completo.`, { entityId: building.id });
    }
  }

  _updateDefenses(dt) {
    for (const tower of this.state.entities) {
      if (!tower.alive || tower.kind !== 'building' || tower.type !== 'bastion' || !tower.complete) continue;
      tower.attackCooldown = Math.max(0, tower.attackCooldown - dt);
      const target = this._nearestEnemy(tower, tower.range);
      if (target) this._attack(tower, target);
    }
  }

  _attack(attacker, target) {
    if (attacker.attackCooldown > 0 || !target.alive) return;
    const damageMultiplier = target.kind === 'building' ? (attacker.bonusEdificio || 1) : 1;
    const damage = Math.max(1, attacker.attack * damageMultiplier - target.armor * 0.72);
    target.hp = Math.max(0, target.hp - damage);
    attacker.attackCooldown = attacker.cadence;
    attacker.action = 'atacando';
    const effectId = `fx-${this._nextEffectId++}`;
    const shotSequence = this._nextShotSequence++;
    const from = { x: attacker.x, y: attacker.height || 1, z: attacker.z };
    const to = { x: target.x, y: target.height || 1, z: target.z };
    const combatMetadata = {
      attackerId: attacker.id,
      targetId: target.id,
      attackerType: attacker.type,
      attackerKind: attacker.kind,
      targetType: target.type,
      targetKind: target.kind,
      weaponClass: weaponClassFor(attacker, this.state.teams[attacker.teamId]?.era ?? 0),
      damage: round(damage, 3),
      targetHealthRatio: round(target.hp / target.maxHp, 3),
      lethal: target.hp <= 0,
      shotSequence,
    };
    const attackEffect = {
      id: effectId,
      type: attacker.range > 3 ? (attacker.role === 'asedio' ? 'proyectil' : 'trazadora') : 'impacto',
      teamId: attacker.teamId,
      from,
      to,
      age: 0,
      // Mantiene el disparo visible el tiempo suficiente para que su origen y
      // destino se lean a escala RTS, sin alterar cadencia, daño ni resolución.
      duration: attacker.role === 'asedio' ? 0.7 : 0.42,
      ...combatMetadata,
    };
    this.state.effects.push(attackEffect);
    if (target.hp <= 0) this._kill(target, attacker, attackEffect);
  }

  _kill(target, attacker, attackEffect = null) {
    if (!target.alive) return;
    target.alive = false;
    target.hp = 0;
    target.orders = [];
    const attackerTeam = this.state.teams[attacker.teamId];
    attackerTeam.score += target.kind === 'building' ? 180 : 35;
    const position = attackEffect?.to || { x: target.x, y: target.height || 1, z: target.z };
    const destructionEffect = {
      id: `fx-${this._nextEffectId++}`,
      type: 'destruccion',
      teamId: attacker.teamId,
      sourceEffectId: attackEffect?.id || null,
      attackerId: attacker.id,
      targetId: target.id,
      attackerType: attacker.type,
      attackerKind: attacker.kind,
      targetType: target.type,
      targetKind: target.kind,
      weaponClass: attackEffect?.weaponClass || weaponClassFor(attacker, this.state.teams[attacker.teamId]?.era ?? 0),
      damage: attackEffect?.damage ?? 0,
      targetHealthRatio: 0,
      lethal: true,
      shotSequence: attackEffect?.shotSequence ?? this._nextShotSequence++,
      from: attackEffect?.from || { x: attacker.x, y: attacker.height || 1, z: attacker.z },
      to: position,
      position: { ...position },
      persistent: true,
      age: 0,
      duration: target.kind === 'building' ? 24 : 14,
    };
    this.state.effects.push(destructionEffect);
    this._emit('entidad_destruida', `${target.nombre} ha sido destruido.`, {
      entityId: target.id,
      attackerId: attacker.id,
      effectId: destructionEffect.id,
      attackerType: destructionEffect.attackerType,
      targetType: destructionEffect.targetType,
      targetKind: destructionEffect.targetKind,
      weaponClass: destructionEffect.weaponClass,
      damage: destructionEffect.damage,
      lethal: true,
      shotSequence: destructionEffect.shotSequence,
      position: { ...position },
    });
  }

  _updateEffects(dt) {
    for (const effect of this.state.effects) effect.age += dt;
    this.state.effects = this.state.effects.filter((e) => e.age <= e.duration);
  }

  _updateControlPoints(dt) {
    for (const point of this.state.controlPoints) {
      const nearbyTeams = new Set(this.state.entities
        .filter((e) => e.alive && e.kind === 'unit' && distanceSq(e, point) <= point.radius ** 2)
        .map((e) => e.teamId));
      if (nearbyTeams.size === 1) {
        const [teamId] = nearbyTeams;
        if (point.ownerId === teamId) {
          point.capture = 1;
          point.capturingTeamId = null;
        } else {
          if (point.capturingTeamId !== teamId) {
            point.capturingTeamId = teamId;
            point.capture = 0;
          }
          point.capture += dt / 12;
          if (point.capture >= 1) {
            point.ownerId = teamId;
            point.capture = 1;
            point.capturingTeamId = null;
            this._emit('punto_capturado', `${this.state.teams[teamId].nombre} controla ${point.nombre}.`, { pointId: point.id, teamId });
          }
        }
      } else if (nearbyTeams.size > 1) {
        point.capture = Math.max(0, point.capture - dt / 18);
        if (point.capture === 0) point.capturingTeamId = null;
      }
    }
    for (const team of Object.values(this.state.teams)) {
      const count = this.state.controlPoints.filter((p) => p.ownerId === team.id).length;
      team.dominationTime = count >= SIMULATION_CONSTANTS.dominationPointsRequired
        ? team.dominationTime + dt
        : Math.max(0, team.dominationTime - dt * 0.5);
    }
  }

  _updateAI(dt) {
    const ai = normalizeAIState(this.state);
    ai.thinkTimer -= dt;
    ai.attackTimer -= dt;
    if (ai.thinkTimer <= 0) {
      ai.thinkTimer = this.difficulty === 'dificil' ? 1.25 : this.difficulty === 'facil' ? 2.8 : 2;
      this._aiObserveEnemies();
      const defending = this._aiDefendBase();
      this._aiEconomyAndProduction();
      if (!defending) this._aiExploreUnseen();
    }
    if (ai.attackTimer <= 0) {
      ai.attackTimer = this.difficulty === 'dificil' ? 22 : this.difficulty === 'facil' ? 38 : 30;
      this._aiObserveEnemies();
      if (!this._aiDefendBase()) this._aiLaunchAttack();
    }
  }

  _aiObserveEnemies() {
    const ai = normalizeAIState(this.state);
    const evidenceById = new Map(ai.knownEnemies.map((evidence) => [evidence.entityId, evidence]));
    const visibleEnemies = this.state.entities
      .filter((entity) => entity.alive && entity.teamId === 'player' && this._isVisibleToTeam(entity, 'rival'))
      .sort((a, b) => a.id - b.id);
    for (const enemy of visibleEnemies) {
      evidenceById.set(enemy.id, {
        entityId: enemy.id,
        kind: enemy.kind,
        type: enemy.type,
        x: round(enemy.x, 3),
        z: round(enemy.z, 3),
        lastSeenAt: round(this.state.time, 3),
      });
    }
    ai.knownEnemies = [...evidenceById.values()].sort((a, b) => a.entityId - b.entityId);
    return visibleEnemies;
  }

  _aiDefendBase() {
    const ai = normalizeAIState(this.state);
    const hq = this.state.entities.find((entity) => (
      entity.alive && entity.complete && entity.teamId === 'rival' && entity.type === 'cuartelGeneral'
    ));
    if (!hq) return false;
    const threats = this.state.entities
      .filter((entity) => (
        entity.alive
        && entity.teamId === 'player'
        && entity.attack > 0
        && distanceSq(entity, hq) <= AI_BASE_DEFENSE_RADIUS ** 2
        && this._isVisibleToTeam(entity, 'rival')
      ))
      .sort((a, b) => distanceSq(a, hq) - distanceSq(b, hq) || a.id - b.id);
    if (!threats.length) return false;
    const target = threats[0];
    const defenders = this._teamUnits('rival')
      .filter((unit) => unit.type !== 'obrero')
      .sort((a, b) => a.id - b.id);
    if (!defenders.length) return false;
    defenders.forEach((unit) => { unit.orders = [{ type: 'attack', targetId: target.id }]; });
    ai.exploration = null;
    return true;
  }

  _aiExploreUnseen() {
    const ai = normalizeAIState(this.state);
    if (ai.exploration) {
      const assignedScout = this._entity(ai.exploration.scoutId);
      const activeOrder = assignedScout?.orders?.[0];
      const activeExploration = activeOrder?.type === 'attackMove'
        || (activeOrder?.type === 'attack' && activeOrder.resume?.type === 'attackMove');
      if (assignedScout?.alive && activeExploration) return true;
      ai.exploration = null;
    }

    const scoutPriority = { dron: 0, caballeria: 1, fusilero: 2, exotraje: 3 };
    const scout = this._teamUnits('rival')
      .filter((unit) => unit.type !== 'obrero' && unit.orders.length === 0)
      .sort((a, b) => (
        (scoutPriority[a.type] ?? 4) - (scoutPriority[b.type] ?? 4)
        || b.vision - a.vision
        || a.id - b.id
      ))[0];
    if (!scout) return false;

    const fog = normalizeFogOfWar(this.state);
    const explored = new Set(fog.exploredByTeam.rival);
    let target = null;
    for (let cell = 0; cell < fog.columns * fog.rows; cell += 1) {
      if (explored.has(cell)) continue;
      const point = fogCellCenter(cell, fog);
      const distanceToScout = distanceSq(scout, point);
      if (!target || distanceToScout < target.distance || (distanceToScout === target.distance && cell < target.cell)) {
        target = { cell, ...point, distance: distanceToScout };
      }
    }
    if (!target) return false;
    ai.exploration = { scoutId: scout.id, cell: target.cell, x: target.x, z: target.z };
    scout.orders = [{ type: 'attackMove', x: target.x, z: target.z }];
    return true;
  }

  _aiEconomyAndProduction() {
    const team = this.state.teams.rival;
    const workers = this._teamUnits(team.id).filter((u) => u.type === 'obrero');
    for (const worker of workers) {
      if (worker.orders.length) continue;
      const node = this._nearestResource(worker, chooseNeededResource(team.recursos));
      if (node) worker.orders.push({ type: 'gather', nodeId: node.id });
    }
    const allBuildings = this.state.entities.filter((e) => e.alive && e.kind === 'building' && e.teamId === team.id);
    const buildings = allBuildings.filter((e) => e.complete);
    const hq = buildings.find((b) => b.type === 'cuartelGeneral');
    const barracks = buildings.find((b) => b.type === 'cuartel');
    const factory = buildings.find((b) => b.type === 'fabrica');
    if (team.era >= 1 && !allBuildings.some((b) => b.type === 'fabrica')) {
      this._aiTryBuild('fabrica', [[56, -18], [42, -16], [68, -20]]);
    }
    if (team.era >= 1 && !allBuildings.some((b) => b.type === 'central')) {
      this._aiTryBuild('central', [[68, -47], [34, -43], [70, -8]]);
    }
    if (team.capacidad - team.poblacion - this._reservedPopulation(team.id) < 4
      && !allBuildings.some((b) => b.type === 'vivienda' && !b.complete)) {
      this._aiTryBuild('vivienda', [[68, -31], [64, -48], [51, -49], [37, -33]]);
    }
    if (workers.length < 8 && hq) this._aiQueue(hq, 'obrero');
    this._aiQueueEraComposition([barracks, factory].filter(Boolean));
    if (!team.technologies.active) this._aiTryResearchTechnology(team.id);
    if (!team.research && team.era < ERAS.length - 1) this._beginEraResearch(team.id, true);
  }

  _aiTryResearchTechnology(teamId) {
    const team = this.state.teams[teamId];
    const buildings = this.state.entities
      .filter((entity) => entity.alive && entity.complete && entity.teamId === teamId && entity.kind === 'building');
    const availabilityState = {
      era: team.era,
      researched: team.technologies.researched,
      buildings: buildings.map((building) => building.type),
    };
    const technology = TECHNOLOGIES.find((candidate) => (
      technologyAvailability(candidate.id, availabilityState).available
      && canAfford(team.recursos, candidate.costo)
    ));
    if (!technology) return false;
    const building = buildings.find((candidate) => candidate.type === technology.edificio);
    return Boolean(this._beginTechnologyResearch(teamId, building?.id, technology.id, true));
  }

  _aiTryBuild(buildingType, candidates) {
    const team = this.state.teams.rival;
    const def = BUILDING_DEFINITIONS[buildingType];
    if (!def || def.era > team.era || !canAfford(team.recursos, def.costo)) return false;
    const builder = this._teamUnits(team.id)
      .filter((u) => u.type === 'obrero')
      .sort((a, b) => a.orders.length - b.orders.length || a.id - b.id)[0];
    if (!builder) return false;
    const point = candidates.find(([x, z]) => this._canPlace(x, z, def.radio));
    if (!point) return false;
    spend(team.recursos, def.costo);
    const building = createBuilding(this, buildingType, team.id, point[0], point[1], false);
    this.state.entities.push(building);
    builder.orders = [{ type: 'build', targetId: building.id }];
    this._emit('construccion_enemiga', `${team.nombre} construye ${def.nombre}.`, { entityId: building.id });
    return true;
  }

  _aiQueue(building, unitType) {
    if (building.productionQueue.length >= 2) return false;
    const def = UNIT_DEFINITIONS[unitType];
    const team = this.state.teams[building.teamId];
    if (!def || def.era > team.era || !canAfford(team.recursos, def.costo)) return false;
    if (team.poblacion + this._reservedPopulation(team.id) + def.poblacion > team.capacidad) return false;
    spend(team.recursos, def.costo);
    const trainingModifier = technologyEffects(team).unidades?.tiempoEntrenamiento || 0;
    building.productionQueue.push({
      unitType,
      progress: 0,
      duration: def.tiempo * Math.max(0.4, 1 + trainingModifier) * (this.difficulty === 'dificil' ? 0.86 : 1),
    });
    return true;
  }

  _aiQueueEraComposition(buildings) {
    const team = this.state.teams.rival;
    const profile = AI_FORCE_PROFILES[team.era];
    const totals = Object.fromEntries(Object.keys(profile).map((type) => [type, 0]));
    for (const unit of this._teamUnits(team.id)) {
      if (unit.type in totals) totals[unit.type] += 1;
    }
    for (const building of this.state.entities) {
      if (!building.alive || building.teamId !== team.id || building.kind !== 'building') continue;
      for (const queued of building.productionQueue || []) {
        if (queued.unitType in totals) totals[queued.unitType] += 1;
      }
    }
    for (const building of buildings.sort((a, b) => a.id - b.id)) {
      const producibleDeficit = Object.keys(profile).find((unitType) => (
        totals[unitType] < profile[unitType]
        && BUILDING_DEFINITIONS[building.type].produce.includes(unitType)
      ));
      if (producibleDeficit && this._aiQueue(building, producibleDeficit)) totals[producibleDeficit] += 1;
    }
  }

  _aiLaunchAttack() {
    const ai = normalizeAIState(this.state);
    const team = this.state.teams.rival;
    const profile = AI_FORCE_PROFILES[team.era];
    const army = this._teamUnits('rival').filter((unit) => unit.type !== 'obrero');
    const forceReady = Object.entries(profile).every(([type, required]) => (
      army.filter((unit) => unit.type === type).length >= required
    ));
    if (!forceReady || !ai.knownEnemies.length) return false;
    const evidence = ai.knownEnemies.slice().sort((a, b) => (
      Number(b.type === 'cuartelGeneral') - Number(a.type === 'cuartelGeneral')
      || Number(b.kind === 'building') - Number(a.kind === 'building')
      || b.lastSeenAt - a.lastSeenAt
      || a.entityId - b.entityId
    ))[0];
    const visibleTarget = this._entity(evidence.entityId);
    const hasCurrentVision = visibleTarget?.alive && this._isVisibleToTeam(visibleTarget, 'rival');
    army.forEach((unit) => {
      unit.orders = [hasCurrentVision
        ? { type: 'attack', targetId: visibleTarget.id }
        : { type: 'attackMove', x: evidence.x, z: evidence.z }];
    });
    ai.exploration = null;
    this._emit('ataque_detectado', 'Inteligencia informa de una ofensiva enemiga.', { count: army.length });
    return true;
  }

  _beginEraResearch(teamId, silentFailure = false) {
    const team = this.state.teams[teamId];
    if (team.era >= ERAS.length - 1) return silentFailure ? false : this._failure('ERA_MAXIMA', 'Ya alcanzaste la era final.');
    if (team.research) return silentFailure ? false : this._failure('INVESTIGACION_ACTIVA', 'El avance de era ya está en curso.');
    const hasInstitute = this.state.entities.some((e) => e.alive && e.complete && e.teamId === teamId && e.type === 'universidad');
    if (!hasInstitute) return silentFailure ? false : this._failure('SIN_UNIVERSIDAD', 'Construye un instituto de investigación.');
    const targetEra = team.era + 1;
    const cost = ERAS[targetEra].costo;
    if (!canAfford(team.recursos, cost)) return silentFailure ? false : this._failure('RECURSOS_INSUFICIENTES', 'No hay recursos para avanzar de era.');
    spend(team.recursos, cost);
    team.research = { targetEra, progress: 0, duration: 52 + targetEra * 16 };
    this._emit('investigacion_iniciada', `${team.nombre} investiga la ${ERAS[targetEra].nombre}.`, { teamId, targetEra });
    this._touch();
    return { ok: true, targetEra, duration: team.research.duration };
  }

  _beginTechnologyResearch(teamId, buildingId, technologyId, silentFailure = false) {
    const team = this.state.teams[teamId];
    const technology = TECHNOLOGIES.find((candidate) => candidate.id === technologyId);
    if (!team || !technology) return silentFailure ? false : this._failure('TECNOLOGIA_INVALIDA', 'La tecnología solicitada no existe.');
    normalizeTeamTechnologies(team);
    if (team.technologies.active) return silentFailure ? false : this._failure('TECNOLOGIA_ACTIVA', 'Ya hay una tecnología en investigación.');
    const building = this._entity(buildingId);
    if (!building?.alive || !building.complete || building.teamId !== teamId || building.type !== technology.edificio) {
      return silentFailure ? false : this._failure('EDIFICIO_INVESTIGACION_INVALIDO', `Selecciona un ${BUILDING_DEFINITIONS[technology.edificio]?.nombre || technology.edificio} operativo.`);
    }
    const buildings = this.state.entities
      .filter((entity) => entity.alive && entity.complete && entity.teamId === teamId && entity.kind === 'building')
      .map((entity) => entity.type);
    const availability = technologyAvailability(technology.id, {
      era: team.era,
      researched: team.technologies.researched,
      buildings,
    });
    if (!availability.available) {
      const code = availability.alreadyResearched
        ? 'TECNOLOGIA_COMPLETA'
        : availability.eraLocked
          ? 'ERA_INSUFICIENTE'
          : availability.missingPrerequisites.length
            ? 'PRERREQUISITOS_PENDIENTES'
            : 'EDIFICIO_REQUERIDO';
      return silentFailure ? false : this._failure(code, availability.missingPrerequisites.length
        ? `Faltan: ${availability.missingPrerequisites.map(technologyName).join(', ')}.`
        : 'La tecnología aún no está disponible.');
    }
    if (!canAfford(team.recursos, technology.costo)) return silentFailure ? false : this._failure('RECURSOS_INSUFICIENTES', 'No hay recursos para investigar esa tecnología.');
    spend(team.recursos, technology.costo);
    team.technologies.active = { id: technology.id, buildingId, progress: 0, duration: technology.tiempo };
    this._emit('tecnologia_iniciada', `${team.nombre} investiga ${technology.nombre}.`, { teamId, technologyId });
    this._touch();
    return { ok: true, technologyId, duration: technology.tiempo };
  }

  _refreshTeamTechnologyStats(teamId) {
    const team = this.state.teams[teamId];
    if (!team) return;
    for (const entity of this.state.entities) {
      if (entity.teamId === teamId && entity.kind === 'unit') applyUnitTechnologyStats(entity, team);
    }
  }

  _checkEndConditions() {
    if (this.state.mode !== 'jugando') return;
    const playerHQ = this.state.entities.some((e) => e.alive && e.teamId === 'player' && e.type === 'cuartelGeneral');
    const rivalHQ = this.state.entities.some((e) => e.alive && e.teamId === 'rival' && e.type === 'cuartelGeneral');
    if (!playerHQ || !rivalHQ) {
      if (!playerHQ && !rivalHQ) this._finish('empate', null, 'Ambos centros de mando fueron destruidos.');
      else if (!rivalHQ) this._finish('victoria', 'player', 'Victoria por aniquilación del centro de mando rival.');
      else this._finish('derrota', 'rival', 'Derrota: el centro de mando aliado fue destruido.');
      return;
    }
    const dominator = Object.values(this.state.teams).find((t) => t.dominationTime >= SIMULATION_CONSTANTS.dominationSeconds);
    if (dominator) {
      this._finish(dominator.id === 'player' ? 'victoria' : 'derrota', dominator.id, `${dominator.nombre} obtuvo la victoria por dominación territorial.`);
      return;
    }
    if (this.state.time >= SIMULATION_CONSTANTS.maxMatchSeconds) {
      const playerScore = calculateScore(this.state, 'player');
      const rivalScore = calculateScore(this.state, 'rival');
      if (playerScore === rivalScore) this._finish('empate', null, 'Empate al concluir el límite de tiempo.');
      else {
        const winner = playerScore > rivalScore ? 'player' : 'rival';
        this._finish(winner === 'player' ? 'victoria' : 'derrota', winner, `${this.state.teams[winner].nombre} venció por supremacía estratégica.`);
      }
    }
  }

  _finish(outcome, winnerId, reason) {
    this.state.mode = 'finalizado';
    this.state.result = { outcome, winnerId, reason, time: round(this.state.time, 2) };
    this._emit(outcome, reason, { winnerId });
  }

  _moveToward(unit, target, dt, completeOrder = false, stopDistance = 0.25) {
    const dx = target.x - unit.x;
    const dz = target.z - unit.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= stopDistance) {
      unit.velocity.x = approach(unit.velocity.x, 0, 18 * dt);
      unit.velocity.z = approach(unit.velocity.z, 0, 18 * dt);
      if (completeOrder) {
        unit.orders.shift();
        unit.stanceAnchor = { x: unit.x, z: unit.z };
      }
      return true;
    }
    const direction = this._navigationDirection(unit, target, dx / dist, dz / dist, dist);
    const nx = direction.x;
    const nz = direction.z;
    const desired = Math.min(unit.speed, dist / Math.max(dt, 0.001));
    unit.velocity.x = approach(unit.velocity.x, nx * desired, unit.acceleration * dt);
    unit.velocity.z = approach(unit.velocity.z, nz * desired, unit.acceleration * dt);
    unit.x = clamp(unit.x + unit.velocity.x * dt, MAP_BOUNDS.minX, MAP_BOUNDS.maxX);
    unit.z = clamp(unit.z + unit.velocity.z * dt, MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ);
    this._resolveStaticPenetration(unit, target);
    unit.rotation = Math.atan2(unit.velocity.x, unit.velocity.z);
    unit.action = 'moviendose';
    return false;
  }

  _navigationDirection(unit, target, directX, directZ, remainingDistance) {
    const obstacles = this._navigationObstacles(unit, target);
    if (this._directionIsClear(unit, directX, directZ, remainingDistance, obstacles)) {
      return { x: directX, z: directZ };
    }

    const blocking = obstacles
      .filter((obstacle) => segmentDistanceSq(
        unit.x,
        unit.z,
        unit.x + directX * Math.min(remainingDistance, Math.max(2.4, unit.speed * 0.85)),
        unit.z + directZ * Math.min(remainingDistance, Math.max(2.4, unit.speed * 0.85)),
        obstacle.x,
        obstacle.z,
      ) < (unit.radius + obstacle.radius + obstacle.clearance) ** 2)
      .sort((a, b) => distanceSq(unit, a) - distanceSq(unit, b) || String(a.navigationId).localeCompare(String(b.navigationId)))[0];
    const side = navigationSide(unit.id, blocking?.navigationId ?? 'terrain');
    const offsets = [30, -30, 55, -55, 80, -80, 110, -110].map((degrees) => degrees * side * Math.PI / 180);
    const baseAngle = Math.atan2(directZ, directX);
    for (const offset of offsets) {
      const angle = baseAngle + offset;
      const candidateX = Math.cos(angle);
      const candidateZ = Math.sin(angle);
      if (this._directionIsClear(unit, candidateX, candidateZ, remainingDistance, obstacles)) {
        return { x: candidateX, z: candidateZ };
      }
    }
    const fallbackAngle = baseAngle + side * Math.PI / 2;
    return { x: Math.cos(fallbackAngle), z: Math.sin(fallbackAngle) };
  }

  _directionIsClear(unit, directionX, directionZ, remainingDistance, obstacles) {
    const lookAhead = Math.min(remainingDistance, Math.max(2.4, unit.speed * 0.85));
    const endX = unit.x + directionX * lookAhead;
    const endZ = unit.z + directionZ * lookAhead;
    return obstacles.every((obstacle) => {
      const clearance = unit.radius + obstacle.radius + obstacle.clearance;
      const currentDistanceSq = distanceSq(unit, obstacle);
      if (currentDistanceSq < clearance ** 2) {
        const endDistanceSq = distanceSq({ x: endX, z: endZ }, obstacle);
        return endDistanceSq > currentDistanceSq + 1e-6;
      }
      return segmentDistanceSq(unit.x, unit.z, endX, endZ, obstacle.x, obstacle.z) >= clearance ** 2;
    });
  }

  _navigationObstacles(unit, target = null) {
    const targetId = target?.id ?? null;
    const structures = this.state.entities
      .filter((entity) => entity.alive && entity.kind === 'building' && entity.id !== targetId)
      .map((entity) => ({ ...entity, navigationId: `building-${entity.id}`, clearance: NAVIGATION_CLEARANCE }));
    const resources = this.state.resourceNodes
      .filter((node) => node.amount > 0 && node.id !== targetId)
      .map((node) => ({ ...node, navigationId: `resource-${node.id}`, clearance: NAVIGATION_CLEARANCE }));
    const units = this.state.entities
      .filter((entity) => entity.alive && entity.kind === 'unit' && entity.id !== unit.id && entity.id !== targetId)
      .map((entity) => ({ ...entity, navigationId: entity.id, clearance: UNIT_SEPARATION_CLEARANCE }));
    return [...structures, ...resources, ...units];
  }

  _resolveStaticPenetration(unit, target = null) {
    const targetId = target?.id ?? null;
    const obstacles = [
      ...this.state.entities.filter((entity) => entity.alive && entity.kind === 'building' && entity.id !== targetId),
      ...this.state.resourceNodes.filter((node) => node.amount > 0 && node.id !== targetId),
    ];
    for (const obstacle of obstacles) {
      const minimumDistance = unit.radius + obstacle.radius + NAVIGATION_CLEARANCE;
      let dx = unit.x - obstacle.x;
      let dz = unit.z - obstacle.z;
      let currentDistance = Math.hypot(dx, dz);
      if (currentDistance + 1e-9 >= minimumDistance) continue;
      if (currentDistance < 1e-9) {
        const angle = navigationSide(unit.id, obstacle.id) > 0 ? Math.PI / 2 : -Math.PI / 2;
        dx = Math.cos(angle);
        dz = Math.sin(angle);
        currentDistance = 1;
      }
      const normalX = dx / currentDistance;
      const normalZ = dz / currentDistance;
      unit.x = clamp(obstacle.x + normalX * minimumDistance, MAP_BOUNDS.minX, MAP_BOUNDS.maxX);
      unit.z = clamp(obstacle.z + normalZ * minimumDistance, MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ);
      const inwardSpeed = unit.velocity.x * normalX + unit.velocity.z * normalZ;
      if (inwardSpeed < 0) {
        unit.velocity.x -= inwardSpeed * normalX;
        unit.velocity.z -= inwardSpeed * normalZ;
      }
    }
  }

  _resolveUnitSeparation() {
    const units = this.state.entities.filter((entity) => entity.alive && entity.kind === 'unit');
    for (let pass = 0; pass < 2; pass += 1) {
      for (let firstIndex = 0; firstIndex < units.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < units.length; secondIndex += 1) {
          const first = units[firstIndex];
          const second = units[secondIndex];
          const minimumDistance = first.radius + second.radius + UNIT_SEPARATION_CLEARANCE;
          let dx = second.x - first.x;
          let dz = second.z - first.z;
          let currentDistance = Math.hypot(dx, dz);
          if (currentDistance + 1e-9 >= minimumDistance) continue;
          if (currentDistance < 1e-9) {
            const angle = navigationSide(first.id, second.id) > 0 ? Math.PI / 2 : -Math.PI / 2;
            dx = Math.cos(angle);
            dz = Math.sin(angle);
            currentDistance = 1;
          }
          const normalX = dx / currentDistance;
          const normalZ = dz / currentDistance;
          const correction = (minimumDistance - currentDistance) / 2;
          first.x = clamp(first.x - normalX * correction, MAP_BOUNDS.minX, MAP_BOUNDS.maxX);
          first.z = clamp(first.z - normalZ * correction, MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ);
          second.x = clamp(second.x + normalX * correction, MAP_BOUNDS.minX, MAP_BOUNDS.maxX);
          second.z = clamp(second.z + normalZ * correction, MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ);
        }
      }
    }
    units.forEach((unit) => this._resolveStaticPenetration(unit));
  }

  _nearestEnemy(entity, range, predicate = null) {
    const maxDistanceSq = range * range;
    return this.state.entities
      .filter((e) => e.alive && e.teamId !== entity.teamId && distanceSq(e, entity) <= maxDistanceSq)
      .filter((e) => !predicate || predicate(e))
      .sort((a, b) => distanceSq(a, entity) - distanceSq(b, entity) || a.id - b.id)[0] || null;
  }

  _nearestResource(entity, preferred) {
    const active = this.state.resourceNodes.filter((n) => n.amount > 0);
    const preferredNodes = active.filter((n) => n.resource === preferred);
    return (preferredNodes.length ? preferredNodes : active)
      .sort((a, b) => distanceSq(a, entity) - distanceSq(b, entity) || a.id.localeCompare(b.id))[0] || null;
  }

  _canPlace(x, z, radius) {
    if (x - radius < MAP_BOUNDS.minX || x + radius > MAP_BOUNDS.maxX || z - radius < MAP_BOUNDS.minZ || z + radius > MAP_BOUNDS.maxZ) return false;
    return !this.state.entities.some((e) => e.alive && distanceSq(e, { x, z }) < (e.radius + radius + 0.8) ** 2)
      && !this.state.resourceNodes.some((n) => n.amount > 0 && distanceSq(n, { x, z }) < (n.radius + radius + 0.5) ** 2);
  }

  _reservedPopulation(teamId) {
    return this.state.entities
      .filter((e) => e.alive && e.teamId === teamId && e.kind === 'building')
      .flatMap((e) => e.productionQueue)
      .reduce((sum, item) => sum + UNIT_DEFINITIONS[item.unitType].poblacion, 0);
  }

  _recalculatePopulation() {
    for (const team of Object.values(this.state.teams)) {
      team.poblacion = this._teamUnits(team.id).reduce((sum, u) => sum + UNIT_DEFINITIONS[u.type].poblacion, 0);
      team.capacidad = this.state.entities
        .filter((e) => e.alive && e.complete && e.teamId === team.id && e.kind === 'building')
        .reduce((sum, b) => sum + BUILDING_DEFINITIONS[b.type].poblacion, 0);
    }
  }

  _cleanupDead() {
    const aliveIds = new Set(this.state.entities.filter((e) => e.alive).map((e) => e.id));
    this.state.selectedIds = this.state.selectedIds.filter((id) => aliveIds.has(id));
    for (const entity of this.state.entities) {
      if (!entity.alive || entity.kind !== 'unit') continue;
      entity.orders = entity.orders.flatMap((order) => {
        if (!order.targetId || aliveIds.has(order.targetId)) return [order];
        return order.resume ? [order.resume] : [];
      });
      if (!['moviendose', 'patrullando', 'atacando', 'recolectando', 'construyendo', 'reparando', 'esperando_acero'].includes(entity.action)) {
        entity.action = 'inactivo';
      }
    }
  }

  _selectedUnits() {
    const selected = new Set(this.state.selectedIds);
    return this.state.entities
      .filter((e) => e.alive && e.kind === 'unit' && e.teamId === this.state.localTeamId && selected.has(e.id))
      .sort((a, b) => a.id - b.id);
  }

  _teamUnits(teamId) {
    return this.state.entities.filter((e) => e.alive && e.kind === 'unit' && e.teamId === teamId);
  }

  _localTeam() {
    return this.state.teams[this.state.localTeamId];
  }

  _entity(id) {
    return this.state.entities.find((e) => e.id === id) || null;
  }

  _giveOrder(unit, order, queued) {
    if (queued) unit.orders.push(order);
    else {
      unit.orders = [order];
      if (unit.type === 'obrero' && order.type !== 'gather') unit.gatherState = null;
    }
  }

  _failure(code, message) {
    return { ok: false, code, message };
  }

  _emit(type, message, data = {}) {
    const event = { id: this._nextEventId++, type, message, time: round(this.state.time, 2), ...data };
    this.state.events.push(event);
    if (this.state.events.length > MAX_EVENTS) this.state.events.splice(0, this.state.events.length - MAX_EVENTS);
    return event;
  }

  _touch(notify = true) {
    this.state.version += 1;
    if (notify) this._notify();
  }

  _notify() {
    if (!this._listeners.size) return;
    const renderState = this.getRenderState();
    for (const listener of this._listeners) listener(renderState);
  }
}

function createInitialState(sim) {
  const state = {
    version: 0,
    mode: 'jugando',
    paused: false,
    time: 0,
    localTeamId: 'player',
    hoveredId: null,
    selectedIds: [],
    result: null,
    map: { ...MAP_BOUNDS, width: 160, depth: 120, name: 'Valle de las Cuatro Eras' },
    teams: {
      player: createTeam('player', 'Confederación Aurora', '#3ab7ff', { x: -55, z: 34 }, sim.startingEra),
      rival: createTeam('rival', 'Directorio Carmesí', '#f05252', { x: 55, z: -34 }, sim.startingEra),
    },
    entities: [],
    resourceNodes: createResourceNodes(),
    controlPoints: [
      { id: 'control-oeste', nombre: 'Estación Oeste', x: -30, z: -15, radius: 7, ownerId: null, capturingTeamId: null, capture: 0 },
      { id: 'control-centro', nombre: 'Nexo Central', x: 0, z: 0, radius: 7, ownerId: null, capturingTeamId: null, capture: 0 },
      { id: 'control-este', nombre: 'Observatorio Este', x: 30, z: 15, radius: 7, ownerId: null, capturingTeamId: null, capture: 0 },
    ],
    fogOfWar: createFogOfWar(['player', 'rival']),
    effects: [],
    events: [],
    ai: { thinkTimer: 1, attackTimer: 34, knownEnemies: [], exploration: null },
  };
  sim.state = state;
  populateBase(sim, 'player', -55, 34, 1);
  populateBase(sim, 'rival', 55, -34, -1);
  populateEraForces(sim, 'player', -55, 34, 1);
  populateEraForces(sim, 'rival', 55, -34, -1);
  sim._recalculatePopulation();
  assignStartingWorkers(sim, 'player');
  assignStartingWorkers(sim, 'rival');
  state.selectedIds = state.entities.filter((e) => e.teamId === 'player' && e.kind === 'unit' && e.type === 'obrero').map((e) => e.id);
  return state;
}

function createTeam(id, nombre, color, base, era = 0) {
  const resourceScale = 1 + era * 0.48;
  return {
    id, nombre, color, base, era,
    recursos: {
      alimentos: Math.round(560 * resourceScale),
      madera: Math.round(500 * resourceScale),
      acero: Math.round(360 * resourceScale),
      energia: Math.round(160 * (1 + era * 0.9)),
      conocimiento: Math.round(120 * (1 + era * 1.1)),
    },
    poblacion: 0, capacidad: 0, score: 0, dominationTime: 0, research: null, formation: 'linea',
    technologies: {
      researched: TECHNOLOGIES.filter((technology) => technology.era < era).map((technology) => technology.id),
      active: null,
    },
  };
}

function populateBase(sim, teamId, x, z, facing) {
  const spacing = sim.startingEra >= 3 ? 1.48 : sim.startingEra >= 2 ? 1.24 : 1;
  const hq = createBuilding(sim, 'cuartelGeneral', teamId, x, z, true);
  const barracks = createBuilding(sim, 'cuartel', teamId, x + 10 * spacing * facing, z - 7 * spacing * facing, true);
  const university = createBuilding(sim, 'universidad', teamId, x + 10 * spacing * facing, z + 7 * spacing * facing, true);
  const houseA = createBuilding(sim, 'vivienda', teamId, x - 7 * spacing * facing, z - 7 * spacing * facing, true);
  const houseB = createBuilding(sim, 'vivienda', teamId, x - 8 * spacing * facing, z + 4 * spacing * facing, true);
  sim.state.entities.push(hq, barracks, university, houseA, houseB);
  const formation = [
    [-6, -2], [-5, 1], [-4, 4], [-1.5, 6], [1.5, 6],
    [4, 4], [5, 1], [6, -2], [-2.5, 2.5], [2.5, 2.5],
  ];
  formation.forEach(([dx, dz]) => sim.state.entities.push(createUnit(sim, 'obrero', teamId, x + dx * facing, z + dz * facing)));
  sim.state.entities.push(createUnit(sim, 'fusilero', teamId, x + 4 * facing, z - 5 * facing));
  sim.state.entities.push(createUnit(sim, 'fusilero', teamId, x + 6 * facing, z - 3 * facing));
}

function populateEraForces(sim, teamId, x, z, facing) {
  const era = sim.startingEra;
  if (era < 1) return;
  sim.state.entities.push(
    createBuilding(sim, 'fabrica', teamId, x - (era >= 3 ? 23 : 17) * facing, z + (era >= 3 ? 15 : 11) * facing, true),
    createBuilding(sim, 'central', teamId, x - (era >= 3 ? 24 : 18) * facing, z - (era >= 3 ? 13 : 9) * facing, true),
    createUnit(sim, 'artilleria', teamId, x + 8 * facing, z + 7 * facing),
    createUnit(sim, 'tanque', teamId, x + 11 * facing, z + 4 * facing),
  );
  if (era >= 2) {
    sim.state.entities.push(
      createUnit(sim, 'dron', teamId, x + 5 * facing, z + 10 * facing),
      createUnit(sim, 'dron', teamId, x + 7 * facing, z + 11 * facing),
    );
  }
  if (era >= 3) {
    sim.state.entities.push(
      createUnit(sim, 'exotraje', teamId, x + 9 * facing, z - 8 * facing),
      createUnit(sim, 'caminante', teamId, x + 13 * facing, z - 5 * facing),
    );
  }
}

function createUnit(sim, type, teamId, x, z) {
  const def = UNIT_DEFINITIONS[type];
  const unit = {
    id: sim._nextEntityId++, kind: 'unit', type, teamId, nombre: def.nombre,
    x, z, y: def.altura || 0, rotation: teamId === 'player' ? Math.PI : 0,
    radius: def.radio, height: def.altura || 1.5, hp: def.vida, maxHp: def.vida,
    armor: def.armadura, attack: def.ataque, range: def.alcance, cadence: def.cadencia,
    speed: def.velocidad, acceleration: Math.max(8, def.velocidad * 3.2), vision: def.vision,
    role: def.rol, bonusEdificio: def.bonusEdificio || 1, attackCooldown: 0,
    velocity: { x: 0, z: 0 }, orders: [], action: 'inactivo', alive: true,
    stance: 'agresiva', stanceAnchor: { x, z },
  };
  if (type === 'obrero') {
    unit.cargo = { resource: null, amount: 0, capacity: 0 };
    unit.gatherState = null;
  }
  applyUnitTechnologyStats(unit, sim.state.teams[teamId]);
  return unit;
}

function createBuilding(sim, type, teamId, x, z, complete) {
  const def = BUILDING_DEFINITIONS[type];
  return {
    id: sim._nextEntityId++, kind: 'building', type, teamId, nombre: def.nombre,
    x, z, y: 0, rotation: teamId === 'player' ? Math.PI : 0, radius: def.radio, height: def.radio * 1.45,
    hp: complete ? def.vida : def.vida * 0.1, maxHp: def.vida, armor: def.armadura,
    attack: def.ataque || 0, range: def.alcance || 0, cadence: def.cadencia || 1,
    vision: def.vision || 0,
    attackCooldown: 0, complete, buildProgress: complete ? 1 : 0,
    productionQueue: [], rallyPoint: null, orders: [], action: complete ? 'operativo' : 'construccion', alive: true,
  };
}

function createResourceNodes() {
  const nodes = [];
  const layout = [
    ['alimentos', -65, 19, 920], ['madera', -41, 46, 1100], ['acero', -35, 25, 840],
    ['energia', -20, 45, 700], ['conocimiento', -12, 28, 540],
    ['alimentos', 65, -19, 920], ['madera', 41, -46, 1100], ['acero', 35, -25, 840],
    ['energia', 20, -45, 700], ['conocimiento', 12, -28, 540],
    ['alimentos', -18, -10, 1200], ['madera', 10, 22, 1300], ['acero', 2, -24, 980],
    ['energia', 27, 2, 880], ['conocimiento', -29, 2, 720],
  ];
  layout.forEach(([resource, x, z, amount], index) => nodes.push({
    id: `recurso-${index + 1}`, resource, x, z, amount, maxAmount: amount,
    radius: resource === 'madera' ? 4.2 : resource === 'alimentos' ? 3.5 : 2.8,
  }));
  return nodes;
}

function assignStartingWorkers(sim, teamId) {
  const workers = sim.state.entities.filter((e) => e.teamId === teamId && e.kind === 'unit' && e.type === 'obrero');
  const priorities = ['alimentos', 'madera', 'acero', 'alimentos', 'madera', 'energia'];
  workers.forEach((worker, index) => {
    const preferred = priorities[index % priorities.length];
    const node = sim._nearestResource(worker, preferred);
    if (node) {
      worker.orders.push({ type: 'gather', nodeId: node.id, phase: 'hacia_recurso' });
      worker.gatherState = 'hacia_recurso';
    }
  });
}

function renderEntity(entity) {
  return {
    id: entity.id, kind: entity.kind, type: entity.type, teamId: entity.teamId, nombre: entity.nombre,
    x: round(entity.x, 3), y: round(entity.y || 0, 3), z: round(entity.z, 3), rotation: round(entity.rotation, 4),
    radius: entity.radius, hp: round(entity.hp, 1), maxHp: entity.maxHp, healthRatio: round(entity.hp / entity.maxHp, 3),
    vision: entity.vision || 0,
    action: entity.action, complete: entity.complete ?? true, buildProgress: entity.buildProgress ?? 1,
    cargo: entity.cargo ? { ...entity.cargo } : null,
    gatherState: entity.gatherState ?? null,
    stance: entity.kind === 'unit' ? normalizeUnitStance(entity.stance) : null,
    stanceAnchor: entity.kind === 'unit' && entity.stanceAnchor ? { ...entity.stanceAnchor } : null,
    productionQueue: entity.productionQueue?.map((q) => ({ ...q, progress: round(q.progress, 2) })) || [],
    currentOrder: entity.orders?.[0] ? { ...entity.orders[0] } : null,
  };
}

function createFogOfWar(teamIds) {
  return {
    cellSize: FOG_CELL_SIZE,
    columns: FOG_COLUMNS,
    rows: FOG_ROWS,
    exploredByTeam: Object.fromEntries(teamIds.map((teamId) => [teamId, []])),
    visibleByTeam: Object.fromEntries(teamIds.map((teamId) => [teamId, []])),
  };
}

function normalizeAIState(state) {
  if (!state.ai || typeof state.ai !== 'object') state.ai = {};
  const ai = state.ai;
  if (!Number.isFinite(ai.thinkTimer)) ai.thinkTimer = 1;
  if (!Number.isFinite(ai.attackTimer)) ai.attackTimer = 34;
  if (!Array.isArray(ai.knownEnemies)) ai.knownEnemies = [];
  ai.knownEnemies = ai.knownEnemies.filter((evidence) => (
    evidence
    && Number.isInteger(evidence.entityId)
    && ['unit', 'building'].includes(evidence.kind)
    && typeof evidence.type === 'string'
    && Number.isFinite(evidence.x)
    && Number.isFinite(evidence.z)
    && Number.isFinite(evidence.lastSeenAt)
  ));
  if (!ai.exploration
    || !Number.isInteger(ai.exploration.scoutId)
    || !Number.isInteger(ai.exploration.cell)
    || !Number.isFinite(ai.exploration.x)
    || !Number.isFinite(ai.exploration.z)) {
    ai.exploration = null;
  }
  return ai;
}

function normalizeEconomicCarryState(state) {
  for (const entity of state.entities) {
    if (entity.kind !== 'unit' || entity.type !== 'obrero') continue;
    const cargo = normalizeWorkerCargo(entity);
    const activeOrder = entity.orders?.[0];
    if (activeOrder?.type !== 'gather') {
      entity.gatherState = null;
      continue;
    }
    if (!['hacia_recurso', 'recolectando', 'hacia_deposito'].includes(activeOrder.phase)) {
      activeOrder.phase = cargo.amount > 0 ? 'hacia_deposito' : 'hacia_recurso';
    }
    entity.gatherState = activeOrder.phase;
  }
}

function normalizeUnitStances(state) {
  for (const entity of state.entities) {
    if (entity.kind !== 'unit') continue;
    entity.stance = normalizeUnitStance(entity.stance);
    if (!entity.stanceAnchor
      || !Number.isFinite(entity.stanceAnchor.x)
      || !Number.isFinite(entity.stanceAnchor.z)) {
      entity.stanceAnchor = { x: entity.x, z: entity.z };
    } else {
      entity.stanceAnchor = clampPoint(entity.stanceAnchor);
    }
  }
}

function normalizeWorkerCargo(unit) {
  if (!unit.cargo || typeof unit.cargo !== 'object') unit.cargo = {};
  const validResource = RESOURCE_KEYS.includes(unit.cargo.resource) ? unit.cargo.resource : null;
  const amount = Number.isFinite(unit.cargo.amount) ? Math.max(0, unit.cargo.amount) : 0;
  if (!validResource) return resetWorkerCargo(unit);
  const definedCapacity = RESOURCE_DEFINITIONS[validResource].capacidadCarga;
  unit.cargo.resource = validResource;
  unit.cargo.capacity = Number.isFinite(unit.cargo.capacity) && unit.cargo.capacity > 0
    ? Math.max(amount, unit.cargo.capacity)
    : Math.max(amount, definedCapacity);
  unit.cargo.amount = Math.min(amount, unit.cargo.capacity);
  return unit.cargo;
}

function resetWorkerCargo(unit) {
  unit.cargo = { resource: null, amount: 0, capacity: 0 };
  return unit.cargo;
}

function normalizeFogOfWar(state) {
  const teamIds = Object.keys(state.teams || {});
  const fog = state.fogOfWar;
  if (!fog || fog.cellSize !== FOG_CELL_SIZE || fog.columns !== FOG_COLUMNS || fog.rows !== FOG_ROWS) {
    state.fogOfWar = createFogOfWar(teamIds);
    return state.fogOfWar;
  }
  if (!fog.exploredByTeam || typeof fog.exploredByTeam !== 'object') fog.exploredByTeam = {};
  if (!fog.visibleByTeam || typeof fog.visibleByTeam !== 'object') fog.visibleByTeam = {};
  const cellCount = FOG_COLUMNS * FOG_ROWS;
  for (const teamId of teamIds) {
    fog.exploredByTeam[teamId] = normalizeCellIndices(fog.exploredByTeam[teamId], cellCount);
    fog.visibleByTeam[teamId] = normalizeCellIndices(fog.visibleByTeam[teamId], cellCount);
  }
  return fog;
}

function fogCellCenter(index, fog) {
  const column = index % fog.columns;
  const row = Math.floor(index / fog.columns);
  return {
    x: MAP_BOUNDS.minX + (column + 0.5) * fog.cellSize,
    z: MAP_BOUNDS.minZ + (row + 0.5) * fog.cellSize,
  };
}

function normalizeCellIndices(indices, cellCount) {
  if (!Array.isArray(indices)) return [];
  return [...new Set(indices.filter((index) => Number.isInteger(index) && index >= 0 && index < cellCount))]
    .sort((a, b) => a - b);
}

function revealObserverCells(visible, observer, fog) {
  const vision = Math.max(0, Number(observer.vision) || 0);
  const minColumn = clamp(Math.floor((observer.x - vision - MAP_BOUNDS.minX) / fog.cellSize), 0, fog.columns - 1);
  const maxColumn = clamp(Math.floor((observer.x + vision - MAP_BOUNDS.minX) / fog.cellSize), 0, fog.columns - 1);
  const minRow = clamp(Math.floor((observer.z - vision - MAP_BOUNDS.minZ) / fog.cellSize), 0, fog.rows - 1);
  const maxRow = clamp(Math.floor((observer.z + vision - MAP_BOUNDS.minZ) / fog.cellSize), 0, fog.rows - 1);
  const visionSq = vision * vision;
  for (let row = minRow; row <= maxRow; row += 1) {
    const cellMinZ = MAP_BOUNDS.minZ + row * fog.cellSize;
    const cellMaxZ = cellMinZ + fog.cellSize;
    const closestZ = clamp(observer.z, cellMinZ, cellMaxZ);
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const cellMinX = MAP_BOUNDS.minX + column * fog.cellSize;
      const cellMaxX = cellMinX + fog.cellSize;
      const closestX = clamp(observer.x, cellMinX, cellMaxX);
      if ((observer.x - closestX) ** 2 + (observer.z - closestZ) ** 2 <= visionSq) {
        visible.add(row * fog.columns + column);
      }
    }
  }
}

function mergeSortedIndices(first = [], second = []) {
  const merged = [];
  let firstIndex = 0;
  let secondIndex = 0;
  while (firstIndex < first.length || secondIndex < second.length) {
    const left = first[firstIndex];
    const right = second[secondIndex];
    const next = right === undefined || (left !== undefined && left <= right)
      ? first[firstIndex++]
      : second[secondIndex++];
    if (merged.at(-1) !== next) merged.push(next);
  }
  return merged;
}

function encodeIndexRanges(indices) {
  const ranges = [];
  for (let index = 0; index < indices.length;) {
    const start = indices[index];
    let length = 1;
    while (index + length < indices.length && indices[index + length] === start + length) length += 1;
    ranges.push(start, length);
    index += length;
  }
  return ranges;
}

function weaponClassFor(attacker, teamEra) {
  if ((attacker.range || 0) <= 3) return 'melee';
  if (['dron', 'exotraje', 'caminante'].includes(attacker.type)) return 'energy';
  if (attacker.role === 'aereo' && teamEra >= 2) return 'energy';
  if (attacker.role === 'asedio' || attacker.role === 'blindado' || attacker.kind === 'building') return 'shell';
  return 'rifle';
}

function normalizeTeamTechnologies(team) {
  if (!team.technologies || typeof team.technologies !== 'object') {
    team.technologies = {
      researched: TECHNOLOGIES.filter((technology) => technology.era < (team.era || 0)).map((technology) => technology.id),
      active: null,
    };
  }
  if (!Array.isArray(team.technologies.researched)) team.technologies.researched = [];
  team.technologies.researched = [...new Set(team.technologies.researched.filter((id) => TECHNOLOGIES.some((technology) => technology.id === id)))];
  if (!team.technologies.active || typeof team.technologies.active !== 'object') team.technologies.active = null;
  return team.technologies;
}

function technologyEffects(team) {
  normalizeTeamTechnologies(team);
  return accumulateTechnologyEffects(team.technologies.researched);
}

function technologyName(id) {
  return TECHNOLOGIES.find((technology) => technology.id === id)?.nombre || id;
}

function applyUnitTechnologyStats(unit, team) {
  const def = UNIT_DEFINITIONS[unit.type];
  if (!def || !team) return unit;
  const effects = technologyEffects(team);
  const vehicle = ['caballeria', 'artilleria', 'tanque', 'caminante'].includes(unit.type);
  const speedBonus = (effects.logistica?.velocidadTerrestre || 0)
    + (effects.unidades?.velocidadTerrestre || 0)
    + (vehicle ? (effects.unidades?.velocidadVehiculos || 0) : 0);
  const armorBonus = vehicle ? (effects.unidades?.armaduraVehiculos || 0) : 0;
  const precisionBonus = effects.unidades?.precision || 0;
  unit.speed = round(def.velocidad * (1 + speedBonus), 4);
  unit.acceleration = Math.max(8, unit.speed * 3.2);
  unit.armor = round(def.armadura * (1 + armorBonus), 4);
  unit.attack = round(def.ataque * (1 + precisionBonus), 4);
  unit.vision = round(def.vision * (1 + (effects.mando?.vision || 0)), 4);
  return unit;
}

function chooseNeededResource(resources) {
  return RESOURCE_KEYS.slice().sort((a, b) => resources[a] - resources[b] || a.localeCompare(b))[0];
}

function normalizeFormation(value, fallback = 'linea') {
  const normalized = typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    : '';
  const aliases = { linea: 'linea', line: 'linea', columna: 'columna', column: 'columna', cuna: 'cuna', wedge: 'cuna' };
  return aliases[normalized] || fallback;
}

function normalizeUnitStance(value, fallback = 'agresiva') {
  const normalized = typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s-]+/g, '_')
    : '';
  const aliases = {
    agresiva: 'agresiva', aggressive: 'agresiva',
    defensiva: 'defensiva', defensive: 'defensiva',
    mantener_posicion: 'mantener_posicion', hold_position: 'mantener_posicion', hold: 'mantener_posicion',
  };
  return aliases[normalized] || fallback;
}

function queuedOrderOrigin(unit, queued) {
  if (!queued || !unit.orders.length) return { x: unit.x, z: unit.z };
  const last = unit.orders.at(-1);
  if (Number.isFinite(last?.x) && Number.isFinite(last?.z)) return { x: last.x, z: last.z };
  if (Array.isArray(last?.points)) {
    const point = last.points[last.pointIndex === 0 ? 0 : 1];
    if (Number.isFinite(point?.x) && Number.isFinite(point?.z)) return { x: point.x, z: point.z };
  }
  return { x: unit.x, z: unit.z };
}

function formationAssignments(units, destination, formation, queued) {
  if (!units.length) return [];
  const origins = units.map((unit) => queuedOrderOrigin(unit, queued));
  const center = origins.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
  center.x /= origins.length;
  center.z /= origins.length;
  const dx = destination.x - center.x;
  const dz = destination.z - center.z;
  const magnitude = Math.hypot(dx, dz);
  const forward = magnitude > 1e-9 ? { x: dx / magnitude, z: dz / magnitude } : { x: 0, z: 1 };
  const right = { x: -forward.z, z: forward.x };
  return units.map((unit, index) => {
    const offset = formationOffset(index, units.length, formation);
    return {
      x: clamp(round(destination.x + forward.x * offset.longitudinal + right.x * offset.lateral, 4), MAP_BOUNDS.minX, MAP_BOUNDS.maxX),
      z: clamp(round(destination.z + forward.z * offset.longitudinal + right.z * offset.lateral, 4), MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ),
    };
  });
}

function formationOffset(index, count, formation) {
  if (count <= 1) return { longitudinal: 0, lateral: 0 };
  if (formation === 'columna') {
    return { longitudinal: ((count - 1) / 2 - index) * FORMATION_SPACING, lateral: 0 };
  }
  if (formation === 'cuna') {
    const raw = Array.from({ length: count }, (_, slot) => {
      if (slot === 0) return { longitudinal: 0, lateral: 0 };
      const row = Math.ceil(slot / 2);
      return {
        longitudinal: -row * FORMATION_SPACING,
        lateral: (slot % 2 === 1 ? -1 : 1) * row * FORMATION_SPACING / 2,
      };
    });
    const center = raw.reduce((sum, point) => ({
      longitudinal: sum.longitudinal + point.longitudinal,
      lateral: sum.lateral + point.lateral,
    }), { longitudinal: 0, lateral: 0 });
    return {
      longitudinal: raw[index].longitudinal - center.longitudinal / count,
      lateral: raw[index].lateral - center.lateral / count,
    };
  }
  return { longitudinal: 0, lateral: (index - (count - 1) / 2) * FORMATION_SPACING };
}

function calculateScore(state, teamId) {
  const team = state.teams[teamId];
  const army = state.entities.filter((e) => e.alive && e.teamId === teamId).reduce((sum, e) => sum + (e.kind === 'building' ? 90 : 25), 0);
  const resources = RESOURCE_KEYS.reduce((sum, key) => sum + team.recursos[key], 0) * 0.12;
  const territory = state.controlPoints.filter((p) => p.ownerId === teamId).length * 350;
  return Math.round(team.score + army + resources + territory + team.era * 700);
}

function canAfford(resources, cost) {
  return Object.entries(cost || {}).every(([key, value]) => (resources[key] || 0) + 1e-9 >= value);
}

function spend(resources, cost) {
  for (const [key, value] of Object.entries(cost || {})) resources[key] = round(resources[key] - value, 3);
}

function refund(resources, cost, ratio) {
  for (const [key, value] of Object.entries(cost || {})) resources[key] = round(resources[key] + value * ratio, 3);
}

function clampPoint({ x, z }) {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeZ = Number.isFinite(z) ? z : 0;
  return { x: clamp(safeX, MAP_BOUNDS.minX, MAP_BOUNDS.maxX), z: clamp(safeZ, MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ) };
}

function distance(a, b) {
  return Math.sqrt(distanceSq(a, b));
}

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function segmentDistanceSq(startX, startZ, endX, endZ, pointX, pointZ) {
  const segmentX = endX - startX;
  const segmentZ = endZ - startZ;
  const lengthSq = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSq <= 1e-12) return (pointX - startX) ** 2 + (pointZ - startZ) ** 2;
  const projection = clamp(((pointX - startX) * segmentX + (pointZ - startZ) * segmentZ) / lengthSq, 0, 1);
  const closestX = startX + segmentX * projection;
  const closestZ = startZ + segmentZ * projection;
  return (pointX - closestX) ** 2 + (pointZ - closestZ) ** 2;
}

function navigationSide(firstId, secondId) {
  const pair = [String(firstId), String(secondId)].sort().join('::');
  let hash = 2166136261;
  for (let index = 0; index < pair.length; index += 1) hash = Math.imul(hash ^ pair.charCodeAt(index), 16777619);
  return (hash >>> 0) % 2 === 0 ? 1 : -1;
}

function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeSeed(seed) {
  if (typeof seed === 'string') {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
    return hash >>> 0 || 1;
  }
  return (Number(seed) >>> 0) || 1;
}

function nextCounter(serializedValue, existingValues) {
  const derived = Math.max(0, ...existingValues) + 1;
  return Number.isInteger(serializedValue) && serializedValue > 0
    ? Math.max(serializedValue, derived)
    : derived;
}

function createRng(seed, restoredState) {
  let state = Number.isFinite(restoredState) ? restoredState >>> 0 : seed >>> 0;
  const random = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  random.getState = () => state >>> 0;
  return random;
}

function parseSavePayload(payload) {
  let parsed = payload;
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new Error('El archivo de partida no contiene JSON válido.');
    }
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.state) throw new Error('El archivo de partida está incompleto.');
  if (parsed.format && parsed.format !== 'dominio-partida') throw new Error('El archivo no pertenece a DOMINIO: SIGLOS DE ACERO.');
  if (parsed.version != null && parsed.version !== 1) throw new Error(`Versión de partida no compatible: ${parsed.version}.`);
  const state = parsed.state;
  if (!['jugando', 'finalizado'].includes(state.mode)
    || !state.teams?.player || !state.teams?.rival
    || !Array.isArray(state.entities) || !Array.isArray(state.resourceNodes)
    || !Array.isArray(state.controlPoints) || !Array.isArray(state.effects)
    || !Array.isArray(state.events) || !Array.isArray(state.selectedIds)) {
    throw new Error('El estado de la partida no tiene la estructura esperada.');
  }
  return parsed;
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(object) {
  if (!object || typeof object !== 'object' || Object.isFrozen(object)) return object;
  Object.freeze(object);
  Object.values(object).forEach(deepFreeze);
  return object;
}

export default createSimulation;
