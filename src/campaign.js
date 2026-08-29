/**
 * Sistemas de campaña y diplomacia de DOMINIO: SIGLOS DE ACERO.
 *
 * El módulo es deliberadamente independiente de Three.js y del DOM. Tanto la
 * persistencia como el reloj estratégico se inyectan, lo que permite usarlo
 * desde la interfaz, un servidor o las pruebas sin cambiar su comportamiento.
 */

export const CAMPAIGN_SCHEMA_VERSION = 1;
export const DIPLOMACY_SCHEMA_VERSION = 1;

export const MEDAL_RANK = Object.freeze({ ninguna: 0, bronce: 1, plata: 2, oro: 3 });

const rawCampaign = {
  id: 'la-forja-del-porvenir',
  nombre: 'La Forja del Porvenir',
  descripcion:
    'Cuatro generaciones deciden si el progreso servirá para dominar el mundo o para sostenerlo.',
  escenarios: [
    {
      id: 'vapor-las-lineas-del-alba',
      era: 'Vapor',
      anio: 1800,
      nombre: 'Las líneas del alba',
      briefing: {
        lugar: 'Cuenca del Estuario',
        situacion:
          'La Liga del Estuario ha unido sus talleres con una red de telégrafo y ferrocarril. El Directorio de Ceniza quiere cortar ambas líneas antes de que llegue el primer convoy.',
        inteligencia:
          'El carbón alimenta las máquinas, pero la información las coordina. Cada estación conservada acelera los refuerzos y mantiene comunicadas las defensas.',
        orden:
          'Asegura el depósito de carbón, repara la estación telegráfica y escolta la locomotora hasta la fundición.',
      },
      objetivosPrimarios: [
        { id: 'carbon', descripcion: 'Asegurar depósitos de carbón', objetivo: 3, unidad: 'depósitos' },
        { id: 'telegrafo', descripcion: 'Reparar la estación telegráfica', objetivo: 1, unidad: 'estación' },
        { id: 'convoy', descripcion: 'Escoltar el convoy ferroviario', objetivo: 1, unidad: 'convoy' },
      ],
      objetivosSecundarios: [
        { id: 'artesanos', descripcion: 'Rescatar cuadrillas de artesanos', objetivo: 2, unidad: 'cuadrillas' },
        { id: 'puentes', descripcion: 'Conservar los puentes de hierro', objetivo: 2, unidad: 'puentes' },
      ],
      medallas: { oro: { tiempoMaximo: 1080, bajasMaximas: 12 } },
      recompensas: {
        base: { prestigio: 100, inventario: { planos: 1 }, desbloqueos: ['ingenieros-ferroviarios'] },
        plata: { prestigio: 35, inventario: { suministros: 150 } },
        oro: { prestigio: 65, desbloqueos: ['locomotora-blindada'] },
      },
    },
    {
      id: 'industria-trueno-coordinado',
      era: 'Industria',
      anio: 1900,
      nombre: 'Trueno coordinado',
      requisito: 'vapor-las-lineas-del-alba',
      briefing: {
        lugar: 'Cinturón de Acero',
        situacion:
          'Un siglo de fábricas ha convertido la frontera en una muralla. La Unión del Yunque combina artillería, blindados y aviación para abrir una brecha definitiva.',
        inteligencia:
          'Ningún arma decide sola la batalla. Observadores aéreos, baterías y columnas blindadas deben actuar en una misma ventana de ataque.',
        orden:
          'Silencia la artillería, abre dos corredores con blindados y captura el centro ferroviario antes de que lleguen las reservas.',
      },
      objetivosPrimarios: [
        { id: 'baterias', descripcion: 'Neutralizar baterías de artillería', objetivo: 4, unidad: 'baterías' },
        { id: 'corredores', descripcion: 'Abrir corredores blindados', objetivo: 2, unidad: 'corredores' },
        { id: 'nudo-ferroviario', descripcion: 'Capturar el nudo ferroviario', objetivo: 1, unidad: 'complejo' },
      ],
      objetivosSecundarios: [
        { id: 'reconocimiento', descripcion: 'Completar reconocimientos aéreos', objetivo: 3, unidad: 'vuelos' },
        { id: 'hospital', descripcion: 'Evacuar el hospital de campaña', objetivo: 1, unidad: 'hospital' },
      ],
      medallas: { oro: { tiempoMaximo: 1320, bajasMaximas: 20 } },
      recompensas: {
        base: { prestigio: 140, inventario: { acero: 300 }, desbloqueos: ['doctrina-armas-combinadas'] },
        plata: { prestigio: 45, desbloqueos: ['observadores-aereos'] },
        oro: { prestigio: 80, desbloqueos: ['cadena-logistica-mecanizada'] },
      },
    },
    {
      id: 'atomo-el-sol-cautivo',
      era: 'Red',
      anio: 2000,
      nombre: 'El pulso cautivo',
      requisito: 'industria-trueno-coordinado',
      briefing: {
        lugar: 'Arco de Helio',
        situacion:
          'La Mancomunidad de Helio enlaza centros de datos, navegación satelital y generación distribuida en la primera red estratégica plenamente digital. Enjambres autónomos intentan fragmentarla antes de su sincronización.',
        inteligencia:
          'La energía no sirve sin una red resiliente. Sensores, defensas antiaéreas, microredes y reservas distribuidas deben sobrevivir al mismo pulso.',
        orden:
          'Recupera los centros de datos, estabiliza los nodos de sincronización y protege la conexión durante la reconexión general.',
      },
      objetivosPrimarios: [
        { id: 'datos', descripcion: 'Recuperar centros de datos', objetivo: 3, unidad: 'centros' },
        { id: 'sincronizadores', descripcion: 'Estabilizar nodos de sincronización', objetivo: 4, unidad: 'nodos' },
        { id: 'reconexion', descripcion: 'Completar la secuencia de reconexión', objetivo: 1, unidad: 'secuencia' },
      ],
      objetivosSecundarios: [
        { id: 'microredes', descripcion: 'Mantener microredes auxiliares', objetivo: 3, unidad: 'microredes' },
        { id: 'enjambres', descripcion: 'Capturar nucleos de enjambre', objetivo: 2, unidad: 'nucleos' },
      ],
      medallas: { oro: { tiempoMaximo: 1440, bajasMaximas: 16 } },
      recompensas: {
        base: { prestigio: 180, inventario: { energia: 500 }, desbloqueos: ['arquitectura-red-resiliente'] },
        plata: { prestigio: 60, desbloqueos: ['defensa-de-enjambre'] },
        oro: { prestigio: 95, desbloqueos: ['microred-autonoma', 'blindaje-reactivo'] },
      },
    },
    {
      id: 'orbital-puente-de-selene',
      era: 'Orbital',
      anio: 2100,
      nombre: 'El puente de Selene',
      requisito: 'atomo-el-sol-cautivo',
      briefing: {
        lugar: 'Polo austral de Selene',
        situacion:
          'La Red de los Horizontes levanta una ciudad fuera de la Tierra. Robots cooperativos extraen recursos locales mientras una flota rival bloquea los enlaces orbitales.',
        inteligencia:
          'Energía superficial, utilización de recursos locales, construcción autónoma y comunicaciones orbitales forman una sola cadena logística. Si cae un eslabón, cae la colonia.',
        orden:
          'Activa la red energética, construye el puerto con recursos locales y libera los repetidores orbitales para evacuar a la población.',
      },
      objetivosPrimarios: [
        { id: 'energia-lunar', descripcion: 'Activar nodos de energía superficial', objetivo: 4, unidad: 'nodos' },
        { id: 'isru', descripcion: 'Procesar recursos locales para el puerto', objetivo: 1000, unidad: 'toneladas' },
        { id: 'repetidores', descripcion: 'Liberar repetidores orbitales', objetivo: 3, unidad: 'repetidores' },
      ],
      objetivosSecundarios: [
        { id: 'robots', descripcion: 'Conservar robots cooperativos', objetivo: 8, unidad: 'robots' },
        { id: 'habitats', descripcion: 'Sellar habitats civiles', objetivo: 3, unidad: 'habitats' },
      ],
      medallas: { oro: { tiempoMaximo: 1680, bajasMaximas: 10 } },
      recompensas: {
        base: { prestigio: 250, desbloqueos: ['victoria-la-forja-del-porvenir'] },
        plata: { prestigio: 80, inventario: { helio3: 200 } },
        oro: { prestigio: 140, desbloqueos: ['arquitectos-del-horizonte'] },
      },
    },
  ],
};

