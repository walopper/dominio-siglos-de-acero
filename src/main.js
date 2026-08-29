import * as THREE from 'three';
import { createWorld } from './world.js';
import {
  createSimulation,
  ERAS,
  UNIT_DEFINITIONS,
  BUILDING_DEFINITIONS,
  RESOURCE_DEFINITIONS,
  UNIT_STANCES,
} from './simulation.js';
import { createAudioDirector } from './audio.js';
import {
  CAMPAIGN,
  createCampaign,
  createDiplomacy,
  deserializeDiplomacyState,
} from './campaign.js';
import { configureScenarioState, createScenarioRuntime } from './scenario-runtime.js';
import { applyCampaignBonuses } from './campaign-bonuses.js';
import { TECHNOLOGIES, technologyAvailability } from './technology.js';

const $ = (id) => document.getElementById(id);
const assetUrl = (filename) => `${import.meta.env.BASE_URL}assets/${filename}`;
const canvas = $('game-canvas');
if (!canvas) throw new Error('No se encontró #game-canvas.');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa6b6b4, 0.0062);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 340);
const cameraTarget = new THREE.Vector3(-33, 0, 18);
let cameraDistance = 56;
let cameraYaw = Math.PI * 0.76;
let cameraPitch = 0.72;

const world = createWorld(THREE, scene, renderer, {
  size: 170,
  segments: 110,
  seed: 18002100,
  era: 1800,
  camera,
});
const simulation = createSimulation({ seed: 18002100, ai: true, difficulty: 'normal' });
const audio = createAudioDirector();
const MATCH_SAVE_KEY = 'dominio:archivo-estrategico:v1';
const storage = (() => {
  try {
    const probe = '__dominio_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
})();
const campaign = createCampaign({ storage, autoLoad: Boolean(storage) });

function createInitialDiplomacy() {
  return createDiplomacy({
    factions: [
      { id: 'aurora', nombre: 'Confederación Aurora', influencia: 180 },
      { id: 'liga-atlantica', nombre: 'Liga Atlántica', influencia: 140 },
      { id: 'directorio-danubio', nombre: 'Directorio del Danubio', influencia: 125 },
      { id: 'pacto-hierro', nombre: 'Pacto de Hierro', influencia: 95 },
    ],
    initialRelations: [
      { a: 'aurora', b: 'liga-atlantica', disposicion: 'aliado', reputacion: 74 },
      { a: 'aurora', b: 'directorio-danubio', disposicion: 'neutral', reputacion: 12 },
      { a: 'aurora', b: 'pacto-hierro', disposicion: 'enemigo', reputacion: -86 },
    ],
  });
}

let diplomacy = createInitialDiplomacy();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const entityVisuals = new Map();
const resourceVisuals = new Map();
const controlVisuals = new Map();
const simulationEffectsSeen = new Set();
const keys = new Set();
const controlGroups = new Map();
const fogGeometry = new THREE.PlaneGeometry(4.35, 4.35);
fogGeometry.rotateX(-Math.PI / 2);
const unexploredFog = new THREE.InstancedMesh(fogGeometry, new THREE.MeshBasicMaterial({
  color: 0x020607,
  transparent: true,
  opacity: 0.76,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
}), 1200);
const exploredFog = new THREE.InstancedMesh(fogGeometry, new THREE.MeshBasicMaterial({
  color: 0x132329,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
}), 1200);
[unexploredFog, exploredFog].forEach((mesh) => {
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
});
let started = false;
let lastFrame = performance.now();
let lastStateVersion = -1;
let lastEventId = 0;
let deterministicUntil = 0;
let buildMode = null;
let commandMode = null;
let pointerDown = null;
let hovered = null;
let gameState = simulation.getRenderState();
let minimapMode = 'normal';
let resultShown = false;
let resourceRateSample = null;
let controlsReturnFocus = null;
let campaignReturnFocus = null;
let selectedScenarioId = campaign.getActiveScenario()?.escenario.id || CAMPAIGN.escenarios[0].id;
let scenarioRuntime = null;
let campaignResultHandled = false;
let latestCampaignResult = null;
let campaignStartingUnits = 0;
let lastDiplomacyTurn = 0;
let lastAutosaveSecond = 0;
let lastActionSignature = '';
let lastControlGroupRecall = { index: null, time: -Infinity };

const ENTITY_KIND_MAP = {
  cuartelGeneral: 'centro', vivienda: 'vivienda', cuartel: 'cuartel', fabrica: 'fabrica',
  universidad: 'fundicion', central: 'fabrica', bastion: 'hangar', obrero: 'infanteria',
  fusilero: 'infanteria', caballeria: 'vehiculo', artilleria: 'artilleria', tanque: 'tanque',
  dron: 'dron', exotraje: 'infanteria', caminante: 'tanque',
};

const ERA_YEARS = [1800, 1900, 2000, 2100];
const RESOURCE_GLYPHS = { alimentos: '◆', madera: '♣', acero: '⬡', energia: 'ϟ', conocimiento: '◈' };
const TEAM_COLORS = { player: 0x38bdf8, rival: 0xef4444 };
const activeShowcase = import.meta.env.DEV ? new URLSearchParams(location.search).get('showcase') : null;

function updateCameraPosition() {
  const horizontal = Math.cos(cameraPitch) * cameraDistance;
  camera.position.set(
    cameraTarget.x + Math.sin(cameraYaw) * horizontal,
    cameraTarget.y + Math.sin(cameraPitch) * cameraDistance,
    cameraTarget.z + Math.cos(cameraYaw) * horizontal,
  );
  camera.lookAt(cameraTarget);
  controlVisuals.forEach((visual) => {
    if (visual.userData.label) visual.userData.label.visible = cameraDistance > 34 && activeShowcase !== 'combat';
  });
}
updateCameraPosition();

function makeLabel(text, color = '#f5e6c8') {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 128;
  const ctx = labelCanvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(8, 16, 18, .84)';
  ctx.strokeStyle = 'rgba(206, 163, 85, .72)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(10, 18, 492, 86, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '600 35px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), 256, 62, 460);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(7.4, 1.85, 1);
  sprite.userData.labelTexture = texture;
  return sprite;
}

function createResourceTreeGeometry() {
  const positions = [
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
    0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5,
  ];
  const uv = [0, 0.5, 0.5, 0.5, 0.5, 1, 0, 1];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([...uv, ...uv], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return geometry;
}

const resourceTreeTexture = new THREE.TextureLoader().load(assetUrl('foliage-chroma-atlas-v1.png'));
resourceTreeTexture.colorSpace = THREE.SRGBColorSpace;
resourceTreeTexture.generateMipmaps = false;
resourceTreeTexture.minFilter = THREE.LinearFilter;
const resourceTreeMaterial = new THREE.MeshStandardMaterial({
  map: resourceTreeTexture,
  color: 0xb9bca0,
  roughness: 0.96,
  metalness: 0,
  side: THREE.DoubleSide,
});
resourceTreeMaterial.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    `#ifdef USE_MAP
      vec4 sampledDiffuseColor = texture2D(map, vMapUv);
      float edgeSpill = step(sampledDiffuseColor.g * 1.1, sampledDiffuseColor.r)
                      * step(sampledDiffuseColor.g * 0.74, sampledDiffuseColor.b);
      if (edgeSpill > 0.5) discard;
      diffuseColor *= sampledDiffuseColor;
    #endif`,
  );
};
resourceTreeMaterial.customProgramCacheKey = () => 'resource-foliage-chroma-lit-v2';
const resourceTreeGeometry = createResourceTreeGeometry();

const environmentPropsTexture = new THREE.TextureLoader().load(assetUrl('environment-props-atlas-v1.png'));
environmentPropsTexture.colorSpace = THREE.SRGBColorSpace;
environmentPropsTexture.generateMipmaps = false;
environmentPropsTexture.minFilter = THREE.LinearFilter;
environmentPropsTexture.magFilter = THREE.LinearFilter;
environmentPropsTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

function environmentAtlasRect(row, column) {
  const v0 = (3 - row) * 0.25;
  return new THREE.Vector4(column * 0.25, v0, (column + 1) * 0.25, v0 + 0.25);
}

