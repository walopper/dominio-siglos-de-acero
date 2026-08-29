import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCampaignBonuses } from '../src/campaign-bonuses.js';
import { createSimulation } from '../src/simulation.js';

function campaignProgress(overrides = {}) {
  return {
    prestigio: 0,
    inventario: {},
    desbloqueos: [],
    ...overrides,
  };
}

test('convierte prestigio e inventario en recursos iniciales explicados', () => {
  const simulation = createSimulation({ ai: false });
  const progress = campaignProgress({
    prestigio: 200,
    inventario: { planos: 2, suministros: 150, acero: 300, energia: 500, helio3: 200 },
  });
  const before = structuredClone(simulation.state.teams.player.recursos);

  const receipt = applyCampaignBonuses(simulation.state, progress);

  assert.deepEqual(simulation.state.teams.player.recursos, {
    alimentos: before.alimentos + 150,
    madera: before.madera,
    acero: before.acero + 300,
    energia: before.energia + 900,
    conocimiento: before.conocimiento + 140,
  });
  assert.deepEqual(receipt.resources, {
    alimentos: 150,
    acero: 300,
    energia: 900,
    conocimiento: 140,
  });
  assert.match(receipt.explanations.join(' '), /prestigio/i);
  assert.match(receipt.explanations.join(' '), /planos/i);
  assert.match(receipt.explanations.join(' '), /helio-3/i);
  assert.equal(simulation.state.mission.campaignBonuses, receipt);
});

test('los desbloqueos narrativos mejoran visión, ataque, blindaje, vida, velocidad y energía', () => {
  const simulation = createSimulation({ ai: false, startingEra: 3 });
  const progress = campaignProgress({
    desbloqueos: [
      'ingenieros-ferroviarios',
      'locomotora-blindada',
      'doctrina-armas-combinadas',
      'observadores-aereos',
      'cadena-logistica-mecanizada',
      'arquitectura-red-resiliente',
      'defensa-de-enjambre',
      'microred-autonoma',
      'blindaje-reactivo',
      'victoria-la-forja-del-porvenir',
      'arquitectos-del-horizonte',
    ],
  });
  const playerUnit = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  const playerWorker = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'obrero');
  const playerBuilding = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.kind === 'building');
  const rivalUnit = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'fusilero');
  const before = structuredClone({ playerUnit, playerWorker, playerBuilding, rivalUnit, energy: simulation.state.teams.player.recursos.energia });

  const receipt = applyCampaignBonuses(simulation.state, progress);

  assert.ok(playerUnit.vision > before.playerUnit.vision);
  assert.ok(playerUnit.attack > before.playerUnit.attack);
  assert.ok(playerUnit.armor > before.playerUnit.armor);
  assert.ok(playerUnit.maxHp > before.playerUnit.maxHp);
  assert.ok(playerUnit.speed > before.playerUnit.speed);
  assert.ok(playerWorker.speed > before.playerWorker.speed);
  assert.ok(playerBuilding.maxHp > before.playerBuilding.maxHp);
  assert.ok(simulation.state.teams.player.recursos.energia > before.energy);
  assert.deepEqual(rivalUnit, before.rivalUnit);
  assert.equal(receipt.unlocks.length, progress.desbloqueos.length);
  assert.ok(receipt.unlocks.every(({ id, name, explanation }) => id && name && explanation));
  assert.deepEqual(Object.keys(receipt.modifiers).sort(), ['armor', 'attack', 'health', 'speed', 'vision']);
});

test('es idempotente y no muta el progreso recibido', () => {
  const simulation = createSimulation({ ai: false, startingEra: 2 });
  const progress = campaignProgress({
    prestigio: 100,
    inventario: { energia: 500 },
    desbloqueos: ['defensa-de-enjambre', 'blindaje-reactivo'],
  });
  const progressBefore = structuredClone(progress);

  const first = applyCampaignBonuses(simulation.state, progress);
  const stateAfterFirst = structuredClone(simulation.state);
  const second = applyCampaignBonuses(simulation.state, progress);

  assert.deepEqual(progress, progressBefore);
  assert.equal(second, first);
  assert.deepEqual(simulation.state, stateAfterFirst);
});

test('normaliza entradas parciales sin conceder valores negativos ni desbloqueos desconocidos', () => {
  const simulation = createSimulation({ ai: false });
  const before = structuredClone(simulation.state);

  const receipt = applyCampaignBonuses(simulation.state, {
    prestigio: -100,
    inventario: { acero: -50, desconocido: 25, energia: Number.NaN },
    desbloqueos: ['sin-catalogar', 'sin-catalogar', null],
  });

  assert.deepEqual(simulation.state.teams.player.recursos, before.teams.player.recursos);
  assert.deepEqual(receipt.resources, {});
  assert.deepEqual(receipt.unlocks, []);
  assert.deepEqual(receipt.ignoredUnlocks, ['sin-catalogar']);
});

test('valida que el destino tenga la forma mínima de un estado de simulación', () => {
  assert.throws(() => applyCampaignBonuses(null, campaignProgress()), /estado/i);
  assert.throws(() => applyCampaignBonuses({}, campaignProgress()), /equipo local/i);
});
