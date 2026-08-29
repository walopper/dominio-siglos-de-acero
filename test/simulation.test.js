import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, createSimulationFromSave, ERAS, SIMULATION_CONSTANTS } from '../src/simulation.js';

function advanceSeconds(simulation, seconds) {
  for (let second = 0; second < seconds; second += 1) simulation.advance(1000);
  return simulation.getRenderState();
}

function configureBlockedRoute(simulation, blockerKind = 'building') {
  const mover = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  const blocker = blockerKind === 'resource'
    ? simulation.state.resourceNodes.find((node) => node.resource === 'conocimiento')
    : simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'vivienda');
  mover.x = -14;
  mover.z = 0;
  mover.velocity = { x: 0, z: 0 };
  mover.orders = [];
  blocker.x = 0;
  blocker.z = 0;
  simulation.selectUnits(mover.id);
  simulation.issueMove(14, 0);
  return { mover, blocker };
}

function configureGatherCycle(simulation, { amount = 200, resource = 'madera' } = {}) {
  const workers = simulation.state.entities.filter((entity) => entity.teamId === 'player' && entity.type === 'obrero');
  workers.forEach((worker) => { worker.orders = []; });
  const worker = workers[0];
  const node = simulation.state.resourceNodes.find((candidate) => candidate.resource === resource);
  const deposit = simulation.state.entities.find((entity) => (
    entity.teamId === 'player' && entity.type === 'cuartelGeneral'
  ));
  node.x = -38;
  node.z = 34;
  node.amount = amount;
  node.maxAmount = Math.max(node.maxAmount, amount);
  worker.x = node.x - node.radius - worker.radius - 0.2;
  worker.z = node.z;
  worker.velocity = { x: 0, z: 0 };
  simulation.selectUnits(worker.id);
  assert.equal(simulation.issueGather(node.id), true);
  return { worker, node, deposit };
}

function advanceUntil(simulation, predicate, maxTicks = 600) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    simulation.advance(50);
    if (predicate()) return tick + 1;
  }
  assert.fail(`La condición no se cumplió después de ${maxTicks} ticks.`);
}

test('la misma semilla y órdenes producen el mismo estado', () => {
  const first = createSimulation({ seed: 1800, ai: false });
  const second = createSimulation({ seed: 1800, ai: false });
  advanceSeconds(first, 12);
  advanceSeconds(second, 12);
  assert.deepEqual(first.getRenderState(), second.getRenderState());
});

test('recolección, movimiento y pausa respetan el paso determinista', () => {
  const simulation = createSimulation({ ai: false });
  const initial = simulation.getRenderState();
  const worker = initial.entities.find((entity) => initial.selectedIds.includes(entity.id));
  const gathered = advanceSeconds(simulation, 12);
  assert.ok(gathered.teams.player.recursos.madera > initial.teams.player.recursos.madera);

  simulation.selectUnits(worker.id);
  simulation.issueMove(-20, 0);
  const moved = advanceSeconds(simulation, 12).entities.find((entity) => entity.id === worker.id);
  assert.ok(moved.x > worker.x + 10);

  simulation.setPaused(true);
  const pausedAt = simulation.getRenderState().time;
  simulation.advance(1000);
  assert.equal(simulation.getRenderState().time, pausedAt);
});

test('recolectar llena una carga finita sin acreditar el tesoro inmediatamente', () => {
  const simulation = createSimulation({ seed: 1810, ai: false });
  const { worker, node } = configureGatherCycle(simulation);
  const initialTreasury = simulation.state.teams.player.recursos.madera;
  const initialNodeAmount = node.amount;

  simulation.advance(1000);

  assert.equal(simulation.state.teams.player.recursos.madera, initialTreasury);
  assert.ok(node.amount < initialNodeAmount);
  assert.equal(worker.cargo.resource, 'madera');
  assert.ok(worker.cargo.amount > 0 && worker.cargo.amount < worker.cargo.capacity);
  assert.equal(worker.gatherState, 'recolectando');
  const rendered = simulation.getRenderState().entities.find((entity) => entity.id === worker.id);
  assert.deepEqual(rendered.cargo, worker.cargo);
  assert.equal(rendered.gatherState, worker.gatherState);
});

test('al llenar la carga el pionero deposita y regresa al nodo con la misma orden', () => {
  const simulation = createSimulation({ seed: 1811, ai: false });
  const { worker, node, deposit } = configureGatherCycle(simulation);
  const initialTreasury = simulation.state.teams.player.recursos.madera;

  advanceUntil(simulation, () => worker.gatherState === 'hacia_deposito');
  const fullLoad = worker.cargo.amount;
  assert.equal(fullLoad, worker.cargo.capacity);
  assert.equal(simulation.state.teams.player.recursos.madera, initialTreasury);
  advanceUntil(simulation, () => worker.orders[0].depositId === deposit.id);
  assert.equal(worker.orders[0].depositId, deposit.id);

  advanceUntil(simulation, () => simulation.state.teams.player.recursos.madera > initialTreasury);
  assert.equal(simulation.state.teams.player.recursos.madera, initialTreasury + fullLoad);
  assert.equal(worker.cargo.amount, 0);
  assert.equal(worker.orders[0].type, 'gather');
  assert.equal(worker.gatherState, 'hacia_recurso');

  advanceUntil(simulation, () => worker.gatherState === 'recolectando');
  assert.equal(worker.orders[0].nodeId, node.id);
  assert.ok(worker.cargo.amount > 0);
});

test('un nodo agotado conserva su última carga hasta depositarla y entonces termina', () => {
  const simulation = createSimulation({ seed: 1812, ai: false });
  const { worker, node } = configureGatherCycle(simulation, { amount: 3 });
  const initialTreasury = simulation.state.teams.player.recursos.madera;

  advanceUntil(simulation, () => node.amount === 0);
  assert.equal(simulation.state.teams.player.recursos.madera, initialTreasury);
  assert.equal(worker.cargo.amount, 3);
  assert.equal(worker.gatherState, 'hacia_deposito');

  advanceUntil(simulation, () => worker.orders.length === 0);
  assert.equal(simulation.state.teams.player.recursos.madera, initialTreasury + 3);
  assert.deepEqual(worker.cargo, { resource: null, amount: 0, capacity: 0 });
  assert.equal(worker.gatherState, null);
});