function createEnvironmentAtlasMaterial(row, column) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: environmentPropsTexture },
      uRect: { value: environmentAtlasRect(row, column) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uAtlas;
      uniform vec4 uRect;
      varying vec2 vUv;
      float isChroma(vec3 color) {
        float magenta = min(color.r, color.b) - color.g;
        return step(0.3, min(color.r, color.b)) * step(0.105, magenta);
      }
      void main() {
        vec2 atlasUv = mix(uRect.xy, uRect.zw, vUv);
        vec4 sampled = texture2D(uAtlas, atlasUv);
        if (isChroma(sampled.rgb) > 0.5) {
          vec2 pixel = vec2(0.0016);
          float edge = 0.0;
          edge += 1.0 - isChroma(texture2D(uAtlas, atlasUv + vec2(pixel.x, 0.0)).rgb);
          edge += 1.0 - isChroma(texture2D(uAtlas, atlasUv - vec2(pixel.x, 0.0)).rgb);
          edge += 1.0 - isChroma(texture2D(uAtlas, atlasUv + vec2(0.0, pixel.y)).rgb);
          edge += 1.0 - isChroma(texture2D(uAtlas, atlasUv - vec2(0.0, pixel.y)).rgb);
          if (edge < 0.5) discard;
          gl_FragColor = vec4(0.075, 0.078, 0.07, 1.0);
          return;
        }
        gl_FragColor = vec4(sampled.rgb * 1.1, 1.0);
      }
    `,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
  });
}

function createResourceVisual(node) {
  const group = new THREE.Group();
  group.userData.resourceNodeId = node.id;
  group.userData.interactive = true;
  const row = simulation.state.teams.player.era;
  const column = node.resource === 'alimentos' ? 2 : ['energia', 'conocimiento'].includes(node.resource) ? 3 : 1;
  const dimensions = column === 3 ? [6.4, 4.5] : [5.8, 4.35];
  const geometry = new THREE.PlaneGeometry(...dimensions);
  geometry.translate(0, dimensions[1] * 0.5, 0);
  const atlas = new THREE.Mesh(geometry, createEnvironmentAtlasMaterial(row, column));
  atlas.userData.environmentResourceAtlas = true;
  atlas.userData.resourceNodeId = node.id;
  atlas.renderOrder = 1;
  group.userData.atlas = atlas;
  group.userData.atlasColumn = column;
  group.add(atlas);
  group.position.set(node.x, world.heightAt(node.x, node.z), node.z);
  group.traverse((child) => {
    if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; child.userData.resourceNodeId = node.id; }
  });
  scene.add(group);
  resourceVisuals.set(node.id, group);
}

function createControlVisual(point) {
  const group = new THREE.Group();
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xd2b16a, emissive: 0x4d3514, emissiveIntensity: 0.65, metalness: 0.72, roughness: 0.25 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(point.radius, 0.14, 10, 64), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  const center = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 0.3, 24), new THREE.MeshStandardMaterial({
    color: 0x4a5352, emissive: 0x151c1c, emissiveIntensity: 0.72, metalness: 0.62, roughness: 0.38,
  }));
  center.position.y = 0.15;
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.76, 0.9, 0.37, 16),
    new THREE.MeshStandardMaterial({ color: 0xb9924f, emissive: 0x493213, emissiveIntensity: 0.64, metalness: 0.8, roughness: 0.28 }),
  );
  core.position.y = 0.28;
  const beacon = new THREE.PointLight(0xd2b16a, 2.2, 16, 2);
  beacon.position.y = 2.5;
  const label = makeLabel(point.nombre);
  label.position.y = 5;
  group.add(ring, center, core, beacon, label);
  group.position.set(point.x, world.heightAt(point.x, point.z) + 0.12, point.z);
  group.userData.ring = ring;
  group.userData.beacon = beacon;
  group.userData.label = label;
  scene.add(group);
  controlVisuals.set(point.id, group);
}

function syncStaticMap(state) {
  const visibleResources = new Set(state.resourceNodes.map((node) => node.id));
  resourceVisuals.forEach((visual, id) => {
    if (!visibleResources.has(id)) visual.visible = false;
  });
  state.resourceNodes.forEach((node) => {
    if (!resourceVisuals.has(node.id)) createResourceVisual(node);
    const visual = resourceVisuals.get(node.id);
    visual.visible = node.amount > 0;
    visual.scale.setScalar(Math.max(0.35, Math.sqrt(node.amount / node.maxAmount)));
    const atlas = visual.userData.atlas;
    if (atlas?.material?.uniforms?.uRect) {
      atlas.material.uniforms.uRect.value.copy(environmentAtlasRect(state.teams.player.era, visual.userData.atlasColumn));
      atlas.quaternion.copy(camera.quaternion);
    }
  });
  state.controlPoints.forEach((point) => {
    if (!controlVisuals.has(point.id)) createControlVisual(point);
    const visual = controlVisuals.get(point.id);
    visual.visible = activeShowcase !== 'combat';
    const color = point.ownerId ? TEAM_COLORS[point.ownerId] : 0xd2b16a;
    visual.userData.ring.material.color.setHex(color);
    visual.userData.ring.material.emissive.setHex(color);
    visual.userData.beacon.color.setHex(color);
  });
}

function createEntityVisual(entity, state) {
  const isBuilding = entity.kind === 'building';
  const options = {
    type: ENTITY_KIND_MAP[entity.type] || (isBuilding ? 'centro' : 'infanteria'),
    simulationType: entity.type,
    era: ERA_YEARS[state.teams[entity.teamId].era],
    teamColor: TEAM_COLORS[entity.teamId],
    position: [entity.x, entity.y || 0, entity.z],
    rotation: entity.rotation,
    health: entity.hp,
    scale: isBuilding ? 1 : entity.type === 'dron' ? 1.1 : 1.18,
  };
  const visual = isBuilding ? world.createBuilding(options) : world.createUnit(options);
  visual.userData.simulationId = entity.id;
  visual.userData.teamId = entity.teamId;
  visual.userData.kind = entity.type;
  visual.traverse((child) => { child.userData.simulationId = entity.id; });
  if (isBuilding) visual.scale.setScalar(Math.max(0.01, entity.buildProgress));
  entityVisuals.set(entity.id, visual);
  return visual;
}

function syncEntities(state) {
  const live = new Set(state.entities.map((entity) => entity.id));
  entityVisuals.forEach((visual, id) => {
    if (!live.has(id)) {
      world.removeEntity(visual);
      entityVisuals.delete(id);
    }
  });
  for (const entity of state.entities) {
    const visual = entityVisuals.get(entity.id) || createEntityVisual(entity, state);
    visual.userData.teamId = entity.teamId;
    const fly = entity.type === 'dron' ? 3.2 : 0;
    const y = world.heightAt(entity.x, entity.z) + fly;
    visual.position.lerp(new THREE.Vector3(entity.x, y, entity.z), 0.34);
    visual.rotation.y = entity.rotation;
    if (entity.kind === 'building') {
      const scale = entity.complete ? 1 : Math.max(0.08, entity.buildProgress);
      visual.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.18);
    }
    const selected = state.selectedIds.includes(entity.id);
    const orderTarget = entity.currentOrder?.targetId
      ? state.entities.find((candidate) => candidate.id === entity.currentOrder.targetId)
      : entity.currentOrder;
    world.updateEntity(visual, {
      health: entity.hp,
      maxHealth: entity.maxHp,
      action: entity.action,
      cargo: entity.cargo,
      targetPosition: orderTarget?.x != null ? [orderTarget.x, world.heightAt(orderTarget.x, orderTarget.z), orderTarget.z] : null,
      material: entity.kind === 'building' ? 'hormigon' : ['tanque', 'artilleria', 'caminante'].includes(entity.type) ? 'metal' : 'tierra',
    });
    world.setSelected(visual, selected, { color: entity.teamId === 'player' ? 0x54d6ff : 0xff675d, radius: entity.radius * 1.22 });
  }
}

function syncCombatEffects(state) {
  for (const effect of state.effects) {
    if (simulationEffectsSeen.has(effect.id)) continue;
    simulationEffectsSeen.add(effect.id);
    const effectPosition = effect.to || effect.position || effect.from;
    const attackerEntity = state.entities.find((entity) => entity.id === effect.attackerId);
    const targetEntity = state.entities.find((entity) => entity.id === effect.targetId)
      || state.entities
        .filter((entity) => Math.hypot(entity.x - effectPosition.x, entity.z - effectPosition.z) < entity.radius + 0.8)
        .sort((a, b) => Math.hypot(a.x - effectPosition.x, a.z - effectPosition.z) - Math.hypot(b.x - effectPosition.x, b.z - effectPosition.z))[0];
    const attackerVisual = entityVisuals.get(effect.attackerId) || (attackerEntity ? createEntityVisual(attackerEntity, state) : null);
    const targetVisual = entityVisuals.get(effect.targetId) || (targetEntity ? createEntityVisual(targetEntity, state) : null);
    const era = state.teams[effect.teamId]?.era ?? 0;
    const targetType = targetEntity?.type || effect.targetType;
    const targetKind = targetEntity?.kind || effect.targetKind;
    const material = targetKind === 'building'
      ? 'hormigon'
      : ['tanque', 'artilleria', 'caminante', 'dron'].includes(targetType) ? 'metal' : 'tierra';
    const from = [effect.from.x, world.heightAt(effect.from.x, effect.from.z) + effect.from.y, effect.from.z];
    const to = [effectPosition.x, world.heightAt(effectPosition.x, effectPosition.z) + Math.min(effectPosition.y || 0, 1.6), effectPosition.z];

    if (effect.type === 'destruccion') {
      if (!simulationEffectsSeen.has(effect.sourceEffectId)) {
        if (targetVisual) {
          world.playHitFeedback(targetVisual, {
            eventId: `${effect.id}:hit`,
            incoming: { x: effectPosition.x - effect.from.x, y: (effectPosition.y || 0) - effect.from.y, z: effectPosition.z - effect.from.z },
            weaponClass: effect.weaponClass,
            damageRatio: 1,
            healthRatio: 0,
            lethal: true,
            material,
          });
        } else {
          world.createImpact({ position: to, material, power: targetKind === 'building' ? 2.8 : 1.6 });
        }
      }
      audio.play('explosion');
      continue;
    }

    const power = Math.max(0.35, (effect.damage || 10) / 24);
    if (attackerVisual) {
      world.playAttackFeedback(attackerVisual, {
        eventId: effect.id,
        weaponClass: effect.weaponClass,
        power,
        targetPosition: effect.to,
      });
    }
    if (targetVisual) {
      const targetMaxHealth = targetEntity?.maxHp || targetVisual.userData.maxHealth || effect.damage || 1;
      world.playHitFeedback(targetVisual, {
        eventId: `${effect.id}:hit`,
        incoming: { x: effect.to.x - effect.from.x, y: effect.to.y - effect.from.y, z: effect.to.z - effect.from.z },
        weaponClass: effect.weaponClass,
        damageRatio: (effect.damage || 1) / Math.max(1, targetMaxHealth),
        healthRatio: effect.targetHealthRatio,
        lethal: effect.lethal,
        material,
      });
    }
    audio.play(effect.weaponClass === 'shell' ? 'explosion' : 'shot');

    if (effect.type === 'impacto' || effect.weaponClass === 'melee') {
      world.createImpact({ position: to, material, power: Math.max(0.35, power * 0.5) });
    } else {
      world.createProjectile({
        from,
        to,
        kind: effect.weaponClass === 'shell' ? 'shell' : effect.weaponClass === 'energy' || era >= 2 ? 'energy' : 'tracer',
        material,
        duration: effect.duration,
        power: effect.weaponClass === 'shell' ? Math.max(1.2, power) : effect.weaponClass === 'energy' ? Math.max(0.8, power * 0.75) : Math.max(0.48, power * 0.55),
        arc: effect.weaponClass === 'shell' ? Math.min(7, Math.hypot(effect.to.x - effect.from.x, effect.to.z - effect.from.z) * 0.2) : 0,
      });
    }
  }
  if (simulationEffectsSeen.size > 6000) simulationEffectsSeen.clear();
}

function formatResource(value) {
  return Math.floor(value).toLocaleString('es-AR');
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function formatClock(seconds) {
  return new Date(Math.max(0, seconds) * 1000).toISOString().slice(14, 19);
}

function hasMatchSave() {
  try { return Boolean(storage?.getItem(MATCH_SAVE_KEY)); } catch { return false; }
}

function setSaveStatus(message, available = hasMatchSave()) {
  const status = $('campaign-save-status');
  if (status) status.innerHTML = `<span aria-hidden="true"></span> ${message}`;
  const continueButton = $('continue-game-btn');
  if (continueButton) continueButton.disabled = !available;
  if ($('campaign-load-btn')) $('campaign-load-btn').disabled = !available;
}

function clearMatchSave() {
  try {
    storage?.removeItem(MATCH_SAVE_KEY);
  } catch {
    // El progreso de campaña usa su propio registro y sigue siendo recuperable.
  }
  setSaveStatus('Sin operación pendiente', false);
}

function saveCampaignProgress() {
  if (started && simulation.getRenderState().mode !== 'finalizado') return saveStrategicArchive();
  const result = campaign.save();
  if (!result.ok) {
    notify('El navegador bloqueó el almacenamiento local.', 'danger');
    return false;
  }
  setSaveStatus(hasMatchSave() ? 'Registro local disponible' : 'Progreso de campaña sincronizado');
  notify('El progreso de la campaña quedó guardado.', 'success', 'Archivo estratégico');
  return true;
}

function scenarioById(id) {
  return CAMPAIGN.escenarios.find((scenario) => scenario.id === id) || CAMPAIGN.escenarios[0];
}

function renderCampaignArchive() {
  const scenarios = campaign.listScenarios();
  const selected = scenarios.find((scenario) => scenario.id === selectedScenarioId && scenario.estado !== 'bloqueado')
    || scenarios.find((scenario) => scenario.estado === 'en-curso')
    || scenarios.find((scenario) => scenario.estado !== 'bloqueado')
    || scenarios[0];
  selectedScenarioId = selected.id;
  const completed = scenarios.filter((scenario) => scenario.progreso.victoria).length;
  const progress = $('campaign-progress');
  if (progress) {
    progress.setAttribute('aria-valuenow', String(completed));
    progress.style.setProperty('--campaign-progress', `${Math.max(8, completed / scenarios.length * 100)}%`);
  }
  setText('campaign-progress-label', `${String(completed).padStart(2, '0')} / ${String(scenarios.length).padStart(2, '0')}`);

  document.querySelectorAll('.operation-file').forEach((button, index) => {
    const scenario = scenarios[index];
    if (!scenario) return;
    const locked = scenario.estado === 'bloqueado';
    button.dataset.operation = scenario.id;
    button.dataset.state = locked ? 'locked' : scenario.estado;
    button.disabled = locked;
    button.setAttribute('aria-disabled', String(locked));
    button.classList.toggle('is-locked', locked);
    button.classList.toggle('is-current', scenario.id === selected.id);
    button.toggleAttribute('aria-current', scenario.id === selected.id);
    const copy = button.querySelector('.operation-file__copy');
    if (copy) copy.innerHTML = `<small>Operación ${index + 1} · ${scenario.era}</small><strong>${scenario.nombre}</strong><em>${scenario.briefing.lugar}</em>`;
    const medalRank = { oro: 3, plata: 2, bronce: 1 }[scenario.progreso.mejorMedalla] || 0;
    const medals = button.querySelector('.operation-file__medals');
    if (medals) medals.innerHTML = [0, 1, 2].map((rank) => `<i class="${rank < medalRank ? 'is-earned' : ''}"></i>`).join('');
  });

  const article = $('operation-briefing');
  if (article) article.dataset.activeOperation = selected.id;
  setText('campaign-briefing', `${selected.briefing.situacion} ${selected.briefing.inteligencia} ${selected.briefing.orden}`);
  const heading = document.querySelector('.briefing-copy__header h3');
  if (heading) heading.textContent = selected.nombre;
  const era = document.querySelector('.briefing-era');
  if (era) era.innerHTML = `${selected.era}<br><b>${selected.anio}</b>`;
  setText('campaign-progress-label', `${String(completed).padStart(2, '0')} / ${String(scenarios.length).padStart(2, '0')}`);
  const plateYear = document.querySelector('.briefing-plate__year');
  if (plateYear) plateYear.textContent = String(selected.anio);

  const active = campaign.getActiveScenario();
  const activeValues = active?.escenario.id === selected.id ? active.sesion.objetivos : {};
  const objectiveList = $('campaign-objectives');
  if (objectiveList) {
    objectiveList.replaceChildren(...[...selected.objetivosPrimarios, ...selected.objetivosSecundarios].map((objective, index) => {
      const item = document.createElement('li');
      const secondary = index >= selected.objetivosPrimarios.length;
      const value = activeValues[objective.id] || 0;
      item.dataset.objective = objective.id;
      item.dataset.objectiveState = secondary ? 'optional' : 'required';
      item.innerHTML = `<span>${String(index + 1).padStart(2, '0')}</span><p><strong>${objective.descripcion}</strong><small>${value} / ${objective.objetivo} ${objective.unidad}</small></p><em>${secondary ? 'Medalla' : 'Principal'}</em>`;
      return item;
    }));
  }
  const campaignComplete = completed === scenarios.length;
  const continueButton = $('campaign-continue-btn');
  if (continueButton) continueButton.innerHTML = `<span class="archive-button__index">D-${String(scenarios.indexOf(selected) + 1).padStart(2, '0')}</span><b>${campaignComplete || selected.estado === 'completado' ? 'Repetir operación' : selected.estado === 'en-curso' ? 'Reiniciar operación' : 'Iniciar operación'}</b><small>${selected.nombre} · ${selected.anio}</small><i aria-hidden="true">→</i>`;
  const earnedMedals = { oro: 3, plata: 2, bronce: 1 }[selected.progreso.mejorMedalla] || 0;
  setText('mission-medal-count', `${earnedMedals} / 3`);
  document.querySelectorAll('#mission-medals .mission-medal').forEach((medal, index) => medal.classList.toggle('is-earned', index < earnedMedals));
  setSaveStatus(
    campaignComplete ? 'Campaña completada · Archivo total' : hasMatchSave() ? 'Registro local disponible' : 'Sin operación pendiente',
    hasMatchSave(),
  );
}

function openCampaignArchive(trigger = document.activeElement) {
  campaignReturnFocus = trigger instanceof HTMLElement ? trigger : null;
  renderCampaignArchive();
  const overlay = $('campaign-overlay');
  if (!overlay) return;
  overlay.hidden = false;
  requestAnimationFrame(() => document.querySelector('.operation-file.is-current')?.focus());
}

function closeCampaignArchive() {
  const overlay = $('campaign-overlay');
  if (!overlay || overlay.hidden) return false;
  if (started && simulation.getRenderState().mode === 'finalizado') {
    location.reload();
    return true;
  }
  overlay.hidden = true;
  campaignReturnFocus?.focus?.();
  campaignReturnFocus = null;
  return true;
}

function clearEntityVisuals() {
  entityVisuals.forEach((visual) => world.removeEntity(visual));
  entityVisuals.clear();
  simulationEffectsSeen.clear();
  lastStateVersion = -1;
  lastEventId = 0;
  resourceRateSample = null;
  lastActionSignature = '';
  resultShown = false;
  ['victory-overlay', 'defeat-overlay'].forEach((id) => {
    const overlay = $(id);
    if (!overlay) return;
    overlay.hidden = true;
    overlay.classList.add('is-hidden');
    overlay.classList.remove('is-visible');
  });
}

function clearControlVisuals() {
  controlVisuals.forEach((visual) => {
    visual.traverse((child) => {
      if (child.userData?.labelTexture) child.userData.labelTexture.dispose?.();
      child.material?.dispose?.();
      child.geometry?.dispose?.();
    });
    scene.remove(visual);
  });
  controlVisuals.clear();
}

function launchScenario(scenarioId = selectedScenarioId) {
  const scenario = scenarioById(scenarioId);
  const startedScenario = campaign.startScenario(scenario.id);
  if (!startedScenario.ok) {
    notify('La operación continúa clasificada. Completa el expediente anterior.', 'danger');
    return;
  }
  const difficulty = { cadete: 'facil', comandante: 'normal', mariscal: 'dificil' }[$('campaign-difficulty')?.value] || 'normal';
  const eraIndex = CAMPAIGN.escenarios.findIndex((candidate) => candidate.id === scenario.id);
  const fresh = createSimulation({ seed: 18002100 + scenario.anio, ai: true, difficulty, startingEra: eraIndex });
  configureScenarioState(fresh.state, scenario.id);
  simulation.load(fresh.serialize());
  applyCampaignBonuses(simulation.state, campaign.getState());
  scenarioRuntime = createScenarioRuntime({ scenarioId: scenario.id, initialState: simulation.getState() });
  clearEntityVisuals();
  clearControlVisuals();
  const pauseMenu = $('pause-menu');
  if (pauseMenu) {
    pauseMenu.hidden = true;
    pauseMenu.classList.add('is-hidden');
    pauseMenu.classList.remove('is-visible');
  }
  world.setEra(scenario.anio);
  campaignResultHandled = false;
  latestCampaignResult = null;
  campaignStartingUnits = simulation.getRenderState().entities.filter((entity) => entity.teamId === 'player' && entity.kind === 'unit').length;
  lastDiplomacyTurn = 0;
  lastAutosaveSecond = 0;
  selectedScenarioId = scenario.id;
  closeCampaignArchive();
  startGame({ operationName: scenario.nombre });
  syncState(true);
  saveStrategicArchive({ silent: true });
}

function saveStrategicArchive({ silent = false } = {}) {
  if (!storage) {
    setSaveStatus('Almacenamiento local no disponible', false);
    if (!silent) notify('El navegador bloqueó el almacenamiento local.', 'danger');
    return false;
  }
  try {
    const archive = {
      format: 'dominio-archivo-estrategico',
      version: 1,
      savedAt: new Date().toISOString(),
      selectedScenarioId,
      match: simulation.serialize(),
      campaign: campaign.export(),
      diplomacy: diplomacy.export(),
      scenarioRuntime: scenarioRuntime?.serialize() || null,
      controlGroups: Object.fromEntries([...controlGroups].map(([index, ids]) => [index, [...ids]])),
    };
    storage.setItem(MATCH_SAVE_KEY, JSON.stringify(archive));
    setSaveStatus('Archivo sincronizado', true);
    if (!silent) notify('Partida, campaña y diplomacia guardadas.', 'success', 'Archivo estratégico');
    return true;
  } catch (error) {
    setSaveStatus('Error al guardar', false);
    if (!silent) notify(`No se pudo guardar: ${error.message}`, 'danger');
    return false;
  }
}

function loadStrategicArchive() {
  try {
    const serialized = storage?.getItem(MATCH_SAVE_KEY);
    if (!serialized) throw new Error('No existe un archivo de partida.');
    const archive = JSON.parse(serialized);
    if (archive.format !== 'dominio-archivo-estrategico' || archive.version !== 1) throw new Error('Formato de archivo incompatible.');
    simulation.load(archive.match);
    campaign.import(archive.campaign);
    diplomacy = createDiplomacy({ initialState: deserializeDiplomacyState(archive.diplomacy) });
    selectedScenarioId = archive.selectedScenarioId || campaign.getActiveScenario()?.escenario.id || CAMPAIGN.escenarios[0].id;
    if (simulation.state.mission?.scenarioId !== selectedScenarioId) configureScenarioState(simulation.state, selectedScenarioId);
    scenarioRuntime = createScenarioRuntime({
      scenarioId: selectedScenarioId,
      initialState: simulation.getState(),
      savedState: archive.scenarioRuntime || null,
    });
    controlGroups.clear();
    Object.entries(archive.controlGroups || {}).forEach(([index, ids]) => {
      if (Array.isArray(ids)) controlGroups.set(Number(index), ids.filter(Number.isFinite));
    });
    clearEntityVisuals();
    clearControlVisuals();
    world.setEra(ERA_YEARS[simulation.getRenderState().teams.player.era]);
    campaignResultHandled = false;
    latestCampaignResult = null;
    campaignStartingUnits = simulation.getRenderState().entities.filter((entity) => entity.teamId === 'player' && entity.kind === 'unit').length;
    lastDiplomacyTurn = Math.floor(simulation.getRenderState().time / 60);
    lastAutosaveSecond = Math.floor(simulation.getRenderState().time);
    closeCampaignArchive();
    startGame({ operationName: scenarioById(selectedScenarioId).nombre, restored: true });
    syncState(true);
    notify('Archivo restaurado sin perder la continuidad de la simulación.', 'success', 'Partida cargada');
    return true;
  } catch (error) {
    notify(`No se pudo cargar: ${error.message}`, 'danger');
    setSaveStatus('Archivo incompatible', hasMatchSave());
    return false;
  }
}

function updateResourceRates(state, team) {
  const bindings = {
    alimentos: 'rate-food',
    madera: 'rate-materials',
    acero: 'rate-steel',
    energia: 'rate-energy',
    conocimiento: 'rate-knowledge',
  };
  if (!resourceRateSample || state.time < resourceRateSample.time) {
    resourceRateSample = { time: state.time, values: { ...team.recursos }, rates: {} };
  }
  const elapsed = state.time - resourceRateSample.time;
  if (elapsed >= 0.5) {
    Object.keys(bindings).forEach((key) => {
      resourceRateSample.rates[key] = (team.recursos[key] - resourceRateSample.values[key]) / elapsed;
    });
    resourceRateSample.time = state.time;
    resourceRateSample.values = { ...team.recursos };
  }
  Object.entries(bindings).forEach(([key, id]) => {
    const node = $(id);
    if (!node) return;
    const rate = resourceRateSample.rates[key] || 0;
    node.textContent = `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}/s`;
    node.classList.toggle('is-positive', rate >= 0);
    node.classList.toggle('is-negative', rate < 0);
  });
}

function updateObjectives(state, team) {
  const active = campaign.getActiveScenario();
  const list = $('objectives-list');
  if (!list || !active) return;
  setText('objectives-title', active.escenario.nombre);
  const eyebrow = document.querySelector('#objectives-panel .panel-heading__eyebrow');
  if (eyebrow) eyebrow.textContent = `Directiva / ${active.escenario.anio}`;
  const values = scenarioRuntime?.evaluate(simulation.getState()) || {};
  const objectives = [...active.escenario.objetivosPrimarios, ...active.escenario.objetivosSecundarios];
  objectives.forEach((objective) => {
    const value = Math.min(objective.objetivo, values[objective.id] || 0);
    if ((active.sesion.objetivos[objective.id] || 0) !== value) {
      campaign.updateObjective(objective.id, value, { mode: 'set' });
    }
  });
  const refreshed = campaign.getActiveScenario();
  const visibleObjectives = [
    ...refreshed.escenario.objetivosPrimarios.map((objective) => ({ ...objective, secondary: false })),
    ...refreshed.escenario.objetivosSecundarios.map((objective) => ({ ...objective, secondary: true })),
  ];
  list.replaceChildren(...visibleObjectives.map((objective) => {
    const current = refreshed.sesion.objetivos[objective.id] || 0;
    const item = document.createElement('li');
    item.classList.toggle('is-complete', current >= objective.objetivo);
    item.classList.toggle('is-secondary', objective.secondary);
    item.innerHTML = `<span aria-hidden="true"></span><b>${objective.secondary ? 'Opcional · ' : ''}${objective.descripcion}</b> <small>${current}/${objective.objetivo}</small>`;
    return item;
  }));
}

function updateSelectedStats(primary) {
  const definition = primary
    ? (primary.kind === 'unit' ? UNIT_DEFINITIONS[primary.type] : BUILDING_DEFINITIONS[primary.type])
    : null;
  const carryingWorker = primary?.type === 'obrero';
  const resource = primary?.cargo?.resource ? RESOURCE_DEFINITIONS[primary.cargo.resource] : null;
  const stats = carryingWorker ? {
    attack: { label: 'Carga', value: `${Number(primary.cargo?.amount || 0).toFixed(1)}` },
    armor: { label: 'Recurso', value: resource?.nombre || 'En ruta' },
    range: { label: 'Capacidad', value: primary.cargo?.capacity || '—' },
  } : {
    attack: { label: 'Ataque', value: definition?.ataque || '—' },
    armor: { label: 'Blindaje', value: definition?.armadura ?? '—' },
    range: { label: 'Alcance', value: definition?.alcance || '—' },
  };
  Object.entries(stats).forEach(([stat, entry]) => {
    const node = document.querySelector(`#selected-entity-stats [data-stat="${stat}"] b`);
    const label = document.querySelector(`#selected-entity-stats [data-stat="${stat}"] small`);
    if (node) node.textContent = String(entry.value);
    if (label) label.textContent = entry.label;
  });
}