export const CAMPAIGN = deepFreeze(rawCampaign);

export function createMemoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial).map(([key, value]) => [String(key), String(value)]));
  return {
    getItem(key) {
      return entries.has(String(key)) ? entries.get(String(key)) : null;
    },
    setItem(key, value) {
      entries.set(String(key), String(value));
    },
    removeItem(key) {
      entries.delete(String(key));
    },
    dump() {
      return Object.fromEntries(entries);
    },
  };
}

export function serializeCampaignProgress(progress) {
  const normalized = normalizeCampaignProgress(progress, CAMPAIGN);
  return JSON.stringify({
    tipo: 'dominio.progreso-campania',
    version: CAMPAIGN_SCHEMA_VERSION,
    datos: normalized,
  });
}

export function deserializeCampaignProgress(serialized, definition = CAMPAIGN) {
  const envelope = parseSerialized(serialized, 'progreso de campaña');
  if (envelope.tipo !== 'dominio.progreso-campania') {
    throw new TypeError('El archivo no contiene progreso de campaña de DOMINIO.');
  }
  if (envelope.version !== CAMPAIGN_SCHEMA_VERSION) {
    throw new RangeError(`Version de campaña no compatible: ${String(envelope.version)}.`);
  }
  return normalizeCampaignProgress(envelope.datos, definition);
}