test('pausa y reemplazo de depósito preservan la carga sin pérdida ni duplicación', () => {
  const simulation = createSimulation({ seed: 1813, ai: false });
  const { worker, deposit } = configureGatherCycle(simulation);
  advanceUntil(simulation, () => worker.gatherState === 'hacia_deposito');
  const carried = structuredClone(worker.cargo);
  const treasury = simulation.state.teams.player.recursos.madera;
  const replacement = structuredClone(deposit);
  replacement.id = 99001;
  replacement.x = -55;
  replacement.z = 34;
  replacement.orders = [];
  replacement.productionQueue = [];
  simulation.state.entities.push(replacement);
  deposit.alive = false;

  simulation.setPaused(true);
  simulation.advance(5000);
  assert.deepEqual(worker.cargo, carried);
  assert.equal(simulation.state.teams.player.recursos.madera, treasury);
  simulation.setPaused(false);

  advanceUntil(simulation, () => worker.orders[0].depositId === replacement.id);
  assert.equal(worker.orders[0].depositId, replacement.id);
  advanceUntil(simulation, () => simulation.state.teams.player.recursos.madera > treasury);
  assert.equal(simulation.state.teams.player.recursos.madera, treasury + carried.amount);
});

test('save/load continúa exactamente a mitad del acarreo y normaliza partidas viejas', () => {
  const original = createSimulation({ seed: 1814, ai: false });
  const { worker } = configureGatherCycle(original);
  advanceUntil(original, () => worker.gatherState === 'hacia_deposito');
  original.advance(650);

  const restored = createSimulationFromSave(original.serialize());
  assert.deepEqual(restored.getRenderState(), original.getRenderState());
  for (let tick = 0; tick < 240; tick += 1) {
    original.advance(50);
    restored.advance(50);
  }
  assert.deepEqual(restored.getRenderState(), original.getRenderState());

  const legacyPayload = JSON.parse(original.serialize());
  legacyPayload.state.entities.forEach((entity) => {
    delete entity.cargo;
    delete entity.gatherState;
    entity.orders?.forEach((order) => {
      if (order.type === 'gather') {
        delete order.phase;
        delete order.depositId;
      }
    });
  });
  const legacy = createSimulationFromSave(legacyPayload);
  const legacyWorker = legacy.state.entities.find((entity) => entity.type === 'obrero');
  assert.deepEqual(legacyWorker.cargo, { resource: null, amount: 0, capacity: 0 });
  assert.doesNotThrow(() => legacy.advance(1000));
});

test('construcción y producción completan su ciclo', () => {
  const simulation = createSimulation({ ai: false });
  const build = simulation.issueBuild('vivienda', -30, 35);
  assert.equal(build.ok, true);
  const built = advanceSeconds(simulation, 20).entities.find((entity) => entity.id === build.entityId);
  assert.equal(built.complete, true);

  const barracks = simulation.getRenderState().entities.find((entity) => entity.teamId === 'player' && entity.type === 'cuartel');
  assert.equal(simulation.trainUnit(barracks.id, 'fusilero').ok, true);
  const produced = advanceSeconds(simulation, 15);
  assert.equal(produced.entities.filter((entity) => entity.teamId === 'player' && entity.type === 'fusilero').length, 3);
});

test('investigación avanza del Vapor a la Industria', () => {
  const simulation = createSimulation({ ai: false });
  advanceSeconds(simulation, 35);
  const research = simulation.researchNextEra();
  assert.equal(research.ok, true);
  const state = advanceSeconds(simulation, research.duration + 2);
  assert.equal(state.teams.player.era, 1);
  assert.deepEqual(ERAS.map((era) => era.year), [1800, 1900, 2000, 2100]);
});

test('combate elimina objetivos y resuelve victoria', () => {
  const simulation = createSimulation({ ai: false });
  const playerUnits = simulation.state.entities.filter((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  const rivalHQ = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'cuartelGeneral');
  rivalHQ.hp = 1;
  playerUnits.forEach((unit, index) => {
    unit.x = rivalHQ.x - 3 - index;
    unit.z = rivalHQ.z;
  });
  simulation.selectUnits(playerUnits.map((unit) => unit.id));
  assert.equal(simulation.issueAttack(rivalHQ.id), true);
  const finalState = advanceSeconds(simulation, 4);
  assert.equal(finalState.result?.outcome, 'victoria');
  assert.equal(finalState.mode, 'finalizado');
});

test('guardar y cargar conserva una continuación determinista con IA', () => {
  const original = createSimulation({ seed: 2100, ai: true, difficulty: 'dificil' });
  advanceSeconds(original, 44);
  const restored = createSimulationFromSave(original.serialize());
  assert.deepEqual(restored.getRenderState(), original.getRenderState());
  advanceSeconds(original, 36);
  advanceSeconds(restored, 36);
  assert.deepEqual(restored.getRenderState(), original.getRenderState());
});

test('los escenarios tardíos comienzan con economía y fuerzas de su era', () => {
  const atom = createSimulation({ ai: false, startingEra: 2 }).getRenderState();
  assert.equal(atom.teams.player.era, 2);
  assert.ok(atom.entities.some((entity) => entity.teamId === 'player' && entity.type === 'fabrica'));
  assert.ok(atom.entities.some((entity) => entity.teamId === 'player' && entity.type === 'dron'));
  assert.ok(atom.teams.player.recursos.energia > 160);

  const orbital = createSimulation({ ai: false, startingEra: 3 }).getRenderState();
  assert.ok(orbital.entities.some((entity) => entity.teamId === 'player' && entity.type === 'caminante'));
  assert.ok(orbital.entities.some((entity) => entity.teamId === 'player' && entity.type === 'exotraje'));
});

test('cada facción inicia con diez pioneros y margen de población operativo', () => {
  const simulation = createSimulation({ seed: 210034, ai: true, startingEra: 3 });
  for (const teamId of ['player', 'rival']) {
    const workers = simulation.state.entities.filter((entity) => (
      entity.alive && entity.teamId === teamId && entity.type === 'obrero'
    ));
    const team = simulation.state.teams[teamId];
    assert.equal(workers.length, 10);
    assert.ok(team.capacidad - team.poblacion >= 4);
  }
});

test('cada ataque publica metadata determinista de combatientes, arma y daño', () => {
  const simulation = createSimulation({ seed: 1900, ai: false, startingEra: 1 });
  const attacker = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'artilleria');
  const target = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'tanque');
  attacker.x = target.x - 6;
  attacker.z = target.z;

  simulation._attack(attacker, target);

  const effect = simulation.state.effects.at(-1);
  assert.equal(effect.type, 'proyectil');
  assert.equal(effect.attackerId, attacker.id);
  assert.equal(effect.targetId, target.id);
  assert.equal(effect.attackerType, 'artilleria');
  assert.equal(effect.attackerKind, 'unit');
  assert.equal(effect.targetType, 'tanque');
  assert.equal(effect.targetKind, 'unit');
  assert.equal(effect.weaponClass, 'shell');
  assert.equal(effect.damage, 42.24);
  assert.equal(effect.targetHealthRatio, 0.892);
  assert.equal(effect.lethal, false);
  assert.equal(effect.shotSequence, 1);
  assert.deepEqual(effect.from, { x: attacker.x, y: attacker.height, z: attacker.z });
  assert.deepEqual(effect.to, { x: target.x, y: target.height, z: target.z });
});