function updateEndgame(state, team) {
  if (!state.result || resultShown) return;
  updateObjectives(state, team);
  const active = campaign.getActiveScenario();
  const battlefieldVictory = state.result.outcome === 'victoria';
  const operationalVictory = battlefieldVictory && Boolean(active?.objetivosPrimariosCompletos);
  if (active && !campaignResultHandled) {
    campaignResultHandled = true;
    const remainingUnits = state.entities.filter((entity) => entity.teamId === 'player' && entity.kind === 'unit').length;
    latestCampaignResult = campaign.finishScenario({
      victory: operationalVictory,
      durationSeconds: state.result.time,
      casualties: Math.max(0, campaignStartingUnits - remainingUnits),
      score: Math.round(team.recursos.conocimiento + team.poblacion * 25 + state.controlPoints.filter((point) => point.ownerId === 'player').length * 500),
    });
    if (latestCampaignResult.ok && latestCampaignResult.siguienteEscenarioId) selectedScenarioId = latestCampaignResult.siguienteEscenarioId;
    clearMatchSave();
  }
  resultShown = true;
  const victory = operationalVictory;
  const overlay = victory ? $('victory-overlay') : $('defeat-overlay');
  if (!overlay) return;
  overlay.hidden = false;
  overlay.classList.remove('is-hidden');
  overlay.classList.add('is-visible');
  const reason = victory ? $('victory-summary') : $('defeat-summary');
  if (reason) reason.textContent = battlefieldVictory && !operationalVictory
    ? 'Victoria táctica, fracaso operacional: quedaron directivas primarias pendientes.'
    : state.result.reason;
  if (victory) {
    setText('victory-time', formatClock(state.result.time));
    setText('victory-units', state.entities.filter((entity) => entity.teamId === 'player' && entity.kind === 'unit').length);
    setText('victory-era', ERAS[team.era].periodo);
    const title = $('victory-title');
    if (title) title.innerHTML = latestCampaignResult?.campaniaCompletada
      ? 'La campaña<br /><em>está completa</em>'
      : 'La historia<br /><em>te pertenece</em>';
    const nextButton = $('victory-next-btn');
    if (nextButton) nextButton.textContent = latestCampaignResult?.campaniaCompletada
      ? 'Ver archivo final'
      : 'Siguiente operación';
  }
  const focusTarget = overlay.querySelector('button');
  requestAnimationFrame(() => focusTarget?.focus());
  audio.play(victory ? 'victory' : 'alert');
}