export function createCampaign(options = {}) {
  return new CampaignDirector(options);
}

export class CampaignDirector {
  constructor({
    definition = CAMPAIGN,
    storage = null,
    storageKey = `dominio:campania:${definition.id}`,
    autoLoad = true,
    autoSave = true,
  } = {}) {
    validateCampaignDefinition(definition);
    validateStorage(storage);
    this.definition = definition;
    this.storage = storage;
    this.storageKey = storageKey;
    this.autoSave = Boolean(autoSave);
    this.progress = createEmptyCampaignProgress(definition);

    if (autoLoad && storage) this.load();
  }

  getState() {
    return clone(this.progress);
  }

  getDefinition() {
    return this.definition;
  }

  listScenarios() {
    return this.definition.escenarios.map((scenario) => {
      const record = this.progress.escenarios[scenario.id];
      return {
        ...clone(scenario),
        estado: record.victoria
          ? 'completado'
          : this.isUnlocked(scenario.id)
            ? this.progress.escenarioActivo?.escenarioId === scenario.id
              ? 'en-curso'
              : 'disponible'
            : 'bloqueado',
        progreso: clone(record),
      };
    });
  }

  isUnlocked(scenarioId) {
    const scenario = this.#scenario(scenarioId);
    return !scenario.requisito || this.progress.escenarios[scenario.requisito]?.victoria === true;
  }

  startScenario(scenarioId) {
    const scenario = this.#scenario(scenarioId);
    if (!this.isUnlocked(scenarioId)) {
      return { ok: false, codigo: 'escenario-bloqueado', requisito: scenario.requisito };
    }

    const record = this.progress.escenarios[scenarioId];
    record.intentos += 1;
    this.progress.escenarioActivo = {
      escenarioId: scenario.id,
      intento: record.intentos,
      objetivos: Object.fromEntries(
        [...scenario.objetivosPrimarios, ...scenario.objetivosSecundarios].map((objective) => [objective.id, 0]),
      ),
    };
    this.#changed();
    return { ok: true, escenario: clone(scenario), sesion: clone(this.progress.escenarioActivo) };
  }

  updateObjective(objectiveId, amount = 1, { mode = 'increment' } = {}) {
    const active = this.progress.escenarioActivo;
    if (!active) return { ok: false, codigo: 'sin-escenario-activo' };
    const scenario = this.#scenario(active.escenarioId);
    const objective = [...scenario.objetivosPrimarios, ...scenario.objetivosSecundarios].find(
      (candidate) => candidate.id === objectiveId,
    );
    if (!objective) return { ok: false, codigo: 'objetivo-desconocido' };
    if (!Number.isFinite(amount)) return { ok: false, codigo: 'cantidad-invalida' };

    const current = active.objetivos[objectiveId];
    const next = mode === 'set' ? amount : current + amount;
    active.objetivos[objectiveId] = clamp(next, 0, objective.objetivo);
    this.#changed();
    return {
      ok: true,
      objetivoId: objective.id,
      valor: active.objetivos[objective.id],
      objetivo: objective.objetivo,
      completado: active.objetivos[objective.id] >= objective.objetivo,
    };
  }

  getActiveScenario() {
    if (!this.progress.escenarioActivo) return null;
    const scenario = this.#scenario(this.progress.escenarioActivo.escenarioId);
    return {
      escenario: clone(scenario),
      sesion: clone(this.progress.escenarioActivo),
      objetivosPrimariosCompletos: objectivesComplete(scenario.objetivosPrimarios, this.progress.escenarioActivo),
      objetivosSecundariosCompletos: objectivesComplete(
        scenario.objetivosSecundarios,
        this.progress.escenarioActivo,
      ),
    };
  }