test('las clases de arma distinguen melee, rifle, shell y energy por unidad y era', () => {
  const cases = [
    { startingEra: 0, attackerType: 'obrero', expected: 'melee' },
    { startingEra: 0, attackerType: 'fusilero', expected: 'rifle' },
    { startingEra: 1, attackerType: 'tanque', expected: 'shell' },
    { startingEra: 3, attackerType: 'exotraje', expected: 'energy' },
  ];

  for (const scenario of cases) {
    const simulation = createSimulation({ ai: false, startingEra: scenario.startingEra });
    const attacker = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === scenario.attackerType);
    const target = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'fusilero');
    attacker.x = target.x - 1;
    attacker.z = target.z;
    simulation._attack(attacker, target);
    assert.equal(simulation.state.effects[0].weaponClass, scenario.expected, scenario.attackerType);
  }
});

test('un impacto letal emite consecuencia de destrucción persistente y enlazada', () => {
  const simulation = createSimulation({ ai: false, startingEra: 3 });
  const attacker = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'caminante');
  const target = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'cuartel');
  attacker.x = target.x - 4;
  attacker.z = target.z;
  target.hp = 1;

  simulation._attack(attacker, target);

  const [shot, destruction] = simulation.state.effects;
  assert.equal(shot.weaponClass, 'energy');
  assert.equal(shot.lethal, true);
  assert.equal(shot.targetHealthRatio, 0);
  assert.equal(destruction.type, 'destruccion');
  assert.equal(destruction.id, 'fx-2');
  assert.equal(destruction.sourceEffectId, shot.id);
  assert.equal(destruction.shotSequence, shot.shotSequence);
  assert.equal(destruction.attackerId, attacker.id);
  assert.equal(destruction.targetId, target.id);
  assert.equal(destruction.targetType, 'cuartel');
  assert.equal(destruction.targetKind, 'building');
  assert.equal(destruction.weaponClass, 'energy');
  assert.equal(destruction.damage, shot.damage);
  assert.equal(destruction.lethal, true);
  assert.equal(destruction.persistent, true);
  assert.ok(destruction.duration >= 10);
  assert.deepEqual(destruction.position, shot.to);
  assert.equal(target.alive, false);

  const event = simulation.state.events.at(-1);
  assert.equal(event.type, 'entidad_destruida');
  assert.equal(event.effectId, destruction.id);
  assert.equal(event.weaponClass, 'energy');
  assert.equal(event.lethal, true);
});

test('save/load preserva metadata activa y continúa la secuencia de disparos', () => {
  const original = createSimulation({ seed: 77, ai: false });
  const originalAttacker = original.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  const originalTarget = original.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'fusilero');
  originalAttacker.x = originalTarget.x - 2;
  originalAttacker.z = originalTarget.z;
  original._attack(originalAttacker, originalTarget);

  const restored = createSimulationFromSave(original.serialize());
  assert.deepEqual(restored.state.effects, original.state.effects);
  assert.equal(restored.state.effects[0].weaponClass, 'rifle');
  assert.equal(restored.state.effects[0].shotSequence, 1);

  originalAttacker.attackCooldown = 0;
  const restoredAttacker = restored.state.entities.find((entity) => entity.id === originalAttacker.id);
  const restoredTarget = restored.state.entities.find((entity) => entity.id === originalTarget.id);
  restoredAttacker.attackCooldown = 0;
  original._attack(originalAttacker, originalTarget);
  restored._attack(restoredAttacker, restoredTarget);

  assert.deepEqual(restored.state.effects, original.state.effects);
  assert.equal(original.state.effects.at(-1).id, 'fx-2');
  assert.equal(original.state.effects.at(-1).shotSequence, 2);

  original._updateEffects(1);
  assert.equal(original.state.effects.length, 0);
  const restoredAfterFxExpired = createSimulationFromSave(original.serialize());
  originalAttacker.attackCooldown = 0;
  const expiredAttacker = restoredAfterFxExpired.state.entities.find((entity) => entity.id === originalAttacker.id);
  const expiredTarget = restoredAfterFxExpired.state.entities.find((entity) => entity.id === originalTarget.id);
  expiredAttacker.attackCooldown = 0;
  original._attack(originalAttacker, originalTarget);
  restoredAfterFxExpired._attack(expiredAttacker, expiredTarget);

  assert.deepEqual(restoredAfterFxExpired.state.effects, original.state.effects);
  assert.equal(original.state.effects[0].id, 'fx-3');
  assert.equal(original.state.effects[0].shotSequence, 3);
});

test('las unidades rodean edificios y recursos sin atravesarlos y conservan el destino', () => {
  for (const blockerKind of ['building', 'resource']) {
    const simulation = createSimulation({ seed: 404, ai: false });
    const { mover, blocker } = configureBlockedRoute(simulation, blockerKind);
    const minimumClearance = mover.radius + blocker.radius + 0.3;
    let maximumDetour = 0;

    for (let tick = 0; tick < 240; tick += 1) {
      simulation.advance(50);
      const distance = Math.hypot(mover.x - blocker.x, mover.z - blocker.z);
      assert.ok(distance >= minimumClearance - 1e-6, `${blockerKind}: penetración en tick ${tick}: ${distance}`);
      maximumDetour = Math.max(maximumDetour, Math.abs(mover.z));
    }

    assert.ok(maximumDetour > blocker.radius, `${blockerKind}: desvío insuficiente: ${maximumDetour}`);
    assert.ok(Math.hypot(mover.x - 14, mover.z) < 0.5, blockerKind);
    assert.equal(mover.orders.length, 0, blockerKind);
  }
});