function updateHUD(state) {
  const team = state.teams.player;
  const era = ERAS[team.era];
  setText('era-name', era.nombre);
  setText('era-year', era.periodo);
  const progress = $('era-progress');
  if (progress) {
    const ratio = team.research ? team.research.progress / team.research.duration : team.era / (ERAS.length - 1);
    progress.style.width = `${Math.min(1, ratio) * 100}%`;
    $('era-progress-track')?.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }
  setText('resource-food', formatResource(team.recursos.alimentos));
  setText('resource-materials', formatResource(team.recursos.madera));
  setText('resource-steel', formatResource(team.recursos.acero));
  setText('resource-energy', formatResource(team.recursos.energia));
  setText('resource-knowledge', formatResource(team.recursos.conocimiento));
  setText('resource-population', $('population-cap') ? team.poblacion : `${team.poblacion} / ${team.capacidad}`);
  setText('population-cap', team.capacidad);
  updateResourceRates(state, team);
  const clock = formatClock(state.time);
  setText('game-clock', clock);
  setText('match-clock', clock);
  setText('map-coordinates', `X:${Math.round(cameraTarget.x).toString().padStart(3, '0')} Z:${Math.round(cameraTarget.z).toString().padStart(3, '0')}`);

  const selected = state.entities.filter((entity) => state.selectedIds.includes(entity.id));
  const primary = selected[0];
  $('selection-panel')?.classList.toggle('is-empty', !primary);
  setText('selected-entity-name', primary ? (selected.length > 1 ? `${selected.length} unidades` : primary.nombre) : 'Sin selección');
  const stanceLabel = primary?.kind === 'unit' ? UNIT_STANCES[primary.stance]?.nombre : null;
  setText('selected-entity-type', primary
    ? `${primary.action || 'operativo'} · ${primary.teamId === 'player' ? 'Aurora' : 'Rival'}${stanceLabel ? ` · ${stanceLabel}` : ''}`
    : 'Selecciona una unidad o edificio');
  setText('selected-entity-health', primary ? `${Math.ceil(primary.hp)} / ${primary.maxHp}` : '—');
  const health = $('selected-health-bar') || $('selected-entity-health-bar');
  if (health) {
    const ratio = `${primary ? primary.healthRatio * 100 : 0}%`;
    health.style.width = ratio;
    health.style.setProperty('--health', ratio);
  }
  setText('selected-entity-initials', primary ? (primary.kind === 'building' ? '▥' : '♞') : '◇');
  setText('selection-count', `${selected.length} seleccionado${selected.length === 1 ? '' : 's'}`);
  updateSelectedStats(primary);
  updateObjectives(state, team);
  renderActions(state, primary, selected);
  renderMinimap(state);
  updateEndgame(state, team);
}

function actionButton(label, detail, handler, disabled = false, key = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'command-button';
  button.disabled = disabled;
  if (key) button.dataset.hotkey = String(key).toUpperCase();
  const normalized = label.toLocaleLowerCase('es');
  const glyph = normalized === 'detener' ? '■'
    : normalized.startsWith('avanzar') ? '⇧'
      : normalized.includes('centro') ? '⌂'
        : normalized.includes('ayuda') ? '?'
          : normalized === 'agresiva' ? '⚔'
            : normalized === 'defensiva' ? '⛨'
              : normalized === 'mantener' ? '◎'
                : normalized === 'línea' ? '━'
                  : normalized === 'columna' ? '┃'
                    : normalized === 'cuña' ? '⋀'
                      : normalized === 'patrullar' ? '↻'
                        : normalized === 'reparar' ? '⚒'
                          : normalized === 'barrio' ? '⌂'
                            : normalized === 'cuartel' ? '⚑'
                              : normalized === 'instituto' ? '⌬'
                                : normalized === 'fábrica' ? '⚙'
                                  : normalized === 'central' ? 'ϟ'
                                    : normalized === 'bastión' ? '⬟'
                                      : '◆';
  button.innerHTML = `<span class="command-button__glyph" aria-hidden="true">${glyph}</span><kbd>${key}</kbd><small>${label}</small><span class="command-detail">${detail}</span>`;
  button.addEventListener('click', handler);
  return button;
}

function notify(message, tone = 'neutral', title = '') {
  const stack = $('notification-stack');
  const announcer = $('game-announcer');
  if (announcer) announcer.textContent = message;
  if (!stack) return;
  const notice = document.createElement('div');
  notice.className = `notification notification--${tone}`;
  notice.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
  const icon = document.createElement('span');
  icon.className = 'notification__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = tone === 'danger' ? '!' : tone === 'success' ? '✓' : tone === 'info' ? 'i' : '◆';
  const copy = document.createElement('span');
  copy.className = 'notification__copy';
  const heading = document.createElement('strong');
  heading.textContent = title || (tone === 'danger' ? 'Alerta táctica' : tone === 'success' ? 'Objetivo actualizado' : tone === 'info' ? 'Orden de mando' : 'Informe de campo');
  const body = document.createElement('span');
  body.textContent = message;
  copy.append(heading, body);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'notification__close';
  close.setAttribute('aria-label', 'Cerrar aviso');
  close.textContent = '×';
  const dismiss = () => { notice.classList.remove('is-visible'); setTimeout(() => notice.remove(), 300); };
  close.addEventListener('click', dismiss);
  notice.append(icon, copy, close);
  stack.prepend(notice);
  requestAnimationFrame(() => notice.classList.add('is-visible'));
  setTimeout(dismiss, 4200);
  while (stack.children.length > 4) stack.lastElementChild.remove();
}

function resolveAction(result, successSound = 'build') {
  if (result && result.ok === false) {
    notify(result.message, 'danger');
    audio.play('alert');
  } else {
    audio.play(successSound);
  }
}