  finishScenario({ victory = true, durationSeconds = Number.POSITIVE_INFINITY, casualties = Infinity, score = 0 } = {}) {
    const active = this.progress.escenarioActivo;
    if (!active) return { ok: false, codigo: 'sin-escenario-activo' };
    const scenario = this.#scenario(active.escenarioId);
    const primariesComplete = objectivesComplete(scenario.objetivosPrimarios, active);
    if (victory && !primariesComplete) {
      return { ok: false, codigo: 'objetivos-primarios-pendientes' };
    }

    const secondariesComplete = objectivesComplete(scenario.objetivosSecundarios, active);
    const medal = victory
      ? calculateMedal(scenario, { secondariesComplete, durationSeconds, casualties })
      : 'ninguna';
    const record = this.progress.escenarios[scenario.id];
    const previousRank = MEDAL_RANK[record.mejorMedalla ?? 'ninguna'];
    const result = {
      victoria: Boolean(victory),
      medalla: medal,
      duracionSegundos: finiteOrNull(durationSeconds),
      bajas: finiteOrNull(casualties),
      puntuacion: Math.max(0, finiteNumber(score, 0)),
      objetivos: clone(active.objetivos),
    };
    record.resultadoUltimo = result;
    record.puntuacionMaxima = Math.max(record.puntuacionMaxima, result.puntuacion);

    const granted = [];
    if (victory) {
      record.victoria = true;
      if (MEDAL_RANK[medal] > previousRank) record.mejorMedalla = medal;
      const rewardTiers = ['base'];
      if (MEDAL_RANK[medal] >= MEDAL_RANK.plata) rewardTiers.push('plata');
      if (MEDAL_RANK[medal] >= MEDAL_RANK.oro) rewardTiers.push('oro');
      for (const tier of rewardTiers) {
        const rewardKey = `${scenario.id}:${tier}`;
        if (!this.progress.recompensasReclamadas.includes(rewardKey)) {
          this.progress.recompensasReclamadas.push(rewardKey);
          applyReward(this.progress, scenario.recompensas[tier]);
          granted.push({ nivel: tier, ...clone(scenario.recompensas[tier]) });
        }
      }
    }

    this.progress.escenarioActivo = null;
    this.#changed();
    const next = this.definition.escenarios.find(
      (candidate) => candidate.requisito === scenario.id && this.isUnlocked(candidate.id),
    );
    return {
      ok: true,
      resultado: clone(result),
      recompensasOtorgadas: granted,
      siguienteEscenarioId: next?.id ?? null,
      campaniaCompletada: this.definition.escenarios.every(
        (candidate) => this.progress.escenarios[candidate.id].victoria,
      ),
    };
  }

  save() {
    if (!this.storage) return { ok: false, codigo: 'sin-adaptador-de-almacenamiento' };
    this.storage.setItem(this.storageKey, serializeCampaignProgress(this.progress));
    return { ok: true, revision: this.progress.revision };
  }

  load() {
    if (!this.storage) return { ok: false, codigo: 'sin-adaptador-de-almacenamiento' };
    const serialized = this.storage.getItem(this.storageKey);
    if (serialized == null) return { ok: true, encontrado: false, state: this.getState() };
    const loaded = deserializeCampaignProgress(serialized, this.definition);
    if (loaded.campaniaId !== this.definition.id) {
      throw new RangeError(`El progreso pertenece a otra campaña: ${loaded.campaniaId}.`);
    }
    this.progress = loaded;
    return { ok: true, encontrado: true, state: this.getState() };
  }

  import(serialized, { save = this.autoSave } = {}) {
    const imported = deserializeCampaignProgress(serialized, this.definition);
    if (imported.campaniaId !== this.definition.id) throw new RangeError('La campaña importada no coincide.');
    this.progress = imported;
    if (save && this.storage) this.save();
    return this.getState();
  }

  export() {
    return serializeCampaignProgress(this.progress);
  }

  reset({ clearStorage = true } = {}) {
    this.progress = createEmptyCampaignProgress(this.definition);
    if (clearStorage && this.storage) this.storage.removeItem(this.storageKey);
    else this.#persistIfNeeded();
    return this.getState();
  }

  #scenario(scenarioId) {
    const scenario = this.definition.escenarios.find((candidate) => candidate.id === scenarioId);
    if (!scenario) throw new RangeError(`Escenario desconocido: ${String(scenarioId)}.`);
    return scenario;
  }

  #changed() {
    this.progress.revision += 1;
    this.#persistIfNeeded();
  }

  #persistIfNeeded() {
    if (this.autoSave && this.storage) this.save();
  }
}

