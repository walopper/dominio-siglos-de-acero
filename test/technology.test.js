import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TECHNOLOGIES,
  TECHNOLOGY_ERAS,
  accumulateTechnologyEffects,
  availableTechnologies,
  technologyAvailability,
  validateTechnologyGraph,
} from '../src/technology.js';

test('el canon usa cuatro bandas históricas consecutivas de 1800 a 2199', () => {
  assert.deepEqual(TECHNOLOGY_ERAS.map(({ desde, hasta }) => [desde, hasta]), [
    [1800, 1899],
    [1900, 1999],
    [2000, 2099],
    [2100, 2199],
  ]);
  assert.deepEqual(TECHNOLOGY_ERAS.map(({ nombre }) => nombre), [
    'Era del Vapor',
    'Era de la Industria Eléctrica',
    'Era de la Red',
    'Era Orbital',
  ]);
  for (const era of TECHNOLOGY_ERAS) {
    assert.ok(TECHNOLOGIES.filter((technology) => technology.era === era.id).length >= 4);
  }
});

test('las tecnologías corrigen los anacronismos y conservan hitos reconocibles', () => {
  const byId = Object.fromEntries(TECHNOLOGIES.map((technology) => [technology.id, technology]));
  assert.equal(byId.ferrocarril.anio, 1825);
  assert.equal(byId.telegrafo.anio, 1844);
  assert.equal(byId.aviacion.anio, 1903);
  assert.equal(byId.blindados.anio, 1916);
  assert.equal(byId['blindaje-reactivo'].era, 2);
  for (const id of ['redes-digitales', 'gps', 'drones']) assert.equal(byId[id].era, 2);
  for (const id of ['fusion-comercial', 'isru-lunar', 'autonomia-robotica', 'energia-superficial-lunar']) {
    assert.equal(byId[id].era, 3);
  }
  assert.equal(TECHNOLOGIES.some(({ id, era }) => id === 'fusion-comercial' && era < 3), false);
});

test('cada tecnología declara prerequisitos, coste, tiempo, edificio y efectos', () => {
  const resourceKeys = new Set(['alimentos', 'madera', 'acero', 'energia', 'conocimiento']);
  for (const technology of TECHNOLOGIES) {
    assert.match(technology.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(technology.nombre.length >= 4);
    assert.ok(technology.descripcion.length >= 30);
    assert.ok(Array.isArray(technology.prerequisitos));
    assert.ok(Object.keys(technology.costo).length > 0);
    for (const [resource, amount] of Object.entries(technology.costo)) {
      assert.equal(resourceKeys.has(resource), true);
      assert.ok(Number.isFinite(amount) && amount > 0);
    }
    assert.ok(Number.isFinite(technology.tiempo) && technology.tiempo > 0);
    assert.match(technology.edificio, /^[a-z][a-zA-Z]+$/);
    assert.equal(typeof technology.efectos, 'object');
    assert.ok(Object.keys(technology.efectos).length > 0);
  }
  assert.equal(Object.isFrozen(TECHNOLOGIES), true);
  assert.equal(Object.isFrozen(TECHNOLOGIES[0].efectos), true);
});

test('el grafo canónico es válido y la validación detecta referencias y ciclos', () => {
  assert.deepEqual(validateTechnologyGraph(), { valid: true, errors: [] });

  const base = {
    nombre: 'Tecnología de prueba', descripcion: 'Descripción suficientemente extensa para validar el nodo.',
    era: 0, anio: 1800, costo: { conocimiento: 10 }, tiempo: 5,
    edificio: 'universidad', efectos: { economia: { produccion: 0.1 } },
  };
  const invalid = [
    { ...base, id: 'a', prerequisitos: ['b'] },
    { ...base, id: 'b', prerequisitos: ['a'] },
    { ...base, id: 'c', prerequisitos: ['inexistente'] },
  ];
  const result = validateTechnologyGraph(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('inexistente')));
  assert.ok(result.errors.some((error) => error.toLowerCase().includes('ciclo')));
});

test('la disponibilidad explica era, edificio, prerequisitos y repetición', () => {
  assert.deepEqual(technologyAvailability('blindados', {
    era: 0,
    researched: [],
    buildings: [],
  }), {
    id: 'blindados',
    available: false,
    alreadyResearched: false,
    eraLocked: true,
    requiredBuilding: 'fabrica',
    buildingAvailable: false,
    missingPrerequisites: ['motor-combustion', 'produccion-en-serie'],
  });

  assert.equal(technologyAvailability('blindados', {
    era: 1,
    researched: ['motor-combustion', 'produccion-en-serie'],
    buildings: ['fabrica'],
  }).available, true);

  assert.equal(technologyAvailability('blindados', {
    era: 1,
    researched: ['motor-combustion', 'produccion-en-serie', 'blindados'],
    buildings: ['fabrica'],
  }).alreadyResearched, true);
  assert.throws(() => technologyAvailability('desconocida'), /desconocida/);
});

test('el listado de disponibles es determinista y no muta el estado recibido', () => {
  const state = { era: 0, researched: [], buildings: ['universidad'] };
  const before = structuredClone(state);
  assert.deepEqual(availableTechnologies(state).map(({ id }) => id), ['maquina-de-vapor']);
  assert.deepEqual(state, before);

  const progressed = {
    era: 0,
    researched: ['maquina-de-vapor'],
    buildings: ['universidad', 'fabrica'],
  };
  assert.deepEqual(availableTechnologies(progressed).map(({ id }) => id), [
    'ferrocarril',
    'telegrafo',
    'produccion-mecanizada',
  ]);
});

test('la acumulación suma modificadores, une desbloqueos y devuelve una copia', () => {
  const researched = ['maquina-de-vapor', 'produccion-mecanizada', 'red-electrica'];
  const first = accumulateTechnologyEffects(researched);
  assert.equal(first.economia.produccion, 0.22);
  assert.equal(first.economia.recoleccionAcero, 0.1);
  assert.deepEqual(first.desbloqueos.edificios, ['fabrica', 'central']);

  first.economia.produccion = 99;
  first.desbloqueos.edificios.push('alterado');
  const second = accumulateTechnologyEffects(researched);
  assert.equal(second.economia.produccion, 0.22);
  assert.deepEqual(second.desbloqueos.edificios, ['fabrica', 'central']);
  assert.throws(() => accumulateTechnologyEffects(['desconocida']), /desconocida/);
});