test('la separación evita que una formación de unidades se solape durante el movimiento', () => {
  const simulation = createSimulation({ seed: 405, ai: false });
  const units = simulation.state.entities.filter((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  for (const unit of units) {
    unit.x = -12;
    unit.z = 10;
    unit.velocity = { x: 0, z: 0 };
    unit.orders = [];
  }
  simulation.selectUnits(units.map((unit) => unit.id));
  simulation.issueMove(12, 10);
  const minimumSeparation = units[0].radius + units[1].radius + 0.06;

  for (let tick = 0; tick < 180; tick += 1) {
    simulation.advance(50);
    const distance = Math.hypot(units[0].x - units[1].x, units[0].z - units[1].z);
    assert.ok(distance >= minimumSeparation - 1e-6, `solapamiento en tick ${tick}: ${distance}`);
  }

  assert.equal(units.every((unit) => unit.orders.length === 0), true);
});

test('save/load continúa exactamente una ruta mientras la unidad rodea un obstáculo', () => {
  const original = createSimulation({ seed: 406, ai: false });
  const { mover } = configureBlockedRoute(original);
  for (let tick = 0; tick < 80; tick += 1) original.advance(50);
  assert.ok(Math.abs(mover.z) > 0.5, 'la partida debe guardarse durante el rodeo');

  const restored = createSimulationFromSave(original.serialize());
  assert.deepEqual(restored.getRenderState(), original.getRenderState());
  for (let tick = 0; tick < 160; tick += 1) {
    original.advance(50);
    restored.advance(50);
  }

  assert.deepEqual(restored.getRenderState(), original.getRenderState());
});

test('las tecnologías exigen prerequisitos, consumen recursos y alteran estadísticas reales', () => {
  const simulation = createSimulation({ seed: 500, ai: false });
  const university = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'universidad');
  const rifleman = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  const baseVision = rifleman.vision;
  simulation.state.teams.player.recursos.conocimiento = 1000;

  const locked = simulation.researchTechnology(university.id, 'telegrafo');
  assert.equal(locked.ok, false);
  assert.equal(locked.code, 'PRERREQUISITOS_PENDIENTES');

  const steam = simulation.researchTechnology(university.id, 'maquina-de-vapor');
  assert.equal(steam.ok, true);
  advanceSeconds(simulation, steam.duration + 1);
  assert.ok(simulation.state.teams.player.technologies.researched.includes('maquina-de-vapor'));

  const telegraph = simulation.researchTechnology(university.id, 'telegrafo');
  assert.equal(telegraph.ok, true);
  advanceSeconds(simulation, telegraph.duration + 1);
  assert.ok(simulation.state.teams.player.technologies.researched.includes('telegrafo'));
  assert.ok(rifleman.vision > baseVision);
  assert.equal(simulation.getRenderState().teams.player.technologies.active, null);
});

test('una investigación activa continúa de forma idéntica después de guardar y cargar', () => {
  const original = createSimulation({ seed: 501, ai: false });
  const university = original.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'universidad');
  const started = original.researchTechnology(university.id, 'maquina-de-vapor');
  assert.equal(started.ok, true);
  advanceSeconds(original, 11);

  const restored = createSimulationFromSave(original.serialize());
  assert.deepEqual(restored.getRenderState(), original.getRenderState());
  advanceSeconds(original, started.duration);
  advanceSeconds(restored, started.duration);
  assert.deepEqual(restored.getRenderState(), original.getRenderState());
  assert.ok(restored.state.teams.player.technologies.researched.includes('maquina-de-vapor'));
});

test('los escenarios tardíos heredan el canon tecnológico previo sin completar la banda actual', () => {
  const simulation = createSimulation({ ai: false, startingEra: 2 });
  const researched = simulation.state.teams.player.technologies.researched;
  assert.ok(researched.includes('blindados'));
  assert.ok(researched.includes('ferrocarril'));
  assert.equal(researched.includes('redes-digitales'), false);
  const tank = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'tanque');
  assert.ok(tank.speed > 4.5);
});

test('aniquilación resuelve derrota y destrucción simultánea resuelve empate', () => {
  const defeat = createSimulation({ ai: false });
  defeat.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'cuartelGeneral').alive = false;
  defeat.advance(50);
  assert.equal(defeat.getRenderState().result.outcome, 'derrota');

  const draw = createSimulation({ ai: false });
  draw.state.entities
    .filter((entity) => entity.type === 'cuartelGeneral')
    .forEach((entity) => { entity.alive = false; });
  draw.advance(50);
  assert.equal(draw.getRenderState().result.outcome, 'empate');
});

test('dominación territorial y supremacía por tiempo producen finales verificables', () => {
  const domination = createSimulation({ ai: false });
  domination.state.controlPoints.forEach((point) => { point.ownerId = 'player'; });
  domination.state.teams.player.dominationTime = SIMULATION_CONSTANTS.dominationSeconds - 0.05;
  domination.advance(100);
  assert.equal(domination.getRenderState().result.outcome, 'victoria');
  assert.match(domination.getRenderState().result.reason, /dominación/i);

  const timed = createSimulation({ ai: false });
  timed.state.time = SIMULATION_CONSTANTS.maxMatchSeconds - 0.05;
  timed.state.teams.player.score += 1000;
  timed.advance(100);
  assert.equal(timed.getRenderState().result.outcome, 'victoria');
  assert.match(timed.getRenderState().result.reason, /supremacía/i);
});

test('patrulla alterna entre dos puntos mediante command routing sin consumir la orden', () => {
  const simulation = createSimulation({ seed: 601, ai: false });
  const unit = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  unit.x = -12;
  unit.z = 10;
  unit.velocity = { x: 0, z: 0 };
  simulation.selectUnits(unit.id);

  assert.equal(simulation.command({ type: 'patrol', x: 12, z: 10 }), 1);
  let reachedDestination = false;
  let returnedToOrigin = false;
  for (let tick = 0; tick < 360; tick += 1) {
    simulation.advance(50);
    reachedDestination ||= unit.x > 11;
    returnedToOrigin ||= reachedDestination && unit.x < -11;
  }

  assert.equal(reachedDestination, true);
  assert.equal(returnedToOrigin, true);
  assert.equal(unit.orders.length, 1);
  assert.equal(unit.orders[0].type, 'patrol');
});

