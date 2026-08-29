import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN,
  CAMPAIGN_SCHEMA_VERSION,
  DIPLOMACY_ACTIONS,
  CampaignDirector,
  StrategicDiplomacy,
  createCampaign,
  createDiplomacy,
  createMemoryStorage,
  deserializeCampaignProgress,
  deserializeDiplomacyState,
  serializeCampaignProgress,
  serializeDiplomacyState,
} from '../src/campaign.js';

function completeObjectives(campaign, scenario, { secondary = true } = {}) {
  for (const objective of scenario.objetivosPrimarios) {
    assert.equal(campaign.updateObjective(objective.id, objective.objetivo, { mode: 'set' }).ok, true);
  }
  if (secondary) {
    for (const objective of scenario.objetivosSecundarios) {
      assert.equal(campaign.updateObjective(objective.id, objective.objetivo, { mode: 'set' }).ok, true);
    }
  }
}

function win(campaign, scenario, options = {}) {
  assert.equal(campaign.startScenario(scenario.id).ok, true);
  completeObjectives(campaign, scenario, options);
  return campaign.finishScenario({ victory: true, durationSeconds: 1, casualties: 0, score: 1000 });
}

test('la campaña española cubre cuatro eras encadenadas y equivalentes tecnológicos propios', () => {
  assert.deepEqual(CAMPAIGN.escenarios.map(({ era, anio }) => [era, anio]), [
    ['Vapor', 1800],
    ['Industria', 1900],
    ['Red', 2000],
    ['Orbital', 2100],
  ]);
  assert.deepEqual(CAMPAIGN.escenarios.map((scenario) => scenario.requisito ?? null), [
    null,
    CAMPAIGN.escenarios[0].id,
    CAMPAIGN.escenarios[1].id,
    CAMPAIGN.escenarios[2].id,
  ]);
  for (const scenario of CAMPAIGN.escenarios) {
    assert.ok(scenario.briefing.situacion.length > 80);
    assert.ok(scenario.briefing.inteligencia.length > 80);
    assert.ok(scenario.briefing.orden.length > 50);
    assert.ok(scenario.objetivosPrimarios.length >= 3);
    assert.ok(scenario.objetivosSecundarios.length >= 2);
    assert.ok(scenario.recompensas.base.prestigio > 0);
    assert.ok(scenario.medallas.oro.tiempoMaximo > 0);
  }
  const canon = JSON.stringify(CAMPAIGN).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  for (const concept of ['telegrafo', 'ferrocarril', 'artilleria', 'blindados', 'aviacion', 'red estrategica', 'recursos locales', 'robots cooperativos', 'orbitales']) {
    assert.match(canon, new RegExp(concept));
  }
  assert.equal(Object.isFrozen(CAMPAIGN), true);
  assert.equal(Object.isFrozen(CAMPAIGN.escenarios[0].briefing), true);
});

test('sólo el primer escenario está disponible y cada victoria abre el siguiente', () => {
  const campaign = createCampaign();
  assert.ok(campaign instanceof CampaignDirector);
  assert.deepEqual(campaign.listScenarios().map((scenario) => scenario.estado), [
    'disponible',
    'bloqueado',
    'bloqueado',
    'bloqueado',
  ]);
  assert.deepEqual(campaign.startScenario(CAMPAIGN.escenarios[1].id), {
    ok: false,
    codigo: 'escenario-bloqueado',
    requisito: CAMPAIGN.escenarios[0].id,
  });

  for (const [index, scenario] of CAMPAIGN.escenarios.entries()) {
    const outcome = win(campaign, scenario);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.resultado.medalla, 'oro');
    assert.equal(outcome.siguienteEscenarioId, CAMPAIGN.escenarios[index + 1]?.id ?? null);
    assert.equal(outcome.campaniaCompletada, index === CAMPAIGN.escenarios.length - 1);
  }
  assert.ok(campaign.getState().desbloqueos.includes('victoria-la-forja-del-porvenir'));
  assert.deepEqual(campaign.listScenarios().map((scenario) => scenario.estado), [
    'completado',
    'completado',
    'completado',
    'completado',
  ]);
});

