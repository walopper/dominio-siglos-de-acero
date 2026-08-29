/**
 * Puente determinista entre las recompensas persistentes de campaña y una
 * simulación nueva. El progreso se trata como una entrada de sólo lectura.
 */

export const CAMPAIGN_BONUS_VERSION = 1;

const INVENTORY_CONVERSIONS = Object.freeze({
  planos: Object.freeze({ resource: 'conocimiento', multiplier: 50, label: 'planos de ingeniería' }),
  suministros: Object.freeze({ resource: 'alimentos', multiplier: 1, label: 'suministros de campaña' }),
  acero: Object.freeze({ resource: 'acero', multiplier: 1, label: 'reservas de acero' }),
  energia: Object.freeze({ resource: 'energia', multiplier: 1, label: 'reservas energéticas' }),
  helio3: Object.freeze({ resource: 'energia', multiplier: 2, label: 'helio-3' }),
});

export const CAMPAIGN_UNLOCK_BONUSES = deepFreeze({
  'ingenieros-ferroviarios': {
    name: 'Ingenieros ferroviarios',
    explanation: 'La experiencia de obra acelera un 12% a los obreros iniciales.',
    stats: [{ target: 'workers', speed: 0.12 }],
  },
  'locomotora-blindada': {
    name: 'Locomotora blindada',
    explanation: 'El blindaje ferroviario aporta 8% de vida y 1 punto de armadura a las unidades terrestres.',
    stats: [{ target: 'land-units', health: 0.08, armor: 1 }],
  },
  'doctrina-armas-combinadas': {
    name: 'Doctrina de armas combinadas',
    explanation: 'La coordinación entre armas aumenta un 10% el ataque de las unidades.',
    stats: [{ target: 'units', attack: 0.1 }],
  },
  'observadores-aereos': {
    name: 'Observadores aéreos',
    explanation: 'El reconocimiento avanzado aumenta un 18% la visión de las unidades.',
    stats: [{ target: 'units', vision: 0.18 }],
  },
  'cadena-logistica-mecanizada': {
    name: 'Cadena logística mecanizada',
    explanation: 'El abastecimiento móvil aumenta un 8% la velocidad de las unidades.',
    stats: [{ target: 'units', speed: 0.08 }],
  },
  'arquitectura-red-resiliente': {
    name: 'Arquitectura de red resiliente',
    explanation: 'La red distribuida aporta 160 unidades de energía inicial.',
    resources: { energia: 160 },
  },
  'defensa-de-enjambre': {
    name: 'Defensa de enjambre',
    explanation: 'Los protocolos predictivos aportan 10% de visión y 8% de ataque a las unidades.',
    stats: [{ target: 'units', vision: 0.1, attack: 0.08 }],
  },
  'microred-autonoma': {
    name: 'Microred autónoma',
    explanation: 'La generación descentralizada aporta 240 unidades de energía inicial.',
    resources: { energia: 240 },
  },
  'blindaje-reactivo': {
    name: 'Blindaje reactivo',
    explanation: 'Las unidades comienzan con 12% más de vida y 2 puntos adicionales de armadura.',
    stats: [{ target: 'units', health: 0.12, armor: 2 }],
  },
  'victoria-la-forja-del-porvenir': {
    name: 'Victoria: La Forja del Porvenir',
    explanation: 'La experiencia de la campaña se convierte en 120 unidades de conocimiento.',
    resources: { conocimiento: 120 },
  },
  'arquitectos-del-horizonte': {
    name: 'Arquitectos del Horizonte',
    explanation: 'La construcción orbital aporta 15% de vida y 2 puntos de armadura a los edificios iniciales.',
    stats: [{ target: 'buildings', health: 0.15, armor: 2 }],
  },
});

/**
 * Aplica una única vez las recompensas acumuladas al estado mutable de una
 * simulación recién creada. Una segunda llamada devuelve el mismo recibo sin
 * volver a modificar recursos ni entidades.
 */
export function applyCampaignBonuses(state, progress = {}) {
  const { localTeamId, team } = assertSimulationState(state);
  if (state.mission?.campaignBonuses?.applied === true) return state.mission.campaignBonuses;
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) {
    throw new TypeError('El progreso de campaña debe ser un objeto.');
  }

  const source = normalizeProgress(progress);
  const resourceBonuses = {};
  const explanations = [];
  const ignoredInventory = [];

  const prestigeKnowledge = Math.floor(source.prestigio / 5);
  if (prestigeKnowledge > 0) {
    addResource(resourceBonuses, 'conocimiento', prestigeKnowledge);
    explanations.push(`${formatNumber(source.prestigio)} de prestigio aportan ${formatNumber(prestigeKnowledge)} de conocimiento.`);
  }

  for (const [inventoryId, amount] of Object.entries(source.inventario)) {
    const conversion = INVENTORY_CONVERSIONS[inventoryId];
    if (!conversion) {
      ignoredInventory.push(inventoryId);
      continue;
    }
    const converted = round(amount * conversion.multiplier);
    if (converted <= 0) continue;
    addResource(resourceBonuses, conversion.resource, converted);
    explanations.push(`${formatNumber(amount)} de ${conversion.label} aportan ${formatNumber(converted)} de ${conversion.resource}.`);
  }

  const unlockedBonuses = [];
  const ignoredUnlocks = [];
  const statRules = [];
  for (const unlockId of source.desbloqueos) {
    const definition = CAMPAIGN_UNLOCK_BONUSES[unlockId];
    if (!definition) {
      ignoredUnlocks.push(unlockId);
      continue;
    }
    for (const [resource, amount] of Object.entries(definition.resources ?? {})) {
      addResource(resourceBonuses, resource, amount);
    }
    for (const stats of definition.stats ?? []) statRules.push({ unlockId, ...stats });
    unlockedBonuses.push({ id: unlockId, name: definition.name, explanation: definition.explanation });
    explanations.push(definition.explanation);
  }

  for (const [resource, amount] of Object.entries(resourceBonuses)) {
    if (!Object.hasOwn(team.recursos, resource)) continue;
    team.recursos[resource] = round(finite(team.recursos[resource]) + amount);
  }

  const modifiers = applyStatRules(state.entities, localTeamId, statRules);
  const receipt = {
    version: CAMPAIGN_BONUS_VERSION,
    applied: true,
    source,
    resources: resourceBonuses,
    modifiers,
    unlocks: unlockedBonuses,
    ignoredUnlocks,
    ignoredInventory,
    explanations,
  };
  if (!state.mission || typeof state.mission !== 'object' || Array.isArray(state.mission)) state.mission = {};
  state.mission.campaignBonuses = receipt;
  return receipt;
}