test('patrulla detecta un enemigo, lo elimina y reanuda el tramo interrumpido', () => {
  const simulation = createSimulation({ seed: 602, ai: false });
  const patrol = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  const enemy = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'fusilero');
  patrol.x = -6;
  patrol.z = 8;
  patrol.velocity = { x: 0, z: 0 };
  enemy.x = -2;
  enemy.z = 8;
  enemy.hp = 1;
  simulation.selectUnits(patrol.id);
  simulation.issuePatrol(10, 8);

  simulation.advance(1000);
  assert.equal(enemy.alive, false);
  assert.equal(patrol.orders.length, 1);
  assert.equal(patrol.orders[0].type, 'patrol');
  const resumedAt = patrol.x;
  simulation.advance(3000);
  assert.ok(patrol.x > resumedAt + 2);
  assert.equal(patrol.orders[0].type, 'patrol');
});

test('reparación exige pioneros y edificio aliado, consume acero y limita la vida máxima', () => {
  const simulation = createSimulation({ seed: 603, ai: false });
  const worker = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'obrero');
  const rifleman = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  const building = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'vivienda');
  const enemyBuilding = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'vivienda');
  building.hp = building.maxHp - 30;

  simulation.selectUnits(rifleman.id);
  assert.equal(simulation.issueRepair(building.id).code, 'SIN_REPARADOR');
  simulation.selectUnits(worker.id);
  assert.equal(simulation.issueRepair(enemyBuilding.id).code, 'EDIFICIO_INVALIDO');

  worker.x = building.x + building.radius + worker.radius + 8;
  worker.z = building.z;
  worker.velocity = { x: 0, z: 0 };
  const initialSteel = simulation.state.teams.player.recursos.acero;
  assert.equal(simulation.command({ type: 'repair', targetId: building.id }).ok, true);
  const initialDistance = Math.abs(worker.x - building.x);
  simulation.advance(500);
  assert.ok(Math.abs(worker.x - building.x) < initialDistance);
  assert.equal(building.hp, building.maxHp - 30);
  assert.equal(simulation.state.teams.player.recursos.acero, initialSteel);

  worker.x = building.x + building.radius + worker.radius + 0.5;
  worker.z = building.z;
  worker.velocity = { x: 0, z: 0 };
  simulation.advance(500);
  assert.ok(building.hp > building.maxHp - 30 && building.hp < building.maxHp);
  assert.ok(simulation.state.teams.player.recursos.acero < initialSteel);
  assert.equal(worker.action, 'reparando');

  simulation.advance(5000);
  assert.equal(building.hp, building.maxHp);
  assert.ok(simulation.state.teams.player.recursos.acero > 0);
  assert.equal(worker.orders.length, 0);
});

test('reparación se detiene sin acero y no crea vida ni recursos', () => {
  const simulation = createSimulation({ seed: 604, ai: false });
  const worker = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'obrero');
  const building = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'vivienda');
  building.hp = 100;
  worker.x = building.x + building.radius + worker.radius + 0.5;
  worker.z = building.z;
  simulation.state.teams.player.recursos.acero = 1;
  simulation.selectUnits(worker.id);
  assert.equal(simulation.issueRepair(building.id).ok, true);

  simulation.advance(5000);
  assert.equal(simulation.state.teams.player.recursos.acero, 0);
  assert.ok(building.hp > 100 && building.hp < building.maxHp);
  const exhaustedHp = building.hp;
  simulation.advance(2000);
  assert.equal(building.hp, exhaustedHp);
  assert.equal(worker.orders[0].type, 'repair');
});

test('save/load conserva patrulla interrumpida y reparación con igualdad exacta', () => {
  const original = createSimulation({ seed: 605, ai: false });
  const patrol = original.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  const enemy = original.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'fusilero');
  const worker = original.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'obrero');
  const building = original.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'vivienda');
  patrol.x = -8;
  patrol.z = 12;
  enemy.x = -2;
  enemy.z = 12;
  enemy.hp = 60;
  worker.x = building.x + building.radius + worker.radius + 0.5;
  worker.z = building.z;
  building.hp = building.maxHp - 80;
  original.selectUnits(patrol.id);
  original.issuePatrol(10, 12);
  original.selectUnits(worker.id);
  original.issueRepair(building.id);
  original.advance(750);

  const restored = createSimulationFromSave(original.serialize());
  assert.deepEqual(restored.getRenderState(), original.getRenderState());
  for (let tick = 0; tick < 200; tick += 1) {
    original.advance(50);
    restored.advance(50);
  }

  assert.deepEqual(restored.getRenderState(), original.getRenderState());
  assert.equal(restored.state.entities.find((entity) => entity.id === building.id).hp, building.maxHp);
  assert.equal(restored.state.entities.find((entity) => entity.id === patrol.id).orders[0].type, 'patrol');
});

test('formaciones de línea, columna y cuña asignan offsets orientados y deterministas', () => {
  const simulation = createSimulation({ seed: 606, ai: false });
  const units = simulation.state.entities
    .filter((entity) => entity.teamId === 'player' && entity.kind === 'unit')
    .slice(0, 5);
  units.forEach((unit, index) => {
    unit.x = -10;
    unit.z = (index - 2) * 1.5;
    unit.orders = [];
    unit.velocity = { x: 0, z: 0 };
  });
  simulation.selectUnits(units.map((unit) => unit.id).reverse());

  assert.equal(simulation.getRenderState().teams.player.formation, 'linea');
  assert.equal(simulation.command({ type: 'formation', formation: 'line' }).ok, true);
  assert.equal(simulation.issueMove(20, 0), 5);
  assert.deepEqual(units.map((unit) => [unit.orders[0].x, unit.orders[0].z]), [
    [20, -4.8], [20, -2.4], [20, 0], [20, 2.4], [20, 4.8],
  ]);
  assert.deepEqual(units.map((unit) => unit.orders[0].formationSlot), [0, 1, 2, 3, 4]);
  assert.ok(units.every((unit) => unit.orders[0].formation === 'linea'));

  assert.equal(simulation.setFormation('columna'), 'columna');
  simulation.issueMove(20, 0);
  assert.deepEqual(units.map((unit) => [unit.orders[0].x, unit.orders[0].z]), [
    [24.8, 0], [22.4, 0], [20, 0], [17.6, 0], [15.2, 0],
  ]);

  assert.equal(simulation.command({ type: 'setFormation', formation: 'wedge' }).formation, 'cuna');
  simulation.issueMove(20, 0);
  assert.deepEqual(units.map((unit) => [unit.orders[0].x, unit.orders[0].z]), [
    [22.88, 0], [20.48, -1.2], [20.48, 1.2], [18.08, -2.4], [18.08, 2.4],
  ]);
  assert.equal(simulation.setFormation('circulo').code, 'FORMACION_INVALIDA');
});