export const DIPLOMACY_ACTIONS = deepFreeze({
  comercio: {
    nombre: 'Tratado comercial',
    coste: 35,
    enfriamiento: 4,
    duracion: 10,
    reputacionMinima: 5,
    reputacionDelta: 8,
    disposicionesPermitidas: ['neutral', 'aliado'],
  },
  noAgresion: {
    nombre: 'Pacto de no agresión',
    coste: 55,
    enfriamiento: 6,
    duracion: 14,
    reputacionMinima: 0,
    reputacionDelta: 12,
    disposicionesPermitidas: ['neutral'],
  },
  alianza: {
    nombre: 'Alianza estratégica',
    coste: 120,
    enfriamiento: 10,
    duracion: 24,
    reputacionMinima: 60,
    reputacionDelta: 10,
    disposicionesPermitidas: ['neutral', 'aliado'],
    disposicionResultante: 'aliado',
  },
  declararGuerra: {
    nombre: 'Declaración de guerra',
    coste: 0,
    enfriamiento: 8,
    duracion: 0,
    reputacionMinima: -100,
    reputacionDelta: -45,
    disposicionesPermitidas: ['neutral', 'aliado'],
    disposicionResultante: 'enemigo',
  },
  armisticio: {
    nombre: 'Armisticio',
    coste: 85,
    enfriamiento: 8,
    duracion: 12,
    reputacionMinima: -80,
    reputacionDelta: 20,
    disposicionesPermitidas: ['enemigo'],
    disposicionResultante: 'neutral',
  },
});

export function createDiplomacy(options = {}) {
  return new StrategicDiplomacy(options);
}

export function serializeDiplomacyState(state) {
  return JSON.stringify({
    tipo: 'dominio.diplomacia',
    version: DIPLOMACY_SCHEMA_VERSION,
    datos: normalizeDiplomacyState(state),
  });
}

export function deserializeDiplomacyState(serialized) {
  const envelope = parseSerialized(serialized, 'estado diplomatico');
  if (envelope.tipo !== 'dominio.diplomacia') throw new TypeError('El archivo no contiene diplomacia de DOMINIO.');
  if (envelope.version !== DIPLOMACY_SCHEMA_VERSION) {
    throw new RangeError(`Version diplomatica no compatible: ${String(envelope.version)}.`);
  }
  return normalizeDiplomacyState(envelope.datos);
}

export class StrategicDiplomacy {
  constructor({ factions = [], initialRelations = [], initialState = null } = {}) {
    if (initialState) {
      this.state = normalizeDiplomacyState(initialState);
      return;
    }
    if (!Array.isArray(factions) || factions.length < 2) {
      throw new TypeError('La diplomacia requiere al menos dos facciones.');
    }
    const normalizedFactions = factions.map(normalizeFaction);
    if (new Set(normalizedFactions.map((faction) => faction.id)).size !== normalizedFactions.length) {
      throw new RangeError('Los identificadores de faccion deben ser unicos.');
    }
    this.state = {
      version: DIPLOMACY_SCHEMA_VERSION,
      turno: 0,
      secuencia: 0,
      facciones: Object.fromEntries(normalizedFactions.map((faction) => [faction.id, faction])),
      relaciones: {},
      enfriamientos: {},
      historial: [],
    };
    for (let index = 0; index < normalizedFactions.length; index += 1) {
      for (let other = index + 1; other < normalizedFactions.length; other += 1) {
        const key = pairKey(normalizedFactions[index].id, normalizedFactions[other].id);
        this.state.relaciones[key] = { disposicion: 'neutral', reputacion: 0, tratados: [] };
      }
    }
    for (const relation of initialRelations) {
      const entry = this.#relation(relation.a, relation.b);
      entry.disposicion = normalizeDisposition(relation.disposicion ?? 'neutral');
      entry.reputacion = clamp(finiteNumber(relation.reputacion, 0), -100, 100);
    }
  }

  getState() {
    return clone(this.state);
  }

  getRelation(a, b) {
    const relation = this.#relation(a, b);
    return {
      ...clone(relation),
      tratados: relation.tratados.filter((treaty) => treaty.estado === 'activo').map(clone),
    };
  }

