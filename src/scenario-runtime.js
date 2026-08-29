/**
 * Traduce los expedientes narrativos de campaña a condiciones observables de
 * la simulación. No decide la victoria de la escaramuza: sólo mide si la
 * operación descrita realmente fue ejecutada.
 */

export const SCENARIO_RUNTIME_VERSION = 1;

const CONTROL_NAMES = Object.freeze({
  'vapor-las-lineas-del-alba': ['Depósito Carbonero Oeste', 'Estación Telegráfica', 'Fundición del Estuario'],
  'industria-trueno-coordinado': ['Corredor Blindado Oeste', 'Nudo Ferroviario', 'Corredor Blindado Este'],
  'atomo-el-sol-cautivo': ['Centro de Datos Norte', 'Núcleo Magnético', 'Centro de Datos Sur'],
  'orbital-puente-de-selene': ['Repetidor Selene I', 'Puerto Cislunar', 'Repetidor Selene III'],
});

export function configureScenarioState(state, scenarioId) {
  assertState(state);
  const names = CONTROL_NAMES[scenarioId];
  if (!names) throw new RangeError(`Escenario sin runtime: ${scenarioId}.`);

  state.mission = {
    version: SCENARIO_RUNTIME_VERSION,
    scenarioId,
    configuredAt: state.time,
    roles: {},
  };
  state.controlPoints.forEach((point, index) => {
    point.nombre = names[index] || point.nombre;
    point.missionRole = index === 1 ? 'central' : index === 0 ? 'west' : 'east';
  });

  const playerBuildings = state.entities.filter((entity) => entity.alive && entity.teamId === 'player' && entity.kind === 'building');
  const playerUnits = state.entities.filter((entity) => entity.alive && entity.teamId === 'player' && entity.kind === 'unit');

  if (scenarioId === 'vapor-las-lineas-del-alba') {
    const telegraph = playerBuildings.find((entity) => entity.type === 'universidad');
    if (telegraph) {
      telegraph.nombre = 'Estación telegráfica dañada';
      telegraph.missionRole = 'telegraph';
      telegraph.complete = false;
      telegraph.buildProgress = 0.48;
      telegraph.hp = Math.max(1, telegraph.maxHp * 0.48);
      telegraph.action = 'reparacion';
      state.mission.roles.telegraphId = telegraph.id;
      const engineer = playerUnits.find((entity) => entity.type === 'obrero');
      if (engineer) {
        engineer.x = telegraph.x - telegraph.radius - engineer.radius - 0.55;
        engineer.z = telegraph.z;
        engineer.velocity = { x: 0, z: 0 };
        engineer.orders = [{ type: 'build', targetId: telegraph.id }];
        engineer.nombre = 'Ingeniero telegráfico';
      }
    }
    const escort = playerUnits.find((entity) => entity.type === 'fusilero');
    if (escort) {
      escort.nombre = 'Escolta del convoy ferroviario';
      escort.missionRole = 'convoy-escort';
      state.mission.roles.convoyEscortId = escort.id;
    }
    state.mission.roles.bridgeIds = playerBuildings
      .filter((entity) => entity.type === 'vivienda')
      .slice(0, 2)
      .map((entity) => {
        entity.missionRole = 'iron-bridge';
        return entity.id;
      });
  }

  if (scenarioId === 'industria-trueno-coordinado') {
    const hospital = playerBuildings.find((entity) => entity.type === 'universidad');
    if (hospital) {
      hospital.nombre = 'Hospital de campaña';
      hospital.missionRole = 'field-hospital';
      state.mission.roles.hospitalId = hospital.id;
    }
  }

  return state.mission;
}

export function createScenarioRuntime({ scenarioId, initialState, savedState = null }) {
  return new ScenarioRuntime({ scenarioId, initialState, savedState });
}

export class ScenarioRuntime {
  constructor({ scenarioId, initialState, savedState = null }) {
    assertState(initialState);
    if (!CONTROL_NAMES[scenarioId]) throw new RangeError(`Escenario sin runtime: ${scenarioId}.`);
    this.scenarioId = scenarioId;
    this.initial = {
      time: initialState.time,
      resources: snapshotResources(initialState),
      workers: countEntities(initialState, (entity) => entity.teamId === 'player' && entity.type === 'obrero'),
      robots: countEntities(initialState, isPlayerRobot),
    };
    this.lastEventId = 0;
    this.destroyedHeavy = new Set();
    this.destroyedDrones = new Set();
    this.reconPoints = new Set();
    if (savedState) this.load(savedState);
  }

  evaluate(state) {
    assertState(state);
    this.#consumeEvents(state.events || []);
    this.#updateRecon(state);
    const metrics = this.#metrics(state);
    return Object.fromEntries(Object.entries(metrics).map(([id, value]) => [id, Math.max(0, finite(value))]));
  }

  serialize() {
    return {
      version: SCENARIO_RUNTIME_VERSION,
      scenarioId: this.scenarioId,
      initial: structuredCloneSafe(this.initial),
      lastEventId: this.lastEventId,
      destroyedHeavy: [...this.destroyedHeavy],
      destroyedDrones: [...this.destroyedDrones],
      reconPoints: [...this.reconPoints],
    };
  }