test('move, attack-move y patrulla capturan la formación elegida al encolar con Shift', () => {
  const simulation = createSimulation({ seed: 607, ai: false });
  const units = simulation.state.entities
    .filter((entity) => entity.teamId === 'player' && entity.kind === 'unit')
    .slice(0, 4);
  simulation.selectUnits(units.map((unit) => unit.id));

  simulation.setFormation('linea');
  simulation.command({ type: 'move', x: -20, z: 5 });
  simulation.setFormation('cuna');
  simulation.command({ type: 'attackMove', x: 15, z: -5, queued: true });
  simulation.command({ type: 'patrol', x: 25, z: 10, queued: true });

  for (const unit of units) {
    assert.equal(unit.orders.length, 3);
    assert.deepEqual(unit.orders.map((order) => order.type), ['move', 'attackMove', 'patrol']);
    assert.deepEqual(unit.orders.map((order) => order.formation), ['linea', 'cuna', 'cuna']);
    assert.equal(unit.orders[2].points.length, 2);
  }
  assert.equal(new Set(units.map((unit) => `${unit.orders[1].x}:${unit.orders[1].z}`)).size, units.length);
  assert.equal(new Set(units.map((unit) => `${unit.orders[2].points[1].x}:${unit.orders[2].points[1].z}`)).size, units.length);
});

test('una cuña llega a slots separados y continúa exactamente después de save/load', () => {
  const original = createSimulation({ seed: 608, ai: false });
  const units = original.state.entities
    .filter((entity) => entity.teamId === 'player' && entity.kind === 'unit')
    .slice(0, 5);
  const selectedIds = new Set(units.map((unit) => unit.id));
  original.state.entities.forEach((entity) => {
    if (entity.kind === 'unit' && !selectedIds.has(entity.id)) entity.alive = false;
    if (entity.kind === 'building') {
      entity.x = entity.teamId === 'player' ? -72 : 72;
      entity.z = entity.teamId === 'player' ? 52 : -52;
    }
  });
  original.state.resourceNodes.forEach((node) => { node.amount = 0; });
  units.forEach((unit, index) => {
    unit.x = -25;
    unit.z = (index - 2) * 1.5;
    unit.orders = [];
    unit.velocity = { x: 0, z: 0 };
  });
  original.selectUnits([...selectedIds]);
  original.setFormation('cuna');
  original.issueMove(25, 0);
  const slots = new Map(units.map((unit) => [unit.id, { x: unit.orders[0].x, z: unit.orders[0].z }]));
  original.advance(3200);

  const restored = createSimulationFromSave(original.serialize());
  assert.equal(restored.state.teams.player.formation, 'cuna');
  for (let tick = 0; tick < 240; tick += 1) {
    original.advance(50);
    restored.advance(50);
  }
  assert.deepEqual(restored.getRenderState(), original.getRenderState());

  for (const unit of units) {
    const slot = slots.get(unit.id);
    assert.ok(Math.hypot(unit.x - slot.x, unit.z - slot.z) < 0.4, unit.id);
    assert.equal(unit.orders.length, 0);
  }
  for (let first = 0; first < units.length; first += 1) {
    for (let second = first + 1; second < units.length; second += 1) {
      assert.ok(
        Math.hypot(units[first].x - units[second].x, units[first].z - units[second].z)
          >= units[first].radius + units[second].radius,
      );
    }
  }

  const legacyPayload = JSON.parse(original.serialize());
  delete legacyPayload.state.teams.player.formation;
  const legacy = createSimulationFromSave(legacyPayload);
  assert.equal(legacy.state.teams.player.formation, 'linea');
});

test('la niebla oculta enemigos y recursos al render local sin recortar el estado interno', () => {
  const simulation = createSimulation({ seed: 701, ai: false });
  const scout = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  const enemy = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'fusilero');
  const remoteResource = simulation.state.resourceNodes.find((node) => node.id === 'recurso-6');

  let render = simulation.getRenderState();
  assert.equal(render.entities.some((entity) => entity.id === enemy.id), false);
  assert.equal(render.resourceNodes.some((node) => node.id === remoteResource.id), false);
  assert.equal(simulation.getState().entities.some((entity) => entity.id === enemy.id), true);
  assert.equal(simulation.getState().resourceNodes.some((node) => node.id === remoteResource.id), true);

  scout.x = enemy.x;
  scout.z = enemy.z;
  simulation.advance(50);
  render = simulation.getRenderState();
  assert.equal(render.entities.some((entity) => entity.id === enemy.id), true);

  scout.x = remoteResource.x;
  scout.z = remoteResource.z;
  simulation.advance(50);
  render = simulation.getRenderState();
  assert.equal(render.resourceNodes.some((node) => node.id === remoteResource.id), true);
});

test('la exploración por equipo persiste aunque cese la visión actual y usa un resumen RLE compacto', () => {
  const simulation = createSimulation({ seed: 702, ai: false });
  const scout = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  const remoteResource = simulation.state.resourceNodes.find((node) => node.id === 'recurso-6');

  scout.x = remoteResource.x;
  scout.z = remoteResource.z;
  simulation.advance(50);
  const revealed = simulation.getRenderState().fogOfWar;
  assert.equal(revealed.encoding, 'rle-index-ranges');
  assert.equal(revealed.teamId, 'player');
  assert.equal(revealed.exploredRanges.length % 2, 0);
  assert.equal(revealed.visibleRanges.length % 2, 0);
  assert.ok(revealed.exploredCount >= revealed.visibleCount);

  scout.x = -55;
  scout.z = 34;
  simulation.advance(50);
  const hiddenAgain = simulation.getRenderState();
  assert.equal(hiddenAgain.resourceNodes.some((node) => node.id === remoteResource.id), false);
  assert.ok(hiddenAgain.fogOfWar.exploredCount >= revealed.exploredCount);
  assert.ok(hiddenAgain.fogOfWar.visibleCount < hiddenAgain.fogOfWar.exploredCount);
});