  quote(actionId, actorId, targetId) {
    const rule = DIPLOMACY_ACTIONS[actionId];
    if (!rule) return { ok: false, codigo: 'accion-desconocida' };
    if (actorId === targetId) return { ok: false, codigo: 'objetivo-propio' };
    const actor = this.state.facciones[actorId];
    const target = this.state.facciones[targetId];
    if (!actor || !target) return { ok: false, codigo: 'faccion-desconocida' };
    const relation = this.#relation(actorId, targetId);
    const availableTurn = this.state.enfriamientos[cooldownKey(actorId, targetId, actionId)] ?? 0;
    const activeDuplicate = relation.tratados.some(
      (treaty) => treaty.tipo === actionId && treaty.estado === 'activo',
    );

    let codigo = null;
    if (availableTurn > this.state.turno) codigo = 'en-enfriamiento';
    else if (actor.influencia < rule.coste) codigo = 'influencia-insuficiente';
    else if (!rule.disposicionesPermitidas.includes(relation.disposicion)) codigo = 'disposicion-incompatible';
    else if (relation.reputacion < rule.reputacionMinima) codigo = 'reputacion-insuficiente';
    else if (rule.duracion > 0 && activeDuplicate) codigo = 'tratado-ya-activo';

    return {
      ok: codigo == null,
      codigo,
      accionId: actionId,
      actorId,
      targetId,
      coste: rule.coste,
      turnoActual: this.state.turno,
      disponibleEnTurno: availableTurn,
      turnosRestantes: Math.max(0, availableTurn - this.state.turno),
      reputacion: relation.reputacion,
      reputacionMinima: rule.reputacionMinima,
      disposicion: relation.disposicion,
    };
  }

  execute(actionId, actorId, targetId) {
    const quote = this.quote(actionId, actorId, targetId);
    if (!quote.ok) return quote;
    const rule = DIPLOMACY_ACTIONS[actionId];
    const actor = this.state.facciones[actorId];
    const relation = this.#relation(actorId, targetId);
    actor.influencia -= rule.coste;
    relation.reputacion = clamp(relation.reputacion + rule.reputacionDelta, -100, 100);
    this.state.enfriamientos[cooldownKey(actorId, targetId, actionId)] = this.state.turno + rule.enfriamiento;

    if (actionId === 'declararGuerra') {
      for (const treaty of relation.tratados) {
        if (treaty.estado === 'activo') {
          treaty.estado = 'roto';
          treaty.finalizadoEnTurno = this.state.turno;
        }
      }
    }
    if (rule.disposicionResultante) relation.disposicion = rule.disposicionResultante;

    let treaty = null;
    if (rule.duracion > 0) {
      this.state.secuencia += 1;
      treaty = {
        id: `tratado-${this.state.secuencia}`,
        tipo: actionId,
        firmantes: [actorId, targetId],
        estado: 'activo',
        iniciadoEnTurno: this.state.turno,
        expiraEnTurno: this.state.turno + rule.duracion,
      };
      relation.tratados.push(treaty);
    }

    this.#event('accion-diplomatica', { actionId, actorId, targetId, coste: rule.coste, tratadoId: treaty?.id ?? null });
    return {
      ok: true,
      accionId: actionId,
      coste: rule.coste,
      tratado: treaty ? clone(treaty) : null,
      relacion: this.getRelation(actorId, targetId),
    };
  }

  adjustReputation(a, b, delta, reason = 'evento-estrategico') {
    if (!Number.isFinite(delta)) throw new TypeError('El cambio de reputacion debe ser finito.');
    const relation = this.#relation(a, b);
    relation.reputacion = clamp(relation.reputacion + delta, -100, 100);
    this.#event('reputacion', { a, b, delta, reason, reputacion: relation.reputacion });
    return relation.reputacion;
  }

  grantInfluence(factionId, amount) {
    if (!Number.isFinite(amount)) throw new TypeError('La influencia debe ser finita.');
    const faction = this.state.facciones[factionId];
    if (!faction) throw new RangeError(`Faccion desconocida: ${String(factionId)}.`);
    faction.influencia = Math.max(0, faction.influencia + amount);
    return faction.influencia;
  }

  advance(turns = 1) {
    if (!Number.isInteger(turns) || turns < 0) throw new RangeError('Los turnos deben ser un entero no negativo.');
    for (let step = 0; step < turns; step += 1) {
      this.state.turno += 1;
      for (const relation of Object.values(this.state.relaciones)) {
        for (const treaty of relation.tratados) {
          if (treaty.estado === 'activo' && treaty.expiraEnTurno <= this.state.turno) {
            treaty.estado = 'expirado';
            treaty.finalizadoEnTurno = this.state.turno;
            if (treaty.tipo === 'alianza' && relation.disposicion === 'aliado') {
              relation.disposicion = 'neutral';
            }
            this.#event('tratado-expirado', { tratadoId: treaty.id, tipo: treaty.tipo });
          }
        }
      }
    }
    return this.getState();
  }