function renderActions(state, primary, selection) {
  const grid = $('action-grid');
  if (!grid) return;
  const team = state.teams.player;
  const actionSignature = JSON.stringify({
    selected: selection.map((entity) => [entity.id, entity.type, entity.complete, entity.stance, entity.productionQueue?.length || 0]),
    era: team.era,
    formation: team.formation,
    eraResearch: team.research?.targetEra ?? null,
    researched: team.technologies?.researched || [],
    technology: team.technologies?.active
      ? [team.technologies.active.id, Math.floor((team.technologies.active.progress / team.technologies.active.duration) * 10)]
      : null,
  });
  if (actionSignature === lastActionSignature) return;
  lastActionSignature = actionSignature;
  grid.replaceChildren();
  if (!primary) {
    grid.append(
      actionButton('Centro de mando', 'Centrar cámara', () => focusHome(), false, 'H'),
      actionButton('Ayuda táctica', 'Mostrar controles', () => $('controls-overlay')?.classList.toggle('is-visible'), false, '?'),
    );
    return;
  }
  if (primary.kind === 'unit') {
    const selectedUnits = selection.filter((entity) => entity.kind === 'unit');
    if (selectedUnits.some((unit) => unit.type !== 'obrero')) {
      [
        ['agresiva', 'Agresiva', 'Persigue en visión', 'Z'],
        ['defensiva', 'Defensiva', 'Persecución limitada', 'N'],
        ['mantener_posicion', 'Mantener', 'Ataca sin perseguir', 'J'],
      ].forEach(([stance, label, detail, key]) => {
        const current = selectedUnits.every((unit) => unit.stance === stance);
        const button = actionButton(
          label,
          current ? 'Activa' : detail,
          () => {
            const result = simulation.command({ type: 'stance', stance });
            if (result.ok) notify(`Postura ${label.toLowerCase()} asignada a ${result.units} unidad(es).`, 'info', 'Postura');
            else resolveAction(result, 'order');
          },
          false,
          key,
        );
        button.classList.add('command-button--stance');
        button.setAttribute('aria-pressed', String(current));
        grid.append(button);
      });
    }
    if (selectedUnits.length > 1) {
      [
        ['linea', 'Línea', 'Frente ancho', 'L'],
        ['columna', 'Columna', 'Paso estrecho', 'K'],
        ['cuna', 'Cuña', 'Ataque concentrado', 'C'],
      ].forEach(([formation, label, detail, key]) => {
        const current = team.formation === formation;
        const button = actionButton(
          label,
          current ? 'Activa' : detail,
          () => {
            const result = simulation.command({ type: 'formation', formation });
            if (result.ok) notify(`Formación de ${label.toLowerCase()} seleccionada.`, 'info', 'Formación');
            else resolveAction(result, 'order');
          },
          false,
          key,
        );
        button.classList.add('command-button--formation');
        button.setAttribute('aria-pressed', String(current));
        grid.append(button);
      });
    }
    grid.append(actionButton('Detener', 'Cancelar órdenes', () => simulation.issueStop(), false, 'X'));
    grid.append(actionButton('Patrullar', 'Marca el segundo extremo', () => {
      commandMode = 'patrol';
      buildMode = null;
      notify('Marca sobre el terreno el segundo extremo de la patrulla.', 'info', 'Orden táctica');
    }, false, 'P'));
    if (selection.some((unit) => unit.type === 'obrero')) {
      grid.append(actionButton('Reparar', 'Selecciona un edificio aliado dañado', () => {
        commandMode = 'repair';
        buildMode = null;
        notify('Selecciona el edificio aliado que debe repararse.', 'info', 'Ingeniería');
      }, false, 'R'));
      const buildings = ['vivienda', 'cuartel', 'universidad', 'fabrica', 'central', 'bastion'];
      const compactBuildingLabels = {
        vivienda: 'Barrio', cuartel: 'Cuartel', universidad: 'Instituto',
        fabrica: 'Fábrica', central: 'Central', bastion: 'Bastión',
      };
      buildings.forEach((type, index) => {
        const def = BUILDING_DEFINITIONS[type];
        const locked = def.era > team.era;
        grid.append(actionButton(compactBuildingLabels[type] || def.nombre, locked ? `Requiere ${ERAS[def.era].nombre}` : costLabel(def.costo), () => {
          buildMode = type;
          commandMode = null;
          notify(`Ubica ${def.nombre} sobre el terreno`, 'info');
        }, locked, String(index + 1)));
      });
    }
  } else {
    const def = BUILDING_DEFINITIONS[primary.type];
    if (primary.productionQueue?.length) {
      const queued = primary.productionQueue[0];
      const queuedUnit = UNIT_DEFINITIONS[queued.unitType];
      grid.append(actionButton(
        `Cancelar: ${queuedUnit?.nombre || queued.unitType}`,
        `${Math.round((queued.progress / queued.duration) * 100)}% · reembolso 75%`,
        () => simulation.cancelTraining(primary.id, 0),
        false,
        'X',
      ));
    }
    (def?.produce || []).forEach((unitType, index) => {
      const unit = UNIT_DEFINITIONS[unitType];
      grid.append(actionButton(unit.nombre, costLabel(unit.costo), () => resolveAction(simulation.trainUnit(primary.id, unitType), 'build'), unit.era > team.era, String(index + 1)));
    });
    if (primary.type === 'cuartelGeneral' || primary.type === 'universidad') {
      const next = ERAS[team.era + 1];
      grid.append(actionButton(next ? `Avanzar: ${next.nombre}` : 'Cumbre tecnológica', next ? costLabel(next.costo) : 'Todas las eras dominadas', () => resolveAction(simulation.researchNextEra(), 'era'), !primary.complete || !next || Boolean(team.research), 'V'));
    }
    const researched = team.technologies?.researched || [];
    const buildings = state.entities
      .filter((entity) => entity.teamId === 'player' && entity.kind === 'building' && entity.complete)
      .map((entity) => entity.type);
    const activeTechnology = team.technologies?.active;
    TECHNOLOGIES
      .filter((technology) => technology.edificio === primary.type && technology.era <= team.era && !researched.includes(technology.id))
      .slice(0, 5)
      .forEach((technology) => {
        const availability = technologyAvailability(technology.id, { era: team.era, researched, buildings });
        const isActive = activeTechnology?.id === technology.id;
        const detail = isActive
          ? `${Math.round((activeTechnology.progress / activeTechnology.duration) * 100)}% · ${Math.ceil(activeTechnology.duration - activeTechnology.progress)} s`
          : availability.missingPrerequisites.length
            ? `Requiere ${availability.missingPrerequisites.map((id) => TECHNOLOGIES.find((item) => item.id === id)?.nombre || id).join(', ')}`
            : `${technology.anio} · ${costLabel(technology.costo)}`;
        const hotkey = grid.children.length < 9 ? String(grid.children.length + 1) : '';
        grid.append(actionButton(
          isActive ? `Investigando: ${technology.nombre}` : technology.nombre,
          detail,
          () => resolveAction(simulation.researchTechnology(primary.id, technology.id), 'era'),
          Boolean(activeTechnology) || !availability.available,
          hotkey,
        ));
      });
    if (activeTechnology?.buildingId === primary.id) {
      grid.append(actionButton('Cancelar investigación', 'Reembolso del 60%', () => simulation.cancelTechnologyResearch(), false, 'X'));
    }
  }
}

function costLabel(cost = {}) {
  return Object.entries(cost).map(([key, value]) => `${RESOURCE_GLYPHS[key] || '•'} ${value}`).join('  ');
}

function renderMinimap(state) {
  const mini = $('minimap-canvas');
  if (!mini) return;
  const ctx = mini.getContext('2d');
  const rect = mini.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * devicePixelRatio));
  const height = Math.max(1, Math.floor(rect.height * devicePixelRatio));
  if (mini.width !== width || mini.height !== height) { mini.width = width; mini.height = height; }
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#263b35');
  gradient.addColorStop(1, '#101c1f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const toMini = (x, z) => ({ x: ((x + 80) / 160) * width, y: ((z + 60) / 120) * height });
  ctx.strokeStyle = 'rgba(214, 179, 103, .22)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += width / 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  drawMinimapFog(ctx, state.fogOfWar, width, height);
  if (minimapMode !== 'diplomacy') state.resourceNodes.forEach((node) => {
    const p = toMini(node.x, node.z);
    ctx.fillStyle = RESOURCE_DEFINITIONS[node.resource].color;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  });
  state.controlPoints.forEach((point) => {
    const p = toMini(point.x, point.z);
    ctx.strokeStyle = point.ownerId ? state.teams[point.ownerId].color : '#d6b367';
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.stroke();
  });
  state.entities.forEach((entity) => {
    const p = toMini(entity.x, entity.z);
    ctx.fillStyle = minimapMode === 'terrain' ? '#e8ddbe' : state.teams[entity.teamId].color;
    const size = entity.kind === 'building' ? (minimapMode === 'diplomacy' ? 6 : 4.5) : (minimapMode === 'diplomacy' ? 3.5 : 2.5);
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  });
  const c = toMini(cameraTarget.x, cameraTarget.z);
  ctx.strokeStyle = '#f6e7c5';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(c.x - 16, c.y - 10, 32, 20);
}

function decodeFogRanges(ranges = []) {
  const indices = new Set();
  for (let pair = 0; pair + 1 < ranges.length; pair += 2) {
    const start = ranges[pair];
    const length = ranges[pair + 1];
    for (let offset = 0; offset < length; offset += 1) indices.add(start + offset);
  }
  return indices;
}

function updateWorldFog(summary) {
  if (!summary) {
    unexploredFog.count = 0;
    exploredFog.count = 0;
    return;
  }
  const explored = decodeFogRanges(summary.exploredRanges);
  const visible = decodeFogRanges(summary.visibleRanges);
  const matrix = new THREE.Matrix4();
  let shroudCount = 0;
  let fogCount = 0;
  const total = summary.columns * summary.rows;
  for (let index = 0; index < total; index += 1) {
    if (visible.has(index)) continue;
    const column = index % summary.columns;
    const row = Math.floor(index / summary.columns);
    const x = summary.origin.x + (column + 0.5) * summary.cellSize;
    const z = summary.origin.z + (row + 0.5) * summary.cellSize;
    matrix.makeTranslation(x, world.heightAt(x, z) + 0.18, z);
    if (explored.has(index)) exploredFog.setMatrixAt(fogCount++, matrix);
    else unexploredFog.setMatrixAt(shroudCount++, matrix);
  }
  unexploredFog.count = shroudCount;
  exploredFog.count = fogCount;
  unexploredFog.instanceMatrix.needsUpdate = true;
  exploredFog.instanceMatrix.needsUpdate = true;
}

function drawMinimapFog(ctx, summary, width, height) {
  if (!summary) return;
  const explored = decodeFogRanges(summary.exploredRanges);
  const visible = decodeFogRanges(summary.visibleRanges);
  const cellWidth = width / summary.columns;
  const cellHeight = height / summary.rows;
  for (let index = 0; index < summary.columns * summary.rows; index += 1) {
    if (visible.has(index)) continue;
    const column = index % summary.columns;
    const row = Math.floor(index / summary.columns);
    ctx.fillStyle = explored.has(index) ? 'rgba(4, 13, 16, .42)' : 'rgba(0, 2, 3, .82)';
    ctx.fillRect(column * cellWidth, row * cellHeight, Math.ceil(cellWidth) + 0.5, Math.ceil(cellHeight) + 0.5);
  }
}

function processEvents(state) {
  const events = state.recentEvents.filter((event) => event.id > lastEventId);
  events.forEach((event) => {
    lastEventId = Math.max(lastEventId, event.id);
    const dangerous = ['entidad_destruida', 'derrota'].includes(event.type);
    const important = ['era_avanzada', 'victoria', 'punto_capturado'].includes(event.type);
    notify(event.message, dangerous ? 'danger' : important ? 'success' : 'neutral');
    if (event.type === 'era_avanzada' && event.teamId === 'player') {
      world.setEra(ERA_YEARS[state.teams.player.era]);
      audio.play('era');
    }
    if (event.type === 'ataque') audio.play('shot');
    if (event.type === 'entidad_destruida') audio.play('explosion');
  });
}

function syncState(force = false) {
  const state = simulation.getRenderState();
  gameState = state;
  const strategicTurn = Math.floor(state.time / 60);
  if (strategicTurn > lastDiplomacyTurn) {
    diplomacy.advance(strategicTurn - lastDiplomacyTurn);
    lastDiplomacyTurn = strategicTurn;
  }
  const elapsedWholeSeconds = Math.floor(state.time);
  if (started && state.mode !== 'finalizado' && elapsedWholeSeconds >= lastAutosaveSecond + 30) {
    lastAutosaveSecond = elapsedWholeSeconds;
    saveStrategicArchive({ silent: true });
  }
  if (force || state.version !== lastStateVersion) {
    syncStaticMap(state);
    updateWorldFog(state.fogOfWar);
    syncCombatEffects(state);
    syncEntities(state);
    updateHUD(state);
    processEvents(state);
    lastStateVersion = state.version;
  }
  return state;
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(world.terrain, true)[0];
  if (hit) return hit.point;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, point) ? point : null;
}

function findInteractive(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([...entityVisuals.values(), ...resourceVisuals.values()], true);
  for (const hit of hits) {
    let object = hit.object;
    while (object) {
      if (object.userData.simulationId) return { type: 'entity', id: object.userData.simulationId, object };
      if (object.userData.resourceNodeId) return { type: 'resource', id: object.userData.resourceNodeId, object };
      object = object.parent;
    }
  }
  return null;
}

function handleLeftClick(event) {
  if (!started || gameState.paused) return;
  const ground = screenToWorld(event.clientX, event.clientY);
  const target = findInteractive(event.clientX, event.clientY);
  if (commandMode === 'patrol' && ground) {
    simulation.issuePatrol(ground.x, ground.z, { queued: event.shiftKey });
    world.createEffect({ position: [ground.x, world.heightAt(ground.x, ground.z) + 0.12, ground.z], color: 0xffcf66, size: 0.28, life: 0.7 });
    commandMode = null;
    audio.play('order');
    return;
  }
  if (commandMode === 'repair') {
    const entity = target?.type === 'entity' ? gameState.entities.find((item) => item.id === target.id) : null;
    if (entity?.teamId === 'player' && entity.kind === 'building') {
      resolveAction(simulation.issueRepair(entity.id, { queued: event.shiftKey }), 'build');
      commandMode = null;
    } else {
      notify('La reparación requiere un edificio aliado dañado.', 'danger', 'Ingeniería');
    }
    return;
  }
  if (buildMode && ground) {
    resolveAction(simulation.issueBuild(buildMode, ground.x, ground.z), 'build');
    buildMode = null;
    return;
  }
  if (event.pointerType === 'touch') {
    if (target?.type === 'entity') {
      const entity = gameState.entities.find((item) => item.id === target.id);
      if (entity?.teamId === 'player') {
        simulation.selectUnits(target.id);
        audio.play('select');
      } else {
        resolveAction(simulation.issueAttack(target.id), 'order');
      }
      return;
    }
    if (target?.type === 'resource') {
      resolveAction(simulation.issueGather(target.id), 'order');
      return;
    }
    if (ground && gameState.selectedIds.length) {
      simulation.issueMove(ground.x, ground.z);
      world.createEffect({ position: [ground.x, world.heightAt(ground.x, ground.z) + 0.12, ground.z], color: 0x5bdcff, size: 0.22, life: 0.45 });
      audio.play('order');
      return;
    }
  }
  if (target?.type === 'entity') {
    simulation.selectUnits(target.id, { append: event.shiftKey });
    audio.play('select');
  } else if (!event.shiftKey) {
    simulation.clearSelection();
  }
}