  load(payload) {
    if (!payload || payload.version !== SCENARIO_RUNTIME_VERSION || payload.scenarioId !== this.scenarioId) {
      throw new TypeError('Estado de operación incompatible.');
    }
    if (payload.initial) this.initial = structuredCloneSafe(payload.initial);
    this.lastEventId = finite(payload.lastEventId);
    this.destroyedHeavy = new Set(payload.destroyedHeavy || []);
    this.destroyedDrones = new Set(payload.destroyedDrones || []);
    this.reconPoints = new Set(payload.reconPoints || []);
    return this;
  }

  #consumeEvents(events) {
    [...events]
      .filter((event) => finite(event.id) > this.lastEventId)
      .sort((a, b) => finite(a.id) - finite(b.id))
      .forEach((event) => {
        this.lastEventId = Math.max(this.lastEventId, finite(event.id));
        if (event.type !== 'entidad_destruida') return;
        if (['artilleria', 'tanque', 'bastion'].includes(event.targetType)) this.destroyedHeavy.add(event.entityId ?? event.targetId ?? event.id);
        if (event.targetType === 'dron') this.destroyedDrones.add(event.entityId ?? event.targetId ?? event.id);
      });
  }

  #updateRecon(state) {
    const scouts = state.entities.filter((entity) => entity.alive && entity.teamId === 'player' && ['caballeria', 'dron'].includes(entity.type));
    state.controlPoints.forEach((point) => {
      if (scouts.some((unit) => distanceSq(unit, point) <= (point.radius + 2) ** 2)) this.reconPoints.add(point.id);
    });
  }

  #metrics(state) {
    const owned = state.controlPoints.filter((point) => point.ownerId === 'player');
    const ownedRoles = new Set(owned.map((point) => point.missionRole));
    const elapsed = Math.max(0, state.time - this.initial.time);
    const roles = state.mission?.roles || {};
    const alive = (id) => state.entities.some((entity) => entity.id === id && entity.alive);
    const complete = (id) => state.entities.some((entity) => entity.id === id && entity.alive && entity.complete !== false);
    const completedCentrals = countEntities(state, (entity) => entity.alive && entity.complete && entity.teamId === 'player' && entity.type === 'central');

    if (this.scenarioId === 'vapor-las-lineas-del-alba') {
      const telegraphReady = complete(roles.telegraphId);
      const convoyReady = telegraphReady && ownedRoles.has('central') && elapsed >= 90 && alive(roles.convoyEscortId);
      return {
        carbon: owned.length,
        telegrafo: telegraphReady ? 1 : 0,
        convoy: convoyReady ? 1 : 0,
        artesanos: Math.max(0, countEntities(state, (entity) => entity.alive && entity.teamId === 'player' && entity.type === 'obrero') - this.initial.workers),
        puentes: (roles.bridgeIds || []).filter(alive).length,
      };
    }

    if (this.scenarioId === 'industria-trueno-coordinado') {
      return {
        baterias: this.destroyedHeavy.size,
        corredores: Number(ownedRoles.has('west')) + Number(ownedRoles.has('east')),
        'nudo-ferroviario': Number(ownedRoles.has('central')),
        reconocimiento: this.reconPoints.size,
        hospital: Number(alive(roles.hospitalId)),
      };
    }

    if (this.scenarioId === 'atomo-el-sol-cautivo') {
      return {
        datos: owned.length,
        sincronizadores: completedCentrals,
        reconexion: Number(owned.length >= 3 && completedCentrals >= 4 && elapsed >= 180),
        microredes: completedCentrals,
        enjambres: this.destroyedDrones.size,
      };
    }

    const extracted = resourceDelta(state, this.initial.resources, ['acero', 'energia', 'conocimiento']);
    return {
      'energia-lunar': completedCentrals,
      isru: extracted,
      repetidores: owned.length,
      robots: countEntities(state, isPlayerRobot),
      habitats: countEntities(state, (entity) => entity.alive && entity.complete && entity.teamId === 'player' && entity.type === 'vivienda'),
    };
  }
}

function snapshotResources(state) {
  const resources = state.teams?.player?.recursos || {};
  return Object.fromEntries(Object.entries(resources).map(([key, value]) => [key, finite(value)]));
}

function resourceDelta(state, initial, keys) {
  const resources = state.teams?.player?.recursos || {};
  return Math.floor(keys.reduce((sum, key) => sum + Math.max(0, finite(resources[key]) - finite(initial[key])), 0));
}

function countEntities(state, predicate) {
  return state.entities.reduce((count, entity) => count + Number(Boolean(predicate(entity))), 0);
}

function isPlayerRobot(entity) {
  return entity.alive && entity.teamId === 'player' && ['dron', 'exotraje', 'caminante'].includes(entity.type);
}

function distanceSq(a, b) {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function assertState(state) {
  if (!state || !Array.isArray(state.entities) || !Array.isArray(state.controlPoints) || !state.teams?.player) {
    throw new TypeError('El runtime de operación requiere un estado de simulación válido.');
  }
}

function structuredCloneSafe(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