  export() {
    return serializeDiplomacyState(this.state);
  }

  #relation(a, b) {
    if (!this.state.facciones[a] || !this.state.facciones[b]) throw new RangeError('Faccion desconocida.');
    if (a === b) throw new RangeError('Una faccion no mantiene relaciones consigo misma.');
    const relation = this.state.relaciones[pairKey(a, b)];
    if (!relation) throw new RangeError(`No existe relacion entre ${a} y ${b}.`);
    return relation;
  }

  #event(tipo, datos) {
    this.state.historial.push({ turno: this.state.turno, tipo, ...clone(datos) });
  }
}

function createEmptyCampaignProgress(definition) {
  return {
    version: CAMPAIGN_SCHEMA_VERSION,
    campaniaId: definition.id,
    revision: 0,
    escenarioActivo: null,
    prestigio: 0,
    inventario: {},
    desbloqueos: [],
    recompensasReclamadas: [],
    escenarios: Object.fromEntries(
      definition.escenarios.map((scenario) => [
        scenario.id,
        { intentos: 0, victoria: false, mejorMedalla: null, puntuacionMaxima: 0, resultadoUltimo: null },
      ]),
    ),
  };
}

function normalizeCampaignProgress(value, definition) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Progreso de campaña invalido.');
  const base = createEmptyCampaignProgress(definition);
  base.campaniaId = typeof value.campaniaId === 'string' ? value.campaniaId : definition.id;
  base.revision = nonNegativeInteger(value.revision);
  base.prestigio = Math.max(0, finiteNumber(value.prestigio, 0));
  base.inventario = normalizeNumericRecord(value.inventario);
  base.desbloqueos = uniqueStrings(value.desbloqueos);
  base.recompensasReclamadas = uniqueStrings(value.recompensasReclamadas);

  for (const scenario of definition.escenarios) {
    const source = value.escenarios?.[scenario.id];
    if (!source || typeof source !== 'object') continue;
    base.escenarios[scenario.id] = {
      intentos: nonNegativeInteger(source.intentos),
      victoria: source.victoria === true,
      mejorMedalla: MEDAL_RANK[source.mejorMedalla] ? source.mejorMedalla : null,
      puntuacionMaxima: Math.max(0, finiteNumber(source.puntuacionMaxima, 0)),
      resultadoUltimo: source.resultadoUltimo && typeof source.resultadoUltimo === 'object' ? clone(source.resultadoUltimo) : null,
    };
  }

  if (value.escenarioActivo && typeof value.escenarioActivo === 'object') {
    const scenario = definition.escenarios.find((candidate) => candidate.id === value.escenarioActivo.escenarioId);
    if (scenario) {
      const objectives = [...scenario.objetivosPrimarios, ...scenario.objetivosSecundarios];
      base.escenarioActivo = {
        escenarioId: scenario.id,
        intento: Math.max(1, nonNegativeInteger(value.escenarioActivo.intento)),
        objetivos: Object.fromEntries(
          objectives.map((objective) => [
            objective.id,
            clamp(finiteNumber(value.escenarioActivo.objetivos?.[objective.id], 0), 0, objective.objetivo),
          ]),
        ),
      };
    }
  }
  return base;
}

function validateCampaignDefinition(definition) {
  if (!definition || typeof definition.id !== 'string' || !Array.isArray(definition.escenarios)) {
    throw new TypeError('Definicion de campaña invalida.');
  }
  const ids = new Set();
  for (const scenario of definition.escenarios) {
    if (!scenario.id || ids.has(scenario.id)) throw new RangeError('Cada escenario requiere un id unico.');
    ids.add(scenario.id);
    if (!Array.isArray(scenario.objetivosPrimarios) || !Array.isArray(scenario.objetivosSecundarios)) {
      throw new TypeError(`Objetivos invalidos en ${scenario.id}.`);
    }
  }
  for (const scenario of definition.escenarios) {
    if (scenario.requisito && !ids.has(scenario.requisito)) throw new RangeError(`Requisito desconocido: ${scenario.requisito}.`);
  }
}

function validateStorage(storage) {
  if (storage == null) return;
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    if (typeof storage[method] !== 'function') throw new TypeError(`El adaptador necesita ${method}().`);
  }
}