test('los objetivos se limitan a su meta y una victoria exige todos los primarios', () => {
  const campaign = createCampaign();
  const scenario = CAMPAIGN.escenarios[0];
  assert.deepEqual(campaign.updateObjective('carbon'), { ok: false, codigo: 'sin-escenario-activo' });
  campaign.startScenario(scenario.id);
  assert.deepEqual(campaign.updateObjective('inexistente'), { ok: false, codigo: 'objetivo-desconocido' });
  assert.deepEqual(campaign.updateObjective('carbon', Number.NaN), { ok: false, codigo: 'cantidad-invalida' });
  assert.equal(campaign.updateObjective('carbon', 99).valor, 3);
  assert.equal(campaign.updateObjective('carbon', -99).valor, 0);
  assert.equal(campaign.finishScenario({ victory: true }).codigo, 'objetivos-primarios-pendientes');
  assert.equal(campaign.getActiveScenario().objetivosPrimariosCompletos, false);

  completeObjectives(campaign, scenario, { secondary: false });
  const result = campaign.finishScenario({ victory: true, durationSeconds: 2000, casualties: 40, score: 25 });
  assert.equal(result.resultado.medalla, 'bronce');
  assert.equal(campaign.getState().escenarios[scenario.id].puntuacionMaxima, 25);
});

test('derrota, bronce, plata y oro se resuelven de forma determinista', () => {
  const scenario = CAMPAIGN.escenarios[0];

  const defeated = createCampaign();
  defeated.startScenario(scenario.id);
  const defeat = defeated.finishScenario({ victory: false, score: 90 });
  assert.equal(defeat.resultado.medalla, 'ninguna');
  assert.equal(defeated.getState().escenarios[scenario.id].victoria, false);
  assert.equal(defeated.listScenarios()[1].estado, 'bloqueado');

  const bronze = createCampaign();
  bronze.startScenario(scenario.id);
  completeObjectives(bronze, scenario, { secondary: false });
  assert.equal(bronze.finishScenario({ victory: true, durationSeconds: 1, casualties: 0 }).resultado.medalla, 'bronce');

  const silver = createCampaign();
  silver.startScenario(scenario.id);
  completeObjectives(silver, scenario);
  assert.equal(silver.finishScenario({ victory: true, durationSeconds: 9999, casualties: 0 }).resultado.medalla, 'plata');

  const gold = createCampaign();
  gold.startScenario(scenario.id);
  completeObjectives(gold, scenario);
  assert.equal(
    gold.finishScenario({
      victory: true,
      durationSeconds: scenario.medallas.oro.tiempoMaximo,
      casualties: scenario.medallas.oro.bajasMaximas,
    }).resultado.medalla,
    'oro',
  );
});

test('las recompensas se conceden una sola vez y una repetición puede mejorar la medalla', () => {
  const campaign = createCampaign();
  const scenario = CAMPAIGN.escenarios[0];
  campaign.startScenario(scenario.id);
  completeObjectives(campaign, scenario, { secondary: false });
  const bronze = campaign.finishScenario({ victory: true });
  assert.deepEqual(bronze.recompensasOtorgadas.map((reward) => reward.nivel), ['base']);
  assert.equal(campaign.getState().prestigio, 100);

  campaign.startScenario(scenario.id);
  completeObjectives(campaign, scenario);
  const gold = campaign.finishScenario({ victory: true, durationSeconds: 1, casualties: 0 });
  assert.deepEqual(gold.recompensasOtorgadas.map((reward) => reward.nivel), ['plata', 'oro']);
  assert.equal(campaign.getState().prestigio, 200);
  assert.equal(campaign.getState().escenarios[scenario.id].mejorMedalla, 'oro');

  campaign.startScenario(scenario.id);
  completeObjectives(campaign, scenario);
  assert.deepEqual(
    campaign.finishScenario({ victory: true, durationSeconds: 1, casualties: 0 }).recompensasOtorgadas,
    [],
  );
  assert.equal(campaign.getState().prestigio, 200);
});