function assertSimulationState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('Se necesita un estado de simulación válido.');
  }
  const localTeamId = typeof state.localTeamId === 'string' ? state.localTeamId : 'player';
  const team = state.teams?.[localTeamId];
  if (!team || !team.recursos || typeof team.recursos !== 'object') {
    throw new TypeError('El estado no contiene un equipo local con recursos.');
  }
  if (!Array.isArray(state.entities)) throw new TypeError('El estado no contiene entidades de simulación.');
  return { localTeamId, team };
}

function normalizeProgress(progress) {
  const inventory = {};
  if (progress.inventario && typeof progress.inventario === 'object' && !Array.isArray(progress.inventario)) {
    for (const [id, value] of Object.entries(progress.inventario)) {
      const amount = finite(value);
      if (amount > 0) inventory[id] = amount;
    }
  }
  const unlocks = Array.isArray(progress.desbloqueos)
    ? [...new Set(progress.desbloqueos.filter((id) => typeof id === 'string' && id.length > 0))]
    : [];
  return {
    prestigio: Math.max(0, finite(progress.prestigio)),
    inventario: inventory,
    desbloqueos: unlocks,
  };
}

function applyStatRules(entities, teamId, rules) {
  const accumulators = new Map();
  for (const rule of rules) {
    for (const entity of entities) {
      if (entity.teamId !== teamId || entity.alive === false || !matchesTarget(entity, rule.target)) continue;
      const bonus = accumulators.get(entity) ?? { vision: 0, attack: 0, armor: 0, health: 0, speed: 0 };
      for (const key of Object.keys(bonus)) bonus[key] += finite(rule[key]);
      accumulators.set(entity, bonus);
    }
  }

  const impact = {
    vision: { affectedEntities: 0, totalIncrease: 0 },
    attack: { affectedEntities: 0, totalIncrease: 0 },
    armor: { affectedEntities: 0, totalIncrease: 0 },
    health: { affectedEntities: 0, totalMaxHpIncrease: 0, totalHpIncrease: 0 },
    speed: { affectedEntities: 0, totalIncrease: 0 },
  };
  for (const [entity, bonus] of accumulators) {
    applyScaledStat(entity, 'vision', bonus.vision, impact.vision);
    applyScaledStat(entity, 'attack', bonus.attack, impact.attack);
    applyFlatStat(entity, 'armor', bonus.armor, impact.armor);
    applyHealth(entity, bonus.health, impact.health);
    applyScaledStat(entity, 'speed', bonus.speed, impact.speed);
  }
  return impact;
}

function matchesTarget(entity, target) {
  if (target === 'units') return entity.kind === 'unit';
  if (target === 'workers') return entity.kind === 'unit' && entity.type === 'obrero';
  if (target === 'land-units') return entity.kind === 'unit' && entity.role !== 'aereo';
  if (target === 'buildings') return entity.kind === 'building';
  return false;
}

function applyScaledStat(entity, key, percent, impact) {
  if (percent <= 0 || !Number.isFinite(entity[key])) return;
  const before = entity[key];
  entity[key] = round(before * (1 + percent));
  impact.affectedEntities += 1;
  impact.totalIncrease = round(impact.totalIncrease + entity[key] - before);
}

function applyFlatStat(entity, key, amount, impact) {
  if (amount <= 0 || !Number.isFinite(entity[key])) return;
  entity[key] = round(entity[key] + amount);
  impact.affectedEntities += 1;
  impact.totalIncrease = round(impact.totalIncrease + amount);
}

function applyHealth(entity, percent, impact) {
  if (percent <= 0 || !Number.isFinite(entity.maxHp) || !Number.isFinite(entity.hp) || entity.maxHp <= 0) return;
  const beforeMax = entity.maxHp;
  const beforeHp = entity.hp;
  const healthRatio = beforeHp / beforeMax;
  entity.maxHp = round(beforeMax * (1 + percent));
  entity.hp = round(entity.maxHp * healthRatio);
  impact.affectedEntities += 1;
  impact.totalMaxHpIncrease = round(impact.totalMaxHpIncrease + entity.maxHp - beforeMax);
  impact.totalHpIncrease = round(impact.totalHpIncrease + entity.hp - beforeHp);
}

function addResource(resources, resource, amount) {
  const safeAmount = finite(amount);
  if (safeAmount <= 0) return;
  resources[resource] = round((resources[resource] ?? 0) + safeAmount);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(round(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