function handleRightClick(event) {
  event.preventDefault();
  if (!started || gameState.paused) return;
  buildMode = null;
  commandMode = null;
  const interactive = findInteractive(event.clientX, event.clientY);
  if (interactive?.type === 'entity') {
    const entity = gameState.entities.find((item) => item.id === interactive.id);
      if (entity?.teamId !== 'player') {
      resolveAction(simulation.issueAttack(entity.id, { queued: event.shiftKey }), 'order');
      return;
    }
  }
  if (interactive?.type === 'resource') {
    resolveAction(simulation.issueGather(interactive.id, { queued: event.shiftKey }), 'order');
    return;
  }
  const ground = screenToWorld(event.clientX, event.clientY);
  if (ground) {
    const selectedBuilding = gameState.entities.find((entity) => gameState.selectedIds.includes(entity.id) && entity.kind === 'building' && entity.teamId === 'player');
    if (selectedBuilding) {
      simulation.setRallyPoint(selectedBuilding.id, ground.x, ground.z);
      notify('Punto de reunión actualizado.', 'info', 'Producción');
    } else {
      simulation.issueMove(ground.x, ground.z, { attackMove: event.ctrlKey, queued: event.shiftKey });
    }
    world.createEffect({ position: [ground.x, world.heightAt(ground.x, ground.z) + 0.12, ground.z], color: event.ctrlKey ? 0xff5a4f : 0x5bdcff, size: 0.22, life: 0.45 });
    audio.play('order');
  }
}

function selectScreenBox(from, to, append) {
  const a = screenToWorld(from.x, from.y);
  const b = screenToWorld(to.x, to.y);
  if (a && b) simulation.selectBox(a.x, a.z, b.x, b.z, { append, unitsOnly: true });
}

const selectionBox = document.createElement('div');
selectionBox.className = 'selection-box';
document.body.append(selectionBox);
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pointerDown = {
    x: event.clientX,
    y: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    shift: event.shiftKey,
    pointerType: event.pointerType,
    cameraDragged: false,
  };
  if (event.pointerType === 'touch') canvas.setPointerCapture?.(event.pointerId);
  selectionBox.style.left = `${event.clientX}px`;
  selectionBox.style.top = `${event.clientY}px`;
  selectionBox.style.width = '0';
  selectionBox.style.height = '0';
});
canvas.addEventListener('pointermove', (event) => {
  const target = findInteractive(event.clientX, event.clientY);
  if (target?.id !== hovered?.id) {
    hovered = target;
      const tooltip = $('tooltip');
      if (tooltip) {
        const entity = target?.type === 'entity' ? gameState.entities.find((item) => item.id === target.id) : null;
        const resource = target?.type === 'resource' ? gameState.resourceNodes.find((item) => item.id === target.id) : null;
        setText('tooltip-title', entity?.nombre || (resource ? RESOURCE_DEFINITIONS[resource.resource].nombre : ''));
        setText('tooltip-description', entity ? `${Math.ceil(entity.hp)} / ${entity.maxHp} · ${entity.action}` : resource ? `${Math.floor(resource.amount)} unidades disponibles` : '');
        setText('tooltip-hotkey', target ? (target.type === 'resource' ? 'Clic der.' : 'Clic') : '');
        tooltip.hidden = !target;
        tooltip.style.transform = `translate(${event.clientX + 16}px, ${event.clientY + 16}px)`;
      }
  }
  if (!pointerDown) return;
  const dx = event.clientX - pointerDown.x;
  const dy = event.clientY - pointerDown.y;
  if (pointerDown.pointerType === 'touch' && Math.hypot(dx, dy) > 7) {
    const frameDx = event.clientX - pointerDown.lastX;
    const frameDy = event.clientY - pointerDown.lastY;
    const scale = cameraDistance * 0.0018;
    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const right = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    cameraTarget.addScaledVector(right, -frameDx * scale);
    cameraTarget.addScaledVector(forward, frameDy * scale);
    cameraTarget.x = THREE.MathUtils.clamp(cameraTarget.x, -72, 72);
    cameraTarget.z = THREE.MathUtils.clamp(cameraTarget.z, -54, 54);
    cameraTarget.y = world.heightAt(cameraTarget.x, cameraTarget.z);
    pointerDown.lastX = event.clientX;
    pointerDown.lastY = event.clientY;
    pointerDown.cameraDragged = true;
    updateCameraPosition();
    return;
  }
  if (Math.hypot(dx, dy) > 7) {
    selectionBox.classList.add('is-visible');
    selectionBox.style.left = `${Math.min(pointerDown.x, event.clientX)}px`;
    selectionBox.style.top = `${Math.min(pointerDown.y, event.clientY)}px`;
    selectionBox.style.width = `${Math.abs(dx)}px`;
    selectionBox.style.height = `${Math.abs(dy)}px`;
  }
});
canvas.addEventListener('pointerup', (event) => {
  if (!pointerDown || event.button !== 0) return;
  const start = pointerDown;
  pointerDown = null;
  const dragged = Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7;
  selectionBox.classList.remove('is-visible');
  if (start.pointerType === 'touch' && start.cameraDragged) return;
  if (dragged) selectScreenBox(start, { x: event.clientX, y: event.clientY }, start.shift);
  else handleLeftClick(event);
});
canvas.addEventListener('pointercancel', () => {
  pointerDown = null;
  selectionBox.classList.remove('is-visible');
});
canvas.addEventListener('contextmenu', handleRightClick);
canvas.addEventListener('wheel', (event) => {
  cameraDistance = THREE.MathUtils.clamp(cameraDistance + event.deltaY * 0.035, 24, 96);
  updateCameraPosition();
}, { passive: true });

function focusHome() {
  cameraTarget.set(-48, world.heightAt(-48, 30), 30);
  cameraDistance = 44;
  updateCameraPosition();
}

function cyclePlayerEntities(filter, direction = 1) {
  const candidates = gameState.entities
    .filter((entity) => entity.teamId === 'player' && filter(entity))
    .sort((a, b) => a.id - b.id);
  if (!candidates.length) return false;
  const currentId = gameState.selectedIds[0];
  const currentIndex = candidates.findIndex((entity) => entity.id === currentId);
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + direction + candidates.length) % candidates.length;
  const target = candidates[nextIndex];
  simulation.selectUnits(target.id);
  syncState(true);
  cameraTarget.set(target.x, world.heightAt(target.x, target.z), target.z);
  updateCameraPosition();
  audio.play('select');
  return true;
}

function storeControlGroup(index) {
  const ids = gameState.selectedIds.filter((id) => gameState.entities.some((entity) => entity.id === id && entity.teamId === 'player'));
  if (!ids.length) return false;
  controlGroups.set(index, ids);
  notify(`Grupo ${index} asignado: ${ids.length} entidad${ids.length === 1 ? '' : 'es'}.`, 'info', 'Control táctico');
  return true;
}

function recallControlGroup(index) {
  const ids = (controlGroups.get(index) || []).filter((id) => gameState.entities.some((entity) => entity.id === id && entity.teamId === 'player'));
  if (!ids.length) {
    controlGroups.delete(index);
    return false;
  }
  controlGroups.set(index, ids);
  simulation.selectUnits(ids);
  syncState(true);
  const now = performance.now();
  const focus = lastControlGroupRecall.index === index && now - lastControlGroupRecall.time < 420;
  lastControlGroupRecall = { index, time: now };
  if (focus) {
    const selected = gameState.entities.filter((entity) => ids.includes(entity.id));
    const center = selected.reduce((sum, entity) => ({ x: sum.x + entity.x, z: sum.z + entity.z }), { x: 0, z: 0 });
    cameraTarget.set(center.x / selected.length, 0, center.z / selected.length);
    cameraTarget.y = world.heightAt(cameraTarget.x, cameraTarget.z);
    updateCameraPosition();
  }
  audio.play('select');
  return true;
}

function togglePause(force) {
  if (!started) return;
  const paused = simulation.setPaused(force ?? !simulation.getRenderState().paused);
  $('pause-menu')?.classList.toggle('is-visible', paused);
  if ($('pause-menu')) {
    $('pause-menu').hidden = !paused;
    $('pause-menu').classList.toggle('is-hidden', !paused);
  }
  if (paused) requestAnimationFrame(() => $('resume-btn')?.focus());
}

function controlsVisible() {
  return $('controls-overlay')?.classList.contains('is-visible');
}

function openControls({ credits = false, trigger = document.activeElement } = {}) {
  const overlay = $('controls-overlay');
  if (!overlay) return;
  controlsReturnFocus = trigger instanceof HTMLElement ? trigger : null;
  setText('controls-title', credits ? 'Créditos de campaña' : 'Control táctico');
  const hint = document.querySelector('.controls-grid__hint');
  if (hint) hint.textContent = credits
    ? 'Diseño, simulación y mundo procedural creados para DOMINIO: SIGLOS DE ACERO.'
    : 'Pulsa Esc o haz clic fuera del informe para cerrarlo.';
  overlay.classList.add('is-visible');
  const card = overlay.querySelector('.modal-card');
  card?.setAttribute('tabindex', '-1');
  let closeButton = $('controls-close-btn');
  if (!closeButton && card) {
    closeButton = document.createElement('button');
    closeButton.id = 'controls-close-btn';
    closeButton.type = 'button';
    closeButton.className = 'modal-button';
    closeButton.textContent = 'Cerrar informe';
    closeButton.addEventListener('click', closeControls);
    card.append(closeButton);
  }
  setTimeout(() => closeButton?.focus(), 260);
}

function closeControls() {
  const overlay = $('controls-overlay');
  if (!overlay?.classList.contains('is-visible')) return false;
  overlay.classList.remove('is-visible');
  controlsReturnFocus?.focus?.();
  controlsReturnFocus = null;
  return true;
}

function pingLocation() {
  if (!started) return;
  world.createEffect({
    position: [cameraTarget.x, world.heightAt(cameraTarget.x, cameraTarget.z) + 0.18, cameraTarget.z],
    color: 0xffcf66,
    size: 0.5,
    life: 1.1,
  });
  const button = $('ping-btn');
  button?.classList.add('is-active');
  setTimeout(() => button?.classList.remove('is-active'), 500);
  notify(`Señal enviada en X ${Math.round(cameraTarget.x)}, Z ${Math.round(cameraTarget.z)}.`, 'info', 'Baliza táctica');
  audio.play('order');
}

function toggleTerrainView() {
  minimapMode = minimapMode === 'terrain' ? 'normal' : 'terrain';
  world.terrain.material.wireframe = minimapMode === 'terrain';
  $('toggle-terrain-btn')?.classList.toggle('is-active', minimapMode === 'terrain');
  $('toggle-diplomacy-btn')?.classList.remove('is-active');
  renderMinimap(gameState);
  notify(minimapMode === 'terrain' ? 'Relieve táctico activado.' : 'Relieve táctico desactivado.', 'info', 'Cartografía');
}

function relationLabel(disposition) {
  return { aliado: 'Aliado', neutral: 'Neutral', enemigo: 'En guerra' }[disposition] || disposition;
}