test('save/load preserva la grilla explorada y continúa la visibilidad de forma determinista', () => {
  const original = createSimulation({ seed: 703, ai: true });
  const scout = original.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'caballeria')
    || original.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  scout.x = 10;
  scout.z = -12;
  original.advance(50);
  scout.x = -48;
  scout.z = 30;
  original.advance(50);

  const restored = createSimulationFromSave(original.serialize());
  assert.deepEqual(restored.state.fogOfWar, original.state.fogOfWar);
  assert.deepEqual(restored.getRenderState().fogOfWar, original.getRenderState().fogOfWar);
  advanceSeconds(original, 5);
  advanceSeconds(restored, 5);
  assert.deepEqual(restored.getRenderState(), original.getRenderState());
});

test('la IA explora de forma determinista una celda que su niebla aún no conoce', () => {
  const first = createSimulation({ seed: 801, ai: true });
  const second = createSimulation({ seed: 801, ai: true });
  const initiallyExplored = new Set(first.state.fogOfWar.exploredByTeam.rival);

  assert.equal(first._aiExploreUnseen(), true);
  assert.equal(second._aiExploreUnseen(), true);

  const exploration = first.state.ai.exploration;
  const scout = first.state.entities.find((entity) => entity.id === exploration.scoutId);
  assert.equal(initiallyExplored.has(exploration.cell), false);
  assert.equal(scout.teamId, 'rival');
  assert.notEqual(scout.type, 'obrero');
  assert.deepEqual(scout.orders, [{ type: 'attackMove', x: exploration.x, z: exploration.z }]);
  assert.deepEqual(first.state.ai, second.state.ai);
});

test('la IA usa visión disponible para defender su base de una amenaza cercana', () => {
  const simulation = createSimulation({ seed: 802, ai: true });
  const rivalHQ = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'cuartelGeneral');
  const intruder = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  intruder.x = rivalHQ.x - 10;
  intruder.z = rivalHQ.z;
  simulation._updateFogOfWar();

  assert.equal(simulation._aiDefendBase(), true);
  const defenders = simulation.state.entities.filter((entity) => (
    entity.teamId === 'rival' && entity.kind === 'unit' && entity.type !== 'obrero'
  ));
  assert.ok(defenders.length > 0);
  assert.ok(defenders.every((unit) => unit.orders[0]?.type === 'attack' && unit.orders[0]?.targetId === intruder.id));
  assert.ok(simulation.state.entities
    .filter((entity) => entity.teamId === 'rival' && entity.type === 'obrero')
    .every((worker) => worker.orders[0]?.type !== 'attack'));
});

test('la IA produce la composición de su era y no ataca antes de completarla', () => {
  const simulation = createSimulation({ seed: 803, ai: true, startingEra: 1 });
  const rival = simulation.state.teams.rival;
  Object.keys(rival.recursos).forEach((resource) => { rival.recursos[resource] = 5000; });
  const barracks = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'cuartel');
  const playerHQ = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'cuartelGeneral');
  const rivalHQ = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'cuartelGeneral');
  playerHQ.x = rivalHQ.x - 12;
  playerHQ.z = rivalHQ.z;
  simulation._updateFogOfWar();
  simulation._aiObserveEnemies();

  assert.equal(simulation._aiLaunchAttack(), false);
  assert.equal(simulation.state.entities
    .filter((entity) => entity.teamId === 'rival' && entity.kind === 'unit' && entity.type !== 'obrero')
    .every((unit) => unit.orders[0]?.type !== 'attack'), true);

  simulation._aiEconomyAndProduction();
  assert.equal(barracks.productionQueue[0]?.unitType, 'fusilero');

  const extraRifleman = structuredClone(simulation.state.entities.find((entity) => (
    entity.teamId === 'rival' && entity.type === 'fusilero'
  )));
  extraRifleman.id = 9001;
  extraRifleman.orders = [];
  simulation.state.entities.push(extraRifleman);

  assert.equal(simulation._aiLaunchAttack(), true);
  assert.ok(simulation.state.entities
    .filter((entity) => entity.teamId === 'rival' && entity.kind === 'unit' && entity.type !== 'obrero')
    .every((unit) => unit.orders[0]?.type === 'attack' && unit.orders[0]?.targetId === playerHQ.id));
});

test('cada era repone de forma determinista la unidad faltante de su perfil', () => {
  const scenarios = [
    { era: 0, missing: 'fusilero', building: 'cuartel', expected: 'fusilero' },
    { era: 1, missing: 'fusilero', building: 'cuartel', expected: 'fusilero' },
    { era: 2, missing: 'dron', building: 'fabrica', expected: 'dron' },
    { era: 3, missing: 'exotraje', building: 'cuartel', expected: 'exotraje' },
  ];

  for (const scenario of scenarios) {
    const simulation = createSimulation({ seed: 810 + scenario.era, ai: true, startingEra: scenario.era });
    const rival = simulation.state.teams.rival;
    Object.keys(rival.recursos).forEach((resource) => { rival.recursos[resource] = 5000; });
    const missingUnit = simulation.state.entities.find((entity) => (
      entity.teamId === 'rival' && entity.type === scenario.missing
    ));
    if (scenario.era >= 2) missingUnit.alive = false;
    const building = simulation.state.entities.find((entity) => (
      entity.teamId === 'rival' && entity.type === scenario.building
    ));

    simulation._aiQueueEraComposition([building]);
    assert.equal(building.productionQueue[0]?.unitType, scenario.expected, `era ${scenario.era}`);
  }
});

test('save/load conserva evidencia y exploración de IA con continuación exacta', () => {
  const original = createSimulation({ seed: 804, ai: true, startingEra: 2 });
  original._aiExploreUnseen();
  const rivalScout = original.state.entities.find((entity) => entity.id === original.state.ai.exploration.scoutId);
  const observedEnemy = original.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  observedEnemy.x = rivalScout.x - 3;
  observedEnemy.z = rivalScout.z;
  original._updateFogOfWar();
  original._aiObserveEnemies();

  const restored = createSimulationFromSave(original.serialize());
  assert.deepEqual(restored.state.ai, original.state.ai);
  advanceSeconds(original, 8);
  advanceSeconds(restored, 8);
  assert.deepEqual(restored.getRenderState(), original.getRenderState());
});