function objectivesComplete(objectives, active) {
  return objectives.every((objective) => (active.objetivos[objective.id] ?? 0) >= objective.objetivo);
}

function calculateMedal(scenario, { secondariesComplete, durationSeconds, casualties }) {
  if (!secondariesComplete) return 'bronce';
  const gold = scenario.medallas?.oro ?? {};
  if (
    durationSeconds <= (gold.tiempoMaximo ?? Infinity) &&
    casualties <= (gold.bajasMaximas ?? Infinity)
  ) {
    return 'oro';
  }
  return 'plata';
}

function applyReward(progress, reward = {}) {
  progress.prestigio += Math.max(0, finiteNumber(reward.prestigio, 0));
  for (const [resource, amount] of Object.entries(reward.inventario ?? {})) {
    progress.inventario[resource] = (progress.inventario[resource] ?? 0) + Math.max(0, finiteNumber(amount, 0));
  }
  progress.desbloqueos = uniqueStrings([...progress.desbloqueos, ...(reward.desbloqueos ?? [])]);
}

function normalizeFaction(value) {
  if (typeof value === 'string') return { id: value, nombre: value, influencia: 100 };
  if (!value || typeof value.id !== 'string') throw new TypeError('Faccion invalida.');
  return {
    id: value.id,
    nombre: typeof value.nombre === 'string' ? value.nombre : value.id,
    influencia: Math.max(0, finiteNumber(value.influencia, 100)),
  };
}

function normalizeDiplomacyState(value) {
  if (!value || typeof value !== 'object') throw new TypeError('Estado diplomatico invalido.');
  const factions = Object.values(value.facciones ?? {}).map(normalizeFaction);
  if (factions.length < 2) throw new TypeError('El estado diplomatico requiere dos facciones.');
  const normalized = {
    version: DIPLOMACY_SCHEMA_VERSION,
    turno: nonNegativeInteger(value.turno),
    secuencia: nonNegativeInteger(value.secuencia),
    facciones: Object.fromEntries(factions.map((faction) => [faction.id, faction])),
    relaciones: {},
    enfriamientos: normalizeNumericRecord(value.enfriamientos),
    historial: Array.isArray(value.historial) ? clone(value.historial) : [],
  };
  for (let index = 0; index < factions.length; index += 1) {
    for (let other = index + 1; other < factions.length; other += 1) {
      const key = pairKey(factions[index].id, factions[other].id);
      const source = value.relaciones?.[key] ?? {};
      normalized.relaciones[key] = {
        disposicion: normalizeDisposition(source.disposicion ?? 'neutral'),
        reputacion: clamp(finiteNumber(source.reputacion, 0), -100, 100),
        tratados: Array.isArray(source.tratados)
          ? source.tratados
              .filter((treaty) => treaty && typeof treaty.id === 'string' && DIPLOMACY_ACTIONS[treaty.tipo])
              .map((treaty) => ({
                id: treaty.id,
                tipo: treaty.tipo,
                firmantes: [factions[index].id, factions[other].id],
                estado: ['activo', 'expirado', 'roto'].includes(treaty.estado) ? treaty.estado : 'expirado',
                iniciadoEnTurno: nonNegativeInteger(treaty.iniciadoEnTurno),
                expiraEnTurno: nonNegativeInteger(treaty.expiraEnTurno),
                ...(treaty.finalizadoEnTurno == null
                  ? {}
                  : { finalizadoEnTurno: nonNegativeInteger(treaty.finalizadoEnTurno) }),
              }))
          : [],
      };
    }
  }
  return normalized;
}

function normalizeDisposition(value) {
  if (!['neutral', 'aliado', 'enemigo'].includes(value)) throw new RangeError(`Disposicion invalida: ${String(value)}.`);
  return value;
}

function pairKey(a, b) {
  return [a, b].sort().join('::');
}

function cooldownKey(actorId, targetId, actionId) {
  return `${actorId}::${targetId}::${actionId}`;
}

function parseSerialized(serialized, label) {
  if (typeof serialized !== 'string') throw new TypeError(`El ${label} debe ser una cadena JSON.`);
  try {
    return JSON.parse(serialized);
  } catch {
    throw new SyntaxError(`No se pudo leer el ${label}.`);
  }
}

function normalizeNumericRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, amount]) => Number.isFinite(amount))
      .map(([key, amount]) => [key, Math.max(0, amount)]),
  );
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string'))];
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export default createCampaign;