function renderDiplomacy() {
  const state = diplomacy.getState();
  const aurora = state.facciones.aurora;
  const doctrine = $('diplomacy-status');
  if (doctrine) doctrine.innerHTML = `<span aria-hidden="true">◈</span><p><small>Doctrina vigente · turno ${state.turno}</small><strong>Neutralidad armada</strong></p><em>${Math.floor(aurora.influencia)} influencia</em>`;
  document.querySelectorAll('[data-faction]').forEach((row) => {
    const factionId = row.dataset.faction;
    const faction = state.facciones[factionId];
    if (!faction) return;
    const relation = diplomacy.getRelation('aurora', factionId);
    const className = { aliado: 'ally', neutral: 'neutral', enemigo: 'enemy' }[relation.disposicion];
    row.classList.remove('faction-row--ally', 'faction-row--neutral', 'faction-row--enemy');
    row.classList.add(`faction-row--${className}`);
    row.dataset.relation = className;
    const copy = row.querySelector('p');
    if (copy) copy.innerHTML = `<strong>${faction.nombre}</strong><small>${relationLabel(relation.disposicion)} · ${relation.tratados.length ? relation.tratados.map((treaty) => treaty.tipo).join(', ') : 'sin tratado vigente'}</small>`;
    const meter = row.querySelector('meter');
    if (meter) {
      meter.value = relation.reputacion;
      meter.textContent = String(relation.reputacion);
      meter.setAttribute('aria-label', `Relación ${relation.reputacion} de 100`);
    }
    const button = row.querySelector('button');
    if (button) button.textContent = relation.disposicion === 'enemigo' ? 'Armisticio' : relation.disposicion === 'aliado' ? 'Comerciar' : 'Pactar';
  });
}

function closeDiplomacy() {
  const panel = $('diplomacy-panel');
  if (!panel || panel.hidden) return false;
  panel.hidden = true;
  minimapMode = 'normal';
  $('toggle-diplomacy-btn')?.classList.remove('is-active');
  renderMinimap(gameState);
  return true;
}

function executeDiplomaticAction(factionId) {
  const relation = diplomacy.getRelation('aurora', factionId);
  const action = relation.disposicion === 'enemigo' ? 'armisticio' : relation.disposicion === 'aliado' ? 'comercio' : 'noAgresion';
  const result = diplomacy.execute(action, 'aurora', factionId);
  if (!result.ok) {
    const messages = {
      'en-enfriamiento': `La delegación requiere ${result.turnosRestantes} turnos antes de reabrir conversaciones.`,
      'influencia-insuficiente': `Influencia insuficiente: hacen falta ${result.coste} puntos.`,
      'reputacion-insuficiente': 'La reputación bilateral no permite ese acuerdo.',
      'tratado-ya-activo': 'Ese tratado ya está vigente.',
    };
    notify(messages[result.codigo] || 'La contraparte rechazó la propuesta.', 'danger', 'Diplomacia');
  } else {
    notify(`Acuerdo ${action === 'armisticio' ? 'de armisticio' : action === 'comercio' ? 'comercial' : 'de no agresión'} ratificado.`, 'success', 'Diplomacia');
  }
  renderDiplomacy();
}

function toggleDiplomacyView() {
  minimapMode = minimapMode === 'diplomacy' ? 'normal' : 'diplomacy';
  world.terrain.material.wireframe = false;
  $('toggle-diplomacy-btn')?.classList.toggle('is-active', minimapMode === 'diplomacy');
  $('toggle-terrain-btn')?.classList.remove('is-active');
  const panel = $('diplomacy-panel');
  if (panel) panel.hidden = minimapMode !== 'diplomacy';
  if (minimapMode === 'diplomacy') renderDiplomacy();
  renderMinimap(gameState);
  notify(minimapMode === 'diplomacy' ? 'Mesa diplomática desplegada.' : 'Vista estratégica restaurada.', 'info', 'Diplomacia');
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

window.addEventListener('keydown', (event) => {
  keys.add(event.key.toLowerCase());
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveStrategicArchive();
    return;
  }
  if (event.key === 'Escape') {
    if (closeControls()) return;
    if (closeCampaignArchive()) return;
    if (closeDiplomacy()) return;
    if (buildMode) { buildMode = null; notify('Construcción cancelada'); }
    else if (commandMode) { commandMode = null; notify('Orden dirigida cancelada'); }
    else togglePause();
  }
  if (controlsVisible()) {
    if (event.key === 'Tab') {
      event.preventDefault();
      $('controls-close-btn')?.focus();
    }
    return;
  }
  if (started && ['F2', 'F3', 'F4'].includes(event.key)) {
    event.preventDefault();
    const filters = {
      F2: (entity) => entity.kind === 'building',
      F3: (entity) => entity.kind === 'unit' && entity.type === 'obrero',
      F4: (entity) => entity.kind === 'unit' && entity.type !== 'obrero',
    };
    cyclePlayerEntities(filters[event.key], event.shiftKey ? -1 : 1);
    return;
  }
  if (started && /^[1-9]$/.test(event.key)) {
    const index = Number(event.key);
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      storeControlGroup(index);
      return;
    }
    if (controlGroups.has(index)) {
      event.preventDefault();
      recallControlGroup(index);
      return;
    }
  }
  if (started && !gameState.paused && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const hotkey = event.key.toUpperCase();
    const action = [...document.querySelectorAll('#action-grid .command-button[data-hotkey]')]
      .find((button) => button.dataset.hotkey === hotkey && !button.disabled);
    if (action) {
      event.preventDefault();
      action.click();
      return;
    }
  }
  if (event.key.toLowerCase() === 'f') toggleFullscreen();
  if (event.key.toLowerCase() === 'h') focusHome();
  if (event.key.toLowerCase() === 'g') pingLocation();
  if (event.key.toLowerCase() === 'o') $('objectives-panel')?.classList.toggle('is-collapsed');
  if (event.key.toLowerCase() === 'x' && started) simulation.issueStop();
  if (event.key === ' ') {
    const selected = gameState.entities.find((entity) => gameState.selectedIds.includes(entity.id));
    if (selected) cameraTarget.set(selected.x, world.heightAt(selected.x, selected.z), selected.z);
    event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

function updateCamera(dt) {
  const speed = 26 * dt * Math.max(0.55, cameraDistance / 62);
  const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  const right = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
  if (keys.has('w') || keys.has('arrowup')) cameraTarget.addScaledVector(forward, speed);
  if (keys.has('s') || keys.has('arrowdown')) cameraTarget.addScaledVector(forward, -speed);
  if (keys.has('a') || keys.has('arrowleft')) cameraTarget.addScaledVector(right, -speed);
  if (keys.has('d') || keys.has('arrowright')) cameraTarget.addScaledVector(right, speed);
  if (keys.has('q')) cameraYaw += dt * 0.72;
  if (keys.has('e')) cameraYaw -= dt * 0.72;
  cameraTarget.x = THREE.MathUtils.clamp(cameraTarget.x, -72, 72);
  cameraTarget.z = THREE.MathUtils.clamp(cameraTarget.z, -54, 54);
  cameraTarget.y = world.heightAt(cameraTarget.x, cameraTarget.z);
  updateCameraPosition();
}

function renderFrame(now = performance.now()) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  updateCamera(dt);
  if (started && now > deterministicUntil) simulation.step(dt);
  syncState();
  world.update(dt);
  renderer.render(scene, camera);
}

function loop(now) {
  renderFrame(now);
  requestAnimationFrame(loop);
}

function startGame({ operationName = 'Horizonte', restored = false } = {}) {
  started = true;
  simulation.setPaused(false);
  audio.resume();
  audio.startAmbience();
  $('main-menu')?.classList.add('is-leaving');
  setTimeout(() => { if ($('main-menu')) $('main-menu').hidden = true; }, 750);
  if ($('game-hud')) {
    $('game-hud').hidden = false;
    $('game-hud').classList.remove('is-hidden');
  }
  if (innerWidth <= 720) $('objectives-panel')?.classList.add('is-collapsed');
  focusHome();
  notify(`${restored ? 'Operación restaurada' : 'Operación iniciada'}: ${operationName}.`, 'success');
}

function stageCombatShowcase() {
  const fresh = createSimulation({ seed: 19001914, ai: false, difficulty: 'normal', startingEra: 1 });
  simulation.load(fresh.serialize());
  clearEntityVisuals();
  world.setEra(1900);
  const state = simulation.state;
  for (const teamId of ['player', 'rival']) {
    const template = state.entities.find((entity) => entity.teamId === teamId && entity.type === 'fusilero');
    for (let index = 0; template && index < 10; index += 1) {
      const reinforcement = structuredClone(template);
      reinforcement.id = simulation._nextEntityId++;
      reinforcement.orders = [];
      reinforcement.velocity = { x: 0, z: 0 };
      reinforcement.attackCooldown = index * 0.11;
      reinforcement.action = 'inactivo';
      state.entities.push(reinforcement);
    }
  }
  simulation._recalculatePopulation();
  const player = state.entities.filter((entity) => entity.teamId === 'player' && entity.kind === 'unit' && entity.type !== 'obrero');
  const rival = state.entities.filter((entity) => entity.teamId === 'rival' && entity.kind === 'unit' && entity.type !== 'obrero');
  const vulnerableArtillery = rival.find((unit) => unit.type === 'artilleria');
  if (vulnerableArtillery) vulnerableArtillery.hp = Math.min(vulnerableArtillery.hp, 36);
  const vulnerableRifle = rival.find((unit) => unit.type === 'fusilero');
  if (vulnerableRifle) vulnerableRifle.hp = Math.min(vulnerableRifle.hp, 8);
  const playerOutpost = state.entities.find((entity) => entity.teamId === 'player' && entity.kind === 'building' && entity.type === 'cuartel');
  const rivalOutpost = state.entities.find((entity) => entity.teamId === 'rival' && entity.kind === 'building' && entity.type === 'cuartel');
  if (playerOutpost) Object.assign(playerOutpost, { x: -16, z: -10, rotation: Math.PI / 2 });
  if (rivalOutpost) Object.assign(rivalOutpost, { x: 16, z: 10, rotation: -Math.PI / 2 });
  const playerFront = [
    [-4.2, -9.4], [-6.8, -7.2], [-5.8, -4.4], [-5, -1.6],
    [-4.6, 1.2], [-4.9, 4], [-5.6, 6.8], [-6.5, 9.6],
    [-9.4, -5.8], [-8.6, -1.2], [-8.5, 4.5], [-9.2, 9],
    [-11.8, -8.2], [-11.1, -3.4], [-10.9, 2.2], [-11.6, 7.2],
  ];
  const rivalFront = [
    [4.2, -9], [6.2, -6.3], [5.2, -3.5], [4.4, -0.7],
    [4, 2.1], [4.4, 4.9], [5.1, 7.7], [6, 10.5],
    [8.8, -5], [8, -0.4], [7.9, 5.3], [8.6, 9.8],
    [11.2, -7.4], [10.5, -2.6], [10.3, 3], [11, 8],
  ];
  player.forEach((unit, index) => {
    [unit.x, unit.z] = playerFront[index % playerFront.length];
    unit.z -= 1.8;
    unit.rotation = Math.PI / 2;
    unit.orders = [{ type: 'attack', targetId: rival[index % rival.length].id }];
  });
  rival.forEach((unit, index) => {
    [unit.x, unit.z] = rivalFront[index % rivalFront.length];
    unit.z -= 1.8;
    unit.rotation = -Math.PI / 2;
    unit.orders = [{ type: 'attack', targetId: player[index % player.length].id }];
  });
  simulation.setFormation('cuna');
  simulation.selectUnits(player.filter((_, index) => [0, 2, 3, 5].includes(index)).map((unit) => unit.id));
  campaignResultHandled = true;
  campaignStartingUnits = player.length;
  startGame({ operationName: 'Campo de pruebas industrial' });
  $('objectives-panel')?.classList.add('is-collapsed');
  [
    [-0.8, -4.2, 'tierra', 1.05],
    [1.4, 3.1, 'metal', 0.88],
    [-1.7, 8.4, 'tierra', 0.78],
  ].forEach(([x, z, material, power], index) => world.createImpact({
    position: { x, y: world.heightAt(x, z) + 0.08, z },
    material,
    power: index === 0 ? 1.55 : power,
    flashLife: index === 0 ? 1.8 : undefined,
    coreLife: index === 0 ? 1.25 : undefined,
  }));
  [
    [-7.1, -7.2, 6.5, -5.8], [-5.6, -3.2, 5.1, -1.6], [-4.9, 1.4, 4.6, 2.7],
    [7.4, 7.6, -6.1, 6.4], [8.3, -1.1, -5.8, 0.2], [-8.2, 8.8, 6.4, 9.2],
  ].forEach(([fromX, fromZ, toX, toZ], index) => world.createProjectile({
    from: { x: fromX, y: world.heightAt(fromX, fromZ) + 1.35, z: fromZ },
    to: { x: toX, y: world.heightAt(toX, toZ) + 1.1, z: toZ },
    kind: 'tracer',
    duration: 1.65 + index * 0.07,
    power: 0.62,
    impact: false,
  }));
  window.setTimeout(() => world.createProjectile({
    from: { x: -7.6, y: world.heightAt(-7.6, -6.4) + 1.42, z: -6.4 },
    to: { x: 0.7, y: world.heightAt(0.7, -3.5) + 0.28, z: -3.5 },
    kind: 'shell',
    duration: 0.38,
    power: 1.75,
    material: 'tierra',
  }), 300);
  window.setTimeout(() => world.createProjectile({
    from: { x: 7.8, y: world.heightAt(7.8, 5.6) + 1.35, z: 5.6 },
    to: { x: -1.3, y: world.heightAt(-1.3, 2.5) + 0.32, z: 2.5 },
    kind: 'tracer',
    duration: 0.42,
    power: 1.1,
    material: 'metal',
  }), 420);
  cameraTarget.set(0, world.heightAt(0, 0), 0);
  cameraDistance = 37.5;
  updateCameraPosition();
  controlVisuals.forEach((visual) => { if (visual.userData.label) visual.userData.label.visible = false; });
  syncState(true);
}

function stageOrbitalShowcase() {
  const fresh = createSimulation({ seed: 21002100, ai: false, difficulty: 'normal', startingEra: 3 });
  simulation.load(fresh.serialize());
  clearEntityVisuals();
  world.setEra(2100);
  const specialists = simulation.state.entities.filter((entity) => entity.teamId === 'player' && ['dron', 'exotraje', 'caminante'].includes(entity.type));
  simulation.selectUnits(specialists.map((entity) => entity.id));
  campaignResultHandled = true;
  startGame({ operationName: 'Puente de Selene' });
  $('objectives-panel')?.classList.add('is-collapsed');
  cameraTarget.set(-48, world.heightAt(-48, 30), 30);
  cameraDistance = 47;
  updateCameraPosition();
  syncState(true);
}

function stageEconomyShowcase() {
  launchScenario(CAMPAIGN.escenarios[0].id);
  const state = simulation.state;
  const housingTemplate = state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'vivienda');
  const barracksTemplate = state.entities.find((entity) => entity.teamId === 'player' && entity.type === 'cuartel');
  const matureBuildingSlots = [
    [-53, 21, housingTemplate], [-37, 28, housingTemplate], [-37, 40, barracksTemplate],
    [-52, 48, housingTemplate], [-67, 46, barracksTemplate], [-70, 29, housingTemplate],
  ];
  matureBuildingSlots.forEach(([x, z, template], index) => {
    if (!template) return;
    const building = structuredClone(template);
    building.id = simulation._nextEntityId++;
    building.x = x;
    building.z = z;
    building.rotation = index % 2 ? Math.PI : 0;
    building.hp = building.maxHp;
    building.buildRemaining = 0;
    building.action = 'inactivo';
    state.entities.push(building);
  });
  const resourceNodes = state.entities.filter((entity) => entity.kind === 'resource' && entity.amount > 0);
  const originalWorkers = state.entities.filter((entity) => entity.teamId === 'player' && entity.type === 'obrero').slice(0, 6);
  const workerIds = [];
  originalWorkers.forEach((template, index) => {
    const worker = structuredClone(template);
    worker.id = simulation._nextEntityId++;
    worker.x = -58 + (index % 3) * 6;
    worker.z = 23 + Math.floor(index / 3) * 20;
    worker.action = 'inactivo';
    worker.orders = [];
    workerIds.push(worker.id);
    state.entities.push(worker);
  });
  simulation._recalculatePopulation();
  workerIds.forEach((workerId, index) => {
    const node = resourceNodes[index % Math.max(1, resourceNodes.length)];
    simulation.selectUnits([workerId]);
    if (node) simulation.issueGather(node.id);
  });
  simulation.advance(2000);
  simulation.advance(2000);
  simulation.advance(1000);
  const workers = simulation.state.entities.filter((entity) => entity.teamId === 'player' && entity.type === 'obrero');
  const featuredWorker = workers[4] ?? workers[0];
  simulation.selectUnits(featuredWorker ? [featuredWorker.id] : []);
  $('objectives-panel')?.classList.add('is-collapsed');
  cameraTarget.set(-47, world.heightAt(-47, 39), 39);
  cameraDistance = 37.5;
  updateCameraPosition();
  syncState(true);
}