test('un save anterior sin memoria táctica de IA sigue siendo compatible', () => {
  const legacyPayload = JSON.parse(createSimulation({ seed: 805, ai: true }).serialize());
  delete legacyPayload.state.ai.knownEnemies;
  delete legacyPayload.state.ai.exploration;

  const restored = createSimulationFromSave(legacyPayload);
  assert.deepEqual(restored.state.ai.knownEnemies, []);
  assert.equal(restored.state.ai.exploration, null);
  assert.doesNotThrow(() => restored.advance(1000));
});

function configureStanceDuel(simulation, distance = 14) {
  const attacker = simulation.state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'fusilero');
  const target = simulation.state.entities.find((entity) => entity.teamId === 'rival' && entity.type === 'fusilero');
  simulation.state.entities.forEach((entity) => {
    if (entity.kind === 'unit' && entity.id !== attacker.id && entity.id !== target.id) entity.alive = false;
  });
  simulation.state.resourceNodes.forEach((node) => { node.amount = 0; });
  attacker.x = 0;
  attacker.z = 0;
  attacker.orders = [];
  attacker.velocity = { x: 0, z: 0 };
  target.x = distance;
  target.z = 0;
  target.orders = [];
  target.velocity = { x: 0, z: 0 };
  target.stance = 'mantener_posicion';
  target.stanceAnchor = { x: target.x, z: target.z };
  simulation.selectUnits(attacker.id);
  return { attacker, target };
}

test('la postura agresiva adquiere en visión, persigue y reanuda la orden interrumpida', () => {
  const simulation = createSimulation({ seed: 901, ai: false });
  const { attacker, target } = configureStanceDuel(simulation, 14);

  assert.deepEqual(simulation.command({ type: 'stance', stance: 'agresiva' }), {
    ok: true,
    stance: 'agresiva',
    units: 1,
  });
  simulation.issueMove(-18, 0);
  simulation.advance(50);

  assert.equal(attacker.orders[0].type, 'attack');
  assert.equal(attacker.orders[0].targetId, target.id);
  assert.equal(attacker.orders[0].automatic, true);
  assert.equal(attacker.orders[0].resume.type, 'move');
  assert.equal(attacker.stance, 'agresiva');
  const startX = attacker.x;
  simulation.advance(1000);
  assert.ok(attacker.x > startX, 'la unidad agresiva debe perseguir al objetivo');

  target.alive = false;
  simulation.advance(50);
  assert.equal(attacker.orders[0].type, 'move');
  assert.equal(attacker.orders[0].x, -18);
});

test('la postura defensiva limita la persecución desde el ancla y después retoma la orden', () => {
  const simulation = createSimulation({ seed: 902, ai: false });
  const { attacker, target } = configureStanceDuel(simulation, 9.7);
  simulation.command({ type: 'setStance', stance: 'defensiva' });
  simulation.issueMove(-18, 0);
  simulation.advance(50);

  assert.equal(attacker.orders[0].type, 'attack');
  assert.deepEqual(attacker.orders[0].anchor, { x: 0, z: 0 });
  assert.ok(attacker.x > 0, 'la postura defensiva debe perseguir dentro de su radio');
  target.x = 15;
  simulation.advance(50);

  assert.equal(attacker.orders[0].type, 'move');
  assert.equal(attacker.orders[0].x, -18);
  assert.ok(Math.hypot(attacker.x, attacker.z) <= SIMULATION_CONSTANTS.defensivePursuitRadius + 0.1);
});

test('mantener posición dispara en alcance pero nunca persigue', () => {
  const simulation = createSimulation({ seed: 903, ai: false });
  const { attacker, target } = configureStanceDuel(simulation, 14);
  simulation.command({ type: 'stance', stance: 'mantener_posicion' });
  const origin = { x: attacker.x, z: attacker.z };

  simulation.advance(2000);
  assert.deepEqual({ x: attacker.x, z: attacker.z }, origin);
  assert.equal(target.hp, target.maxHp);
  assert.equal(attacker.orders.length, 0);

  simulation.issueAttack(target.id);
  simulation.advance(1000);
  assert.deepEqual({ x: attacker.x, z: attacker.z }, origin);
  assert.equal(attacker.orders.length, 0);

  target.x = 7;
  simulation.advance(2000);
  assert.deepEqual({ x: attacker.x, z: attacker.z }, origin);
  assert.ok(target.hp < target.maxHp);
});

test('save/load conserva posturas y anclas, y los saves legacy reciben valores seguros', () => {
  const original = createSimulation({ seed: 904, ai: false });
  const { attacker } = configureStanceDuel(original, 9.7);
  original.command({ type: 'stance', stance: 'defensiva' });
  original.issueMove(-18, 0);
  original.advance(50);
  const restored = createSimulationFromSave(original.serialize());
  const restoredAttacker = restored.state.entities.find((entity) => entity.id === attacker.id);
  assert.equal(restoredAttacker.stance, 'defensiva');
  assert.deepEqual(restoredAttacker.stanceAnchor, attacker.stanceAnchor);
  assert.equal(restored.getRenderState().entities.find((entity) => entity.id === attacker.id).stance, 'defensiva');
  for (let tick = 0; tick < 80; tick += 1) {
    original.advance(50);
    restored.advance(50);
  }
  assert.deepEqual(restored.getRenderState(), original.getRenderState());

  const legacyPayload = JSON.parse(original.serialize());
  legacyPayload.state.entities.forEach((entity) => {
    delete entity.stance;
    delete entity.stanceAnchor;
  });
  const legacy = createSimulationFromSave(legacyPayload);
  const legacyUnits = legacy.state.entities.filter((entity) => entity.kind === 'unit');
  assert.ok(legacyUnits.every((unit) => unit.stance === 'agresiva'));
  assert.ok(legacyUnits.every((unit) => unit.stanceAnchor.x === unit.x && unit.stanceAnchor.z === unit.z));
  assert.doesNotThrow(() => legacy.advance(1000));
});