test('el progreso usa almacenamiento inyectable, autoguardado y copias defensivas', () => {
  const storage = createMemoryStorage();
  const first = createCampaign({ storage, storageKey: 'partida' });
  const scenario = CAMPAIGN.escenarios[0];
  first.startScenario(scenario.id);
  first.updateObjective('carbon', 2, { mode: 'set' });
  assert.ok(storage.getItem('partida'));

  const second = createCampaign({ storage, storageKey: 'partida' });
  assert.equal(second.getActiveScenario().sesion.objetivos.carbon, 2);
  const snapshot = second.getState();
  snapshot.prestigio = 999999;
  assert.equal(second.getState().prestigio, 0);

  second.reset();
  assert.equal(storage.getItem('partida'), null);
  assert.equal(second.getState().revision, 0);
});

test('la serialización de campaña lleva versión, valida entradas y conserva el estado', () => {
  const campaign = createCampaign();
  campaign.startScenario(CAMPAIGN.escenarios[0].id);
  campaign.updateObjective('carbon', 2, { mode: 'set' });
  const serialized = campaign.export();
  const envelope = JSON.parse(serialized);
  assert.equal(envelope.version, CAMPAIGN_SCHEMA_VERSION);
  assert.equal(envelope.tipo, 'dominio.progreso-campania');
  assert.deepEqual(deserializeCampaignProgress(serialized), campaign.getState());
  assert.equal(serializeCampaignProgress(campaign.getState()), serialized);

  const incompatible = JSON.stringify({ ...envelope, version: 999 });
  assert.throws(() => deserializeCampaignProgress(incompatible), /no compatible/);
  assert.throws(() => deserializeCampaignProgress('{'), /No se pudo leer/);
  assert.throws(() => deserializeCampaignProgress(JSON.stringify({ ...envelope, tipo: 'otro' })), /no contiene/);
});

test('la diplomacia requiere facciones únicas y crea relaciones simétricas', () => {
  assert.throws(() => createDiplomacy({ factions: ['solo'] }), /al menos dos/);
  assert.throws(() => createDiplomacy({ factions: ['a', 'a'] }), /unicos/);
  const diplomacy = createDiplomacy({
    factions: [
      { id: 'liga', nombre: 'Liga', influencia: 300 },
      { id: 'yunque', nombre: 'Yunque', influencia: 100 },
    ],
    initialRelations: [{ a: 'liga', b: 'yunque', reputacion: 25 }],
  });
  assert.ok(diplomacy instanceof StrategicDiplomacy);
  assert.deepEqual(diplomacy.getRelation('liga', 'yunque'), diplomacy.getRelation('yunque', 'liga'));
  assert.equal(diplomacy.getRelation('liga', 'yunque').disposicion, 'neutral');
  assert.equal(diplomacy.getRelation('liga', 'yunque').reputacion, 25);
});

test('costes, reputación, estados y enfriamientos explican por qué una acción no está disponible', () => {
  const diplomacy = createDiplomacy({
    factions: [
      { id: 'a', influencia: 20 },
      { id: 'b', influencia: 100 },
    ],
  });
  assert.equal(diplomacy.quote('desconocida', 'a', 'b').codigo, 'accion-desconocida');
  assert.equal(diplomacy.quote('comercio', 'a', 'b').codigo, 'influencia-insuficiente');
  diplomacy.grantInfluence('a', 100);
  assert.equal(diplomacy.quote('comercio', 'a', 'b').codigo, 'reputacion-insuficiente');
  diplomacy.adjustReputation('a', 'b', 10, 'ayuda humanitaria');
  const agreement = diplomacy.execute('comercio', 'a', 'b');
  assert.equal(agreement.ok, true);
  assert.equal(agreement.coste, DIPLOMACY_ACTIONS.comercio.coste);
  assert.equal(diplomacy.getState().facciones.a.influencia, 85);
  assert.equal(diplomacy.quote('comercio', 'a', 'b').codigo, 'en-enfriamiento');
  assert.equal(diplomacy.quote('comercio', 'a', 'b').turnosRestantes, 4);
  diplomacy.advance(4);
  assert.equal(diplomacy.quote('comercio', 'a', 'b').codigo, 'tratado-ya-activo');
});