function stageCavalryShowcase() {
  const fresh = createSimulation({ seed: 18441844, ai: false, difficulty: 'normal', startingEra: 0 });
  simulation.load(fresh.serialize());
  clearEntityVisuals();
  clearControlVisuals();
  world.setEra(1800);
  const riders = simulation.state.entities.filter((entity) => entity.teamId === 'player' && entity.type === 'fusilero').slice(0, 2);
  riders.forEach((unit, index) => {
    unit.type = 'caballeria';
    unit.nombre = 'Caballería de exploración';
    unit.x = -1.8 + index * 3.6;
    unit.z = index ? 1.2 : -1.2;
    unit.rotation = Math.PI * (0.35 + index * 0.2);
    unit.orders = [];
  });
  simulation.selectUnits(riders.map((unit) => unit.id));
  campaignResultHandled = true;
  scenarioRuntime = null;
  startGame({ operationName: 'Revista de caballería de 1800' });
  cameraTarget.set(0, world.heightAt(0, 0), 0);
  cameraDistance = 27;
  updateCameraPosition();
  syncState(true);
}

$('start-game-btn')?.addEventListener('click', (event) => openCampaignArchive(event.currentTarget));
$('continue-game-btn')?.addEventListener('click', loadStrategicArchive);
$('campaign-close-btn')?.addEventListener('click', closeCampaignArchive);
$('campaign-continue-btn')?.addEventListener('click', () => launchScenario(selectedScenarioId));
$('campaign-load-btn')?.addEventListener('click', loadStrategicArchive);
$('campaign-save-btn')?.addEventListener('click', saveCampaignProgress);
$('campaign-new-btn')?.addEventListener('click', () => {
  campaign.reset();
  clearMatchSave();
  diplomacy = createInitialDiplomacy();
  controlGroups.clear();
  selectedScenarioId = CAMPAIGN.escenarios[0].id;
  renderCampaignArchive();
  notify('Cronología reiniciada. El primer expediente está listo.', 'info', 'Nueva campaña');
});
document.querySelectorAll('.operation-file').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.state === 'locked') return;
  selectedScenarioId = button.dataset.operation;
  renderCampaignArchive();
}));
$('resume-btn')?.addEventListener('click', () => togglePause(false));
$('restart-btn')?.addEventListener('click', () => launchScenario(selectedScenarioId));
$('fullscreen-btn')?.addEventListener('click', toggleFullscreen);
$('pause-btn')?.addEventListener('click', () => togglePause());
$('objectives-btn')?.addEventListener('click', () => $('objectives-panel')?.classList.toggle('is-collapsed'));
$('objectives-close-btn')?.addEventListener('click', () => $('objectives-panel')?.classList.add('is-collapsed'));
$('ping-btn')?.addEventListener('click', pingLocation);
$('toggle-terrain-btn')?.addEventListener('click', toggleTerrainView);
$('toggle-diplomacy-btn')?.addEventListener('click', toggleDiplomacyView);
$('diplomacy-close-btn')?.addEventListener('click', closeDiplomacy);
document.querySelectorAll('[data-diplomacy-action]').forEach((button) => button.addEventListener('click', () => executeDiplomaticAction(button.dataset.factionId)));
$('settings-btn')?.addEventListener('click', (event) => {
  if (controlsVisible()) closeControls();
  else openControls({ trigger: event.currentTarget });
});
$('credits-btn')?.addEventListener('click', (event) => openControls({ credits: true, trigger: event.currentTarget }));
$('controls-overlay')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeControls();
});
$('controls-close-btn')?.addEventListener('click', closeControls);
$('return-menu-btn')?.addEventListener('click', () => {
  saveStrategicArchive({ silent: true });
  location.reload();
});
$('victory-next-btn')?.addEventListener('click', (event) => {
  const overlay = $('victory-overlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.classList.add('is-hidden');
    overlay.classList.remove('is-visible');
  }
  openCampaignArchive(event.currentTarget);
});
$('victory-menu-btn')?.addEventListener('click', () => location.reload());
$('defeat-menu-btn')?.addEventListener('click', () => location.reload());
$('defeat-restart-btn')?.addEventListener('click', () => launchScenario(selectedScenarioId));
$('minimap-canvas')?.addEventListener('click', (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  cameraTarget.x = ((event.clientX - rect.left) / rect.width) * 160 - 80;
  cameraTarget.z = ((event.clientY - rect.top) / rect.height) * 120 - 60;
  updateCameraPosition();
});

window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  syncState(true);
});

window.advanceTime = (milliseconds) => {
  deterministicUntil = performance.now() + 1000;
  if (!started) launchScenario(selectedScenarioId);
  let remaining = Math.max(0, Number(milliseconds) || 0);
  while (remaining > 0) {
    const slice = Math.min(1000, remaining);
    simulation.advance(slice);
    remaining -= slice;
  }
  syncState(true);
  world.update(milliseconds / 1000);
  renderer.render(scene, camera);
};
window.render_game_to_text = () => JSON.stringify({
  ...simulation.getRenderState(),
  campaign: {
    selectedScenarioId,
    active: campaign.getActiveScenario(),
    progress: campaign.getState(),
    operationMetrics: scenarioRuntime?.evaluate(simulation.getState()) || null,
    appliedBonuses: simulation.state.mission?.campaignBonuses || null,
  },
  diplomacy: {
    turn: diplomacy.getState().turno,
    influence: diplomacy.getState().facciones.aurora.influencia,
    relations: ['liga-atlantica', 'directorio-danubio', 'pacto-hierro'].map((factionId) => ({ factionId, ...diplomacy.getRelation('aurora', factionId) })),
  },
  camera: { targetX: Number(cameraTarget.x.toFixed(2)), targetZ: Number(cameraTarget.z.toFixed(2)), distance: Number(cameraDistance.toFixed(1)) },
  interaction: { buildMode, commandMode, controls: 'Clic selecciona; arrastre selección múltiple; clic derecho mueve/ataca/recolecta o fija rally; Ctrl+clic derecho avanza atacando; P patrulla; Z/N/J eligen postura agresiva/defensiva/mantener; L/K/C eligen línea/columna/cuña; R repara; Shift encola; F2 edificios; F3 pioneros; F4 ejército; Ctrl+1–9 asigna grupo; 1–9 recupera; WASD cámara; Q/E rotar; Esc pausa; Ctrl/Cmd+S guardar; F pantalla completa.' },
  controlGroups: Object.fromEntries([...controlGroups].map(([index, ids]) => [index, [...ids]])),
});

setSaveStatus(hasMatchSave() ? 'Registro local disponible' : 'Sin partida guardada');
syncState(true);
requestAnimationFrame(loop);
if (import.meta.env.DEV) {
  if (activeShowcase === 'combat') requestAnimationFrame(stageCombatShowcase);
  if (activeShowcase === 'orbital') requestAnimationFrame(stageOrbitalShowcase);
  if (activeShowcase === 'cavalry') requestAnimationFrame(stageCavalryShowcase);
  if (activeShowcase === 'economy') requestAnimationFrame(stageEconomyShowcase);
}
