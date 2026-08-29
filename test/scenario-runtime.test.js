import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/simulation.js';
import { configureScenarioState, createScenarioRuntime } from '../src/scenario-runtime.js';

function setup(scenarioId, startingEra = 0) {
  const simulation = createSimulation({ ai: false, startingEra });
  configureScenarioState(simulation.state, scenarioId);
  const runtime = createScenarioRuntime({ scenarioId, initialState: simulation.getState() });
  return { simulation, runtime };
}

test('la operación de vapor exige reparación, territorio y escolta real en el tiempo', () => {
  const { simulation, runtime } = setup('vapor-las-lineas-del-alba');
  let metrics = runtime.evaluate(simulation.getState());
  assert.equal(metrics.telegrafo, 0);
  assert.equal(metrics.convoy, 0);
  assert.equal(metrics.puentes, 2);

  simulation.state.controlPoints.forEach((point) => { point.ownerId = 'player'; });
  const telegraph = simulation.state.entities.find((entity) => entity.id === simulation.state.mission.roles.telegraphId);
  telegraph.complete = true;
  telegraph.buildProgress = 1;
  simulation.state.time = 91;
  metrics = runtime.evaluate(simulation.getState());
  assert.equal(metrics.carbon, 3);
  assert.equal(metrics.telegrafo, 1);
  assert.equal(metrics.convoy, 1);

  simulation.state.entities.find((entity) => entity.id === simulation.state.mission.roles.bridgeIds[0]).alive = false;
  assert.equal(runtime.evaluate(simulation.getState()).puentes, 1);
});

test('la operación industrial mide bajas pesadas, corredores, nudo y reconocimiento', () => {
  const { simulation, runtime } = setup('industria-trueno-coordinado', 1);
  const [west, center, east] = simulation.state.controlPoints;
  west.ownerId = 'player';
  center.ownerId = 'player';
  east.ownerId = 'player';
  const scout = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'tanque');
  scout.type = 'caballeria';
  for (const point of simulation.state.controlPoints) {
    scout.x = point.x;
    scout.z = point.z;
    runtime.evaluate(simulation.getState());
  }
  simulation.state.events.push(
    { id: 100, type: 'entidad_destruida', entityId: 500, targetType: 'artilleria' },
    { id: 101, type: 'entidad_destruida', entityId: 501, targetType: 'tanque' },
  );
  const metrics = runtime.evaluate(simulation.getState());
  assert.equal(metrics.baterias, 2);
  assert.equal(metrics.corredores, 2);
  assert.equal(metrics['nudo-ferroviario'], 1);
  assert.equal(metrics.reconocimiento, 3);
  assert.equal(metrics.hospital, 1);
});

test('átomo y orbital usan infraestructura, tiempo, extracción y entidades supervivientes', () => {
  const atomic = setup('atomo-el-sol-cautivo', 2);
  atomic.simulation.state.controlPoints.forEach((point) => { point.ownerId = 'player'; });
  const templateCentral = atomic.simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'central');
  for (let i = 0; i < 3; i += 1) atomic.simulation.state.entities.push({ ...structuredClone(templateCentral), id: 800 + i });
  atomic.simulation.state.time = 181;
  atomic.simulation.state.events.push({ id: 700, type: 'entidad_destruida', entityId: 900, targetType: 'dron' });
  const atomicMetrics = atomic.runtime.evaluate(atomic.simulation.getState());
  assert.deepEqual(
    { datos: atomicMetrics.datos, sincronizadores: atomicMetrics.sincronizadores, reconexion: atomicMetrics.reconexion, microredes: atomicMetrics.microredes, enjambres: atomicMetrics.enjambres },
    { datos: 3, sincronizadores: 4, reconexion: 1, microredes: 4, enjambres: 1 },
  );

  const orbital = setup('orbital-puente-de-selene', 3);
  orbital.simulation.state.teams.player.recursos.acero += 430;
  orbital.simulation.state.teams.player.recursos.energia += 370;
  orbital.simulation.state.teams.player.recursos.conocimiento += 260;
  const orbitalMetrics = orbital.runtime.evaluate(orbital.simulation.getState());
  assert.equal(orbitalMetrics.isru, 1060);
  assert.ok(orbitalMetrics.robots >= 3);
  assert.equal(orbitalMetrics.habitats, 2);
});

test('el runtime serializa contadores sin volver a contar eventos', () => {
  const { simulation, runtime } = setup('industria-trueno-coordinado', 1);
  simulation.state.events.push({ id: 42, type: 'entidad_destruida', entityId: 99, targetType: 'artilleria' });
  assert.equal(runtime.evaluate(simulation.getState()).baterias, 1);
  const restored = createScenarioRuntime({
    scenarioId: 'industria-trueno-coordinado',
    initialState: simulation.getState(),
    savedState: runtime.serialize(),
  });
  assert.equal(restored.evaluate(simulation.getState()).baterias, 1);
  assert.equal(restored.serialize().lastEventId, 42);
});