test('alianza, guerra y armisticio cambian la disposición y rompen tratados activos', () => {
  const diplomacy = createDiplomacy({
    factions: [
      { id: 'liga', influencia: 500 },
      { id: 'red', influencia: 500 },
    ],
    initialRelations: [{ a: 'liga', b: 'red', reputacion: 70 }],
  });
  const alliance = diplomacy.execute('alianza', 'liga', 'red');
  assert.equal(alliance.ok, true);
  assert.equal(alliance.relacion.disposicion, 'aliado');
  assert.equal(alliance.tratado.estado, 'activo');

  const war = diplomacy.execute('declararGuerra', 'liga', 'red');
  assert.equal(war.ok, true);
  assert.equal(war.relacion.disposicion, 'enemigo');
  assert.equal(diplomacy.getState().relaciones['liga::red'].tratados[0].estado, 'roto');
  assert.equal(diplomacy.getRelation('liga', 'red').tratados.length, 0);

  const armistice = diplomacy.execute('armisticio', 'liga', 'red');
  assert.equal(armistice.ok, true);
  assert.equal(armistice.relacion.disposicion, 'neutral');
  assert.equal(armistice.tratado.tipo, 'armisticio');
});

test('los tratados caducan exactamente en su turno y la alianza vuelve a neutral', () => {
  const diplomacy = createDiplomacy({
    factions: [
      { id: 'a', influencia: 500 },
      { id: 'b', influencia: 500 },
    ],
    initialRelations: [{ a: 'a', b: 'b', reputacion: 65 }],
  });
  diplomacy.execute('alianza', 'a', 'b');
  diplomacy.advance(DIPLOMACY_ACTIONS.alianza.duracion - 1);
  assert.equal(diplomacy.getRelation('a', 'b').disposicion, 'aliado');
  assert.equal(diplomacy.getRelation('a', 'b').tratados.length, 1);
  diplomacy.advance(1);
  assert.equal(diplomacy.getRelation('a', 'b').disposicion, 'neutral');
  assert.equal(diplomacy.getRelation('a', 'b').tratados.length, 0);
  assert.equal(diplomacy.getState().relaciones['a::b'].tratados[0].estado, 'expirado');
  assert.throws(() => diplomacy.advance(-1), /entero no negativo/);
});

test('reputación e influencia están acotadas y el estado entregado es defensivo', () => {
  const diplomacy = createDiplomacy({ factions: ['a', 'b'] });
  assert.equal(diplomacy.adjustReputation('a', 'b', 999), 100);
  assert.equal(diplomacy.adjustReputation('a', 'b', -999), -100);
  assert.equal(diplomacy.grantInfluence('a', -999), 0);
  assert.throws(() => diplomacy.adjustReputation('a', 'b', Infinity), /finito/);
  const state = diplomacy.getState();
  state.facciones.a.influencia = 999;
  assert.equal(diplomacy.getState().facciones.a.influencia, 0);
});

test('la diplomacia es determinista y su serialización versionada permite reanudar', () => {
  const create = () =>
    createDiplomacy({
      factions: [
        { id: 'a', influencia: 500 },
        { id: 'b', influencia: 500 },
        { id: 'c', influencia: 500 },
      ],
      initialRelations: [
        { a: 'a', b: 'b', reputacion: 70 },
        { a: 'a', b: 'c', reputacion: 10 },
      ],
    });
  const first = create();
  const second = create();
  for (const diplomacy of [first, second]) {
    diplomacy.execute('alianza', 'a', 'b');
    diplomacy.execute('comercio', 'a', 'c');
    diplomacy.advance(7);
    diplomacy.adjustReputation('b', 'c', -12, 'incidente fronterizo');
  }
  assert.deepEqual(first.getState(), second.getState());

  const serialized = first.export();
  assert.deepEqual(deserializeDiplomacyState(serialized), first.getState());
  assert.equal(serializeDiplomacyState(first.getState()), serialized);
  const restored = createDiplomacy({ initialState: deserializeDiplomacyState(serialized) });
  assert.deepEqual(restored.getState(), first.getState());

  const envelope = JSON.parse(serialized);
  assert.throws(() => deserializeDiplomacyState(JSON.stringify({ ...envelope, version: 2 })), /no compatible/);
  assert.throws(() => deserializeDiplomacyState(JSON.stringify({ ...envelope, tipo: 'otro' })), /no contiene/);
});
