/**
 * Cronicas del Horizonte - mundo procedural Three.js
 *
 * El modulo no importa Three.js a proposito: la aplicacion entrega su propia
 * instancia para que no haya dos copias de la libreria en el bundle.
 */

export const ERAS = Object.freeze({
  1800: { nombre: 'Era del Vapor', color: 0xb87333, energia: 'vapor' },
  1900: { nombre: 'Era de la Industria', color: 0x59636a, energia: 'electricidad' },
  2000: { nombre: 'Era Digital', color: 0x2e86ab, energia: 'red' },
  2100: { nombre: 'Era Orbital', color: 0x8d6bff, energia: 'orbital' },
});

const ERA_YEARS = Object.keys(ERAS).map(Number);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const assetUrl = (filename) => `${import.meta.env.BASE_URL}assets/${filename}`;

// Presupuesto visual deliberado: el mundo gana densidad por instancing y no
// por cientos de objetos sueltos. Los multiplicadores se aplican sobre el
// tamano del mapa para conservar la misma lectura en escenarios alternativos.
const WORLD_DETAIL_BUDGET = Object.freeze({
  treesPerUnit: 1.95,
  rocksPerUnit: 0.48,
  groundTuftsPerUnit: 3.55,
  coastElementsPerUnit: 1.12,
  biomeClusters: 9,
  eraClusters: 6,
});

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 0.013) * 43758.5453123;
  return value - Math.floor(value);
}

function smoothNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

function fbm(x, y, seed) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 5; octave += 1) {
    value += smoothNoise(x * frequency, y * frequency, seed + octave * 71) * amplitude;
    frequency *= 2.03;
    amplitude *= 0.49;
  }
  return value;
}

function nearestEra(year) {
  return ERA_YEARS.reduce((best, current) =>
    Math.abs(current - year) < Math.abs(best - year) ? current : best,
  ERA_YEARS[0]);
}

function configureRenderer(THREE, renderer) {
  if (!renderer) return;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
}

function shadowize(object, cast = true, receive = true) {
  object.traverse((child) => {
    if (!child.isMesh && !child.isInstancedMesh) return;
    if (child.userData.groundDecal || child.userData.wallDecal) {
      child.castShadow = false;
      child.receiveShadow = false;
      return;
    }
    child.castShadow = cast;
    child.receiveShadow = receive;
  });
  return object;
}

function makeMaterial(THREE, color, roughness = 0.72, metalness = 0.08, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function applyMacroSurfaceShader(material, seed = 1) {
  // Tres escalas de variacion procedural rompen la lectura de "alfombra":
  // manchas de suelo, erosion media y grano mineral. No requiere assets ni
  // lecturas extra de textura y se atenúa automaticamente a distancia.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMacroSeed = { value: seed * 0.0137 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMacroWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMacroWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMacroWorld;\nuniform float uMacroSeed;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float macroA = sin(vMacroWorld.x * 0.105 + uMacroSeed) * cos(vMacroWorld.z * 0.087 - uMacroSeed * 1.7);
         float macroB = sin((vMacroWorld.x + vMacroWorld.z) * 0.031 + uMacroSeed * 2.3);
         float strata = sin(vMacroWorld.x * 0.47 + sin(vMacroWorld.z * 0.19) * 1.8 + uMacroSeed * 4.0);
         float mineral = sin(vMacroWorld.x * 2.73 + vMacroWorld.z * 1.91 + uMacroSeed * 9.0)
                       * sin(vMacroWorld.z * 3.37 - vMacroWorld.x * 1.29);
         float pixelSpan = max(fwidth(vMacroWorld.x), fwidth(vMacroWorld.z));
         float microFade = 1.0 - smoothstep(0.34, 1.15, pixelSpan);
         float macroMix = macroA * 0.075 + macroB * 0.055 + strata * 0.025;
         float grit = mineral * 0.032 * microFade;
         vec3 warmSoil = vec3(1.055, 0.985, 0.88);
         vec3 coolMoss = vec3(0.91, 1.045, 0.92);
         diffuseColor.rgb *= mix(warmSoil, coolMoss, smoothstep(-0.18, 0.24, macroA));
         diffuseColor.rgb *= vec3(1.0 + macroMix * 0.62 + grit, 1.0 + macroMix + grit * 0.72, 1.0 + macroMix * 0.42);`,
      );
  };
  material.customProgramCacheKey = () => `macro-surface-${seed}`;
  return material;
}

function createSurfaceTexture(THREE, seed = 1, resolution = 256) {
  const pixels = new Uint8Array(resolution * resolution * 4);
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const broad = smoothNoise(x * 0.055, y * 0.055, seed);
      const mid = smoothNoise(x * 0.19 + 37, y * 0.19 - 19, seed + 23);
      const grain = hash2(x * 0.83, y * 0.83, seed + 47);
      const fleck = grain > 0.918 ? -42 : grain < 0.034 ? 26 : 0;
      const value = clamp(Math.round(180 + broad * 50 + (mid - 0.5) * 24 + (grain - 0.5) * 20 + fleck), 82, 246);
      const offset = (y * resolution + x) * 4;
      // El tinte es casi neutro para conservar vertexColors, pero alterna
      // humus seco/musgo y aporta lectura de material a distancia RTS.
      pixels[offset] = clamp(value + Math.round((broad - 0.5) * 13), 88, 250);
      pixels[offset + 1] = clamp(value + Math.round((grain - 0.5) * 7), 88, 250);
      pixels[offset + 2] = clamp(value - Math.round((broad - 0.42) * 16), 82, 246);
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, resolution, resolution, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 24);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createSmokeTexture(THREE, seed = 1, resolution = 64) {
  const pixels = new Uint8Array(resolution * resolution * 4);
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const nx = (x + 0.5) / resolution * 2 - 1;
      const ny = (y + 0.5) / resolution * 2 - 1;
      const radius = Math.hypot(nx, ny);
      const cloud = smoothNoise(x * 0.11, y * 0.11, seed) * 0.42 + 0.72;
      const alpha = clamp((1 - radius) * 2.15, 0, 1) ** 2 * cloud;
      const offset = (y * resolution + x) * 4;
      pixels[offset] = 205;
      pixels[offset + 1] = 211;
      pixels[offset + 2] = 205;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, resolution, resolution, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

const smokeTextureCache = new WeakMap();
const muzzleTextureCache = new WeakMap();
const healthTextureCache = new WeakMap();

function sharedSmokeTexture(THREE) {
  let texture = smokeTextureCache.get(THREE);
  if (!texture) {
    texture = createSmokeTexture(THREE, 847, 64);
    smokeTextureCache.set(THREE, texture);
  }
  return texture;
}

function sharedMuzzleTexture(THREE) {
  let texture = muzzleTextureCache.get(THREE);
  if (texture) return texture;
  const resolution = 64;
  const pixels = new Uint8Array(resolution * resolution * 4);
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const nx = (x + 0.5) / resolution * 2 - 1;
      const ny = (y + 0.5) / resolution * 2 - 1;
      const radius = Math.hypot(nx, ny);
      const angle = Math.atan2(ny, nx);
      const core = clamp(1 - radius * 5.2, 0, 1) ** 1.45;
      const rays = Math.pow(Math.abs(Math.cos(angle * 4)), 24) * clamp(1 - radius, 0, 1) ** 2.4;
      const alpha = clamp(Math.max(core, rays * 0.82), 0, 1);
      const offset = (y * resolution + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 242;
      pixels[offset + 2] = 206;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  texture = new THREE.DataTexture(pixels, resolution, resolution, THREE.RGBAFormat);
  texture.needsUpdate = true;
  muzzleTextureCache.set(THREE, texture);
  return texture;
}

function sharedHealthTexture(THREE) {
  let texture = healthTextureCache.get(THREE);
  if (texture) return texture;
  const width = 80;
  const height = 8;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const segmentGap = x % 8 === 7;
      const edge = y === 0 || y === height - 1;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = segmentGap || edge ? 0 : 255;
    }
  }
  texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  healthTextureCache.set(THREE, texture);
  return texture;
}

function addHealthBar(THREE, entity, options = {}) {
  const bar = new THREE.Group();
  const width = options.width ?? 2.1;
  const height = options.height ?? 0.13;
  const background = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x09100f,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    depthTest: false,
  }));
  const fill = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sharedHealthTexture(THREE),
    color: 0x66d98a,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    depthTest: false,
  }));
  background.scale.set(width + 0.12, height + 0.075, 1);
  background.renderOrder = 90;
  fill.position.z = 0.002;
  fill.scale.set(width, height, 1);
  fill.renderOrder = 91;
  bar.position.y = options.y ?? 2.55;
  bar.visible = false;
  bar.userData.healthBar = true;
  bar.userData.baseWidth = width;
  bar.userData.baseHeight = height;
  bar.userData.baseY = bar.position.y;
  bar.userData.background = background;
  bar.userData.fill = fill;
  bar.add(background, fill);
  entity.add(bar);
  entity.userData.healthBar = bar;
  return bar;
}

function makeBox(THREE, size, position, material, bevel = 0) {
  // RoundedBoxGeometry no forma parte del core; el bevel se sugiere con un zocalo.
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2], 1, 1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  if (bevel) mesh.userData.bevel = bevel;
  return mesh;
}

function makeCylinder(THREE, radiusTop, radiusBottom, height, segments, material) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, false),
    material,
  );
}

function createIrregularDiscGeometry(THREE, segments = 24, seed = 1) {
  const positions = [0, 0, 0];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const radius = 0.78 + hash2(index, seed, seed + 29) * 0.28;
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    if (index > 0) indices.push(0, index, index + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createOrganicCanopyGeometry(THREE, radius = 1, seed = 1, verticalScale = 1) {
  const geometry = new THREE.IcosahedronGeometry(radius, 2);
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    const direction = point.clone().normalize();
    const coarse = hash2(
      Math.round(direction.x * 37) + Math.round(direction.y * 29) * 0.17,
      Math.round(direction.z * 41) + Math.round(direction.y * 23) * 0.13,
      seed,
    );
    const lobe = 0.82 + coarse * 0.34 + Math.sin(direction.x * 7 + direction.z * 5 + seed) * 0.055;
    point.copy(direction).multiplyScalar(radius * lobe);
    point.y *= verticalScale;
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createGrassTuftGeometry(THREE) {
  const positions = [];
  const indices = [];
  for (let blade = 0; blade < 6; blade += 1) {
    const angle = (blade / 6) * Math.PI * 2 + (blade % 2) * 0.24;
    const width = 0.055 + (blade % 3) * 0.012;
    const height = 0.55 + (blade % 4) * 0.1;
    const lean = 0.1 + (blade % 2) * 0.08;
    const rightX = Math.cos(angle) * width;
    const rightZ = Math.sin(angle) * width;
    const tipX = Math.sin(angle) * lean;
    const tipZ = Math.cos(angle) * lean;
    const offset = positions.length / 3;
    positions.push(-rightX, 0, -rightZ, rightX, 0, rightZ, tipX, height * 0.72, tipZ, tipX * 1.22, height, tipZ * 1.22);
    indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createCrossBillboardGeometry(THREE, [u0, v0, u1, v1]) {
  const positions = [
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
    0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5,
  ];
  const faceUvs = [u0, v0, u1, v0, u1, v1, u0, v1];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([...faceUvs, ...faceUvs], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  geometry.computeVertexNormals();
  return geometry;
}

function createChromaFoliageMaterial(THREE, texture) {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0.01,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        float magentaDominance = min(sampledDiffuseColor.r, sampledDiffuseColor.b) - sampledDiffuseColor.g;
        float chroma = step(0.42, sampledDiffuseColor.r) * step(0.4, sampledDiffuseColor.b) * step(0.045, magentaDominance);
        float edgeSpill = step(sampledDiffuseColor.g * 1.1, sampledDiffuseColor.r)
                        * step(sampledDiffuseColor.g * 0.74, sampledDiffuseColor.b);
        if (chroma > 0.5 || edgeSpill > 0.5) discard;
        diffuseColor *= sampledDiffuseColor;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => 'foliage-chroma-lit-v2';
  return material;
}

function unitAtlasCell(era, type, options = {}) {
  const row = clamp(Math.round((era - 1800) / 100), 0, 3);
  const simulationType = options.simulationType ?? type;
  let column = 0;
  if (simulationType === 'obrero') column = 3;
  else if (type === 'artilleria') column = 1;
  else if (type === 'tanque' || type === 'vehiculo') column = 2;
  else if (type === 'dron' || type === 'aeronave') column = 3;
  return { row, column };
}

function createUnitAtlasMaterial(THREE, texture, row, column, teamColor, options = {}) {
  const v0 = (3 - row) * 0.25;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: texture },
      uRect: { value: options.rect ?? new THREE.Vector4(column * 0.25, v0, (column + 1) * 0.25, v0 + 0.25) },
      uTeamColor: { value: new THREE.Color(teamColor) },
      uOutlineBrightness: { value: options.outlineBrightness ?? 0.14 },
      uBaseWash: { value: options.baseWash ?? 0.24 },
      uAccentWash: { value: options.accentWash ?? 0.62 },
      uBrightness: { value: options.brightness ?? 1.12 },
      uGamma: { value: options.gamma ?? 0.74 },
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
      uniform vec3 uTeamColor;
      uniform float uOutlineBrightness;
      uniform float uBaseWash;
      uniform float uAccentWash;
      uniform float uBrightness;
      uniform float uGamma;
      varying vec2 vUv;
      float isChroma(vec3 color) {
        float magenta = min(color.r, color.b) - color.g;
        return step(0.22, min(color.r, color.b)) * step(0.045, magenta);
      }
      void main() {
        vec2 atlasUv = mix(uRect.xy, uRect.zw, vUv);
        vec4 sampled = texture2D(uAtlas, atlasUv);
        float chroma = isChroma(sampled.rgb);
        if (chroma > 0.5) discard;
        vec3 lifted = pow(clamp(sampled.rgb, 0.0, 1.0), vec3(uGamma));
        float cyanAccent = smoothstep(0.08, 0.34, min(lifted.g, lifted.b) - lifted.r)
                         * smoothstep(0.34, 0.82, lifted.b);
        float warmAccent = smoothstep(0.09, 0.32, lifted.r - max(lifted.g, lifted.b))
                         * smoothstep(0.3, 0.78, lifted.r);
        float factionAccent = max(cyanAccent, warmAccent);
        float luminance = dot(lifted, vec3(0.2126, 0.7152, 0.0722));
        vec3 baseTeamWash = mix(lifted, uTeamColor, clamp(0.22 + luminance * 0.08, 0.0, 0.34));
        vec3 accentTeamWash = mix(lifted * 0.28, uTeamColor, 0.72);
        vec3 teamWash = mix(baseTeamWash, accentTeamWash, factionAccent);
        vec3 identified = mix(lifted, teamWash, uBaseWash + factionAccent * uAccentWash);
        float verticalLight = mix(0.84, 1.06, smoothstep(0.04, 0.96, vUv.y));
        float sideLight = mix(0.93, 1.04, smoothstep(0.05, 0.95, vUv.x));
        vec3 worldIntegrated = identified * verticalLight * sideLight;
        gl_FragColor = vec4(worldIntegrated * uBrightness, 1.0);
      }
    `,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
  });
  material.userData.sharedMap = true;
  return material;
}

function addUnitAtlasSilhouette(THREE, model, options, era, type) {
  const { row, column } = unitAtlasCell(era, type, options);
  const directionalRow = era >= 2100 ? 0 : era >= 2000 ? 2 : era >= 1900 ? 1 : -1;
  const useDirectionalAtlas = column === 0 && directionalRow >= 0 && options.directionalUnitAtlasTexture;
  const texture = useDirectionalAtlas ? options.directionalUnitAtlasTexture : options.unitAtlasTexture;
  if (!texture) return null;
  const isDrone = type === 'dron' || type === 'aeronave';
  const isWalker = row === 3 && column === 2 && (options.health ?? 0) > 480;
  const dimensions = column === 0
    ? [2.75, row === 3 ? 3.35 : 2.95]
    : column === 1
      ? [4.25, row === 3 ? 3.45 : 3.2]
      : column === 2
        ? [isWalker ? 3.65 : 4.65, isWalker ? 3.85 : 3.45]
        : isDrone
          ? [3.75, 2.45]
          : [2.85, 3.05];
  model.traverse((part) => {
    if ((part.isMesh || part.isSprite) && !part.userData.groundDecal && !part.userData.stepDust) part.visible = false;
  });
  const geometry = new THREE.PlaneGeometry(dimensions[0], dimensions[1]);
  geometry.translate(0, dimensions[1] * 0.5, 0);
  const directionalV0 = (3 - directionalRow) * 0.25;
  const material = createUnitAtlasMaterial(THREE, texture, row, column, options.teamColor ?? 0xd6b85a, useDirectionalAtlas ? {
    rect: new THREE.Vector4(0, directionalV0, 1 / 7, directionalV0 + 0.25),
    baseWash: 0.29,
    accentWash: 0.9,
    brightness: 1.28,
    gamma: 0.66,
  } : {});
  const silhouette = new THREE.Mesh(geometry, material);
  const variation = 0.95 + hash2(Math.floor((options.phase ?? 0) * 1000), row * 17 + column * 31, 741) * 0.1;
  silhouette.userData.rtsAtlasSilhouette = true;
  silhouette.userData.combatSilhouette = true;
  silhouette.userData.baseScaleX = variation;
  silhouette.userData.baseScaleY = 1.98 - variation;
  silhouette.userData.baseY = 0;
  silhouette.userData.directional = true;
  silhouette.userData.directionalAtlas = Boolean(useDirectionalAtlas);
  silhouette.userData.directionalAtlasRow = directionalRow;
  silhouette.userData.atlasCell = `${row}:${column}`;
  silhouette.renderOrder = 2;
  const shadowWidth = dimensions[0] * (column === 0 ? 0.58 : 0.72);
  const shadowDepth = column === 0 ? 1.02 : 1.42;
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(shadowWidth, shadowDepth),
    new THREE.MeshBasicMaterial({
      map: sharedSmokeTexture(THREE),
      color: 0x050707,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.028, 0.08);
  shadow.userData.groundDecal = true;
  shadow.renderOrder = 1;
  model.add(shadow, silhouette);
  model.userData.atlasSilhouette = silhouette;
  return silhouette;
}

function buildingAtlasCell(era, type) {
  const row = clamp(Math.round((era - 1800) / 100), 0, 3);
  let column = 3;
  if (type === 'centro' || type === 'cuartelGeneral') column = 0;
  else if (type === 'cuartel' || type === 'hangar' || type === 'bastion') column = 1;
  else if (type === 'fabrica' || type === 'fundicion' || type === 'central') column = 2;
  return { row, column };
}

function addBuildingAtlasSilhouette(THREE, model, options, era, type) {
  const texture = options.buildingAtlasTexture;
  if (!texture) return null;
  const { row, column } = buildingAtlasCell(era, type);
  const dimensions = column === 0
    ? [10.6, 8.3]
    : column === 1
      ? [9.4, 7.3]
      : column === 2
        ? [10.1, 7.6]
        : [8.7, 7.0];
  model.traverse((part) => {
    if ((part.isMesh || part.isSprite) && !part.userData.keepWithAtlas && !part.userData.groundDecal) part.visible = false;
  });
  const foundationShape = new THREE.Shape();
  const foundationSegments = 14;
  for (let index = 0; index < foundationSegments; index += 1) {
    const angle = index / foundationSegments * Math.PI * 2;
    const variation = 0.9 + hash2(index, row * 17 + column * 29, 741) * 0.16;
    const x = Math.cos(angle) * dimensions[0] * 0.46 * variation;
    const y = Math.sin(angle) * dimensions[0] * 0.29 * variation;
    if (index === 0) foundationShape.moveTo(x, y);
    else foundationShape.lineTo(x, y);
  }
  foundationShape.closePath();
  const foundation = new THREE.Mesh(
    new THREE.ShapeGeometry(foundationShape),
    new THREE.MeshBasicMaterial({
      color: era >= 2100 ? 0x667180 : era >= 2000 ? 0x5c6665 : era >= 1900 ? 0x675e50 : 0x705f49,
      transparent: true,
      opacity: era >= 2100 ? 0.48 : 0.38,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  foundation.rotation.x = -Math.PI / 2;
  foundation.position.y = 0.018;
  foundation.userData.groundDecal = true;
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(dimensions[0] * 0.88, dimensions[0] * 0.48),
    new THREE.MeshBasicMaterial({
      map: sharedSmokeTexture(THREE),
      color: 0x050707,
      transparent: true,
      opacity: 0.31,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(dimensions[0] * -0.055, 0.032, dimensions[0] * 0.045);
  shadow.userData.groundDecal = true;
  const geometry = new THREE.PlaneGeometry(dimensions[0], dimensions[1]);
  geometry.translate(0, dimensions[1] * 0.5, 0);
  const material = createUnitAtlasMaterial(THREE, texture, row, column, options.teamColor ?? 0xd6b85a, {
    outlineBrightness: 0.08,
    baseWash: 0.07,
    accentWash: 0.9,
    brightness: 1.08,
    gamma: 0.9,
  });
  const silhouette = new THREE.Mesh(geometry, material);
  silhouette.userData.rtsAtlasSilhouette = true;
  silhouette.userData.combatSilhouette = true;
  silhouette.userData.baseScaleX = 1;
  silhouette.userData.directional = false;
  silhouette.userData.atlasCell = `${row}:${column}`;
  silhouette.renderOrder = 1;
  model.add(foundation, shadow, silhouette);
  if (era <= 1900 && column <= 2) {
    const smokeCount = column === 2 ? 2 : 1;
    for (let index = 0; index < smokeCount; index += 1) {
      const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sharedSmokeTexture(THREE),
        color: era <= 1800 ? 0x68615a : 0x565b5b,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }));
      smoke.position.set((index - (smokeCount - 1) * 0.5) * 1.1 - dimensions[0] * 0.12, dimensions[1] * 0.78, 0.08);
      smoke.scale.setScalar(1.05 + index * 0.18);
      smoke.userData.smoke = true;
      smoke.userData.baseY = smoke.position.y;
      smoke.userData.phase = hash2(index, row * 13 + column * 7, 883);
      model.add(smoke);
    }
  }
  model.userData.atlasSilhouette = silhouette;
  return silhouette;
}

function addWorkerCargoVisual(THREE, model) {
  const cargo = new THREE.Group();
  cargo.name = 'carga-economica-visible';
  cargo.position.set(-0.78, 0.62, 0.08);
  cargo.userData.cargoRoot = true;
  cargo.visible = false;

  const wood = new THREE.Group();
  wood.userData.cargoResource = 'madera';
  const woodMaterial = makeMaterial(THREE, 0x76502f, 0.9, 0.02);
  for (let index = 0; index < 3; index += 1) {
    const log = makeCylinder(THREE, 0.09, 0.105, 0.82, 7, woodMaterial);
    log.rotation.z = Math.PI / 2;
    log.position.set(0, index * 0.18, (index % 2) * 0.13);
    wood.add(log);
  }

  const food = new THREE.Group();
  food.userData.cargoResource = 'alimentos';
  const sackMaterial = makeMaterial(THREE, 0xb49561, 0.94, 0);
  for (const [x, y] of [[-0.16, 0], [0.17, 0.05]]) {
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 7), sackMaterial);
    sack.scale.set(0.8, 1.15, 0.72);
    sack.position.set(x, y + 0.18, 0);
    food.add(sack);
  }

  const steel = new THREE.Group();
  steel.userData.cargoResource = 'acero';
  const steelMaterial = makeMaterial(THREE, 0x8a989b, 0.28, 0.78);
  for (let index = 0; index < 3; index += 1) {
    const ingot = makeBox(THREE, [0.62, 0.12, 0.22], [0, index * 0.14, 0], steelMaterial, 0.025);
    ingot.rotation.y = (index - 1) * 0.08;
    steel.add(ingot);
  }

  const energy = new THREE.Group();
  energy.userData.cargoResource = 'energia';
  const energyShell = makeMaterial(THREE, 0x34464d, 0.38, 0.66);
  const energyGlow = makeMaterial(THREE, 0x66d9ff, 0.14, 0.36, { emissive: 0x66d9ff, emissiveIntensity: 1.8 });
  for (const side of [-1, 1]) {
    const cell = makeCylinder(THREE, 0.13, 0.15, 0.58, 10, energyShell);
    cell.position.set(side * 0.17, 0.28, 0);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 12), energyGlow);
    band.rotation.x = Math.PI / 2;
    band.position.set(side * 0.17, 0.3, 0);
    energy.add(cell, band);
  }

  const knowledge = new THREE.Group();
  knowledge.userData.cargoResource = 'conocimiento';
  const caseMaterial = makeMaterial(THREE, 0x263943, 0.42, 0.62);
  const caseGlow = makeMaterial(THREE, 0x74d9ff, 0.16, 0.34, { emissive: 0x74d9ff, emissiveIntensity: 1.5 });
  knowledge.add(
    makeBox(THREE, [0.62, 0.48, 0.24], [0, 0.24, 0], caseMaterial, 0.06),
    makeBox(THREE, [0.42, 0.08, 0.03], [0, 0.27, 0.135], caseGlow, 0.02),
  );

  cargo.add(wood, food, steel, energy, knowledge);
  cargo.children.forEach((resource) => { resource.visible = false; });
  cargo.traverse((part) => { part.renderOrder = 3; });
  (model.userData.atlasSilhouette ?? model).add(cargo);
  model.userData.cargoVisual = cargo;
  return cargo;
}

function addWindowGrid(THREE, parent, options) {
  const {
    width, height, depth, rows = 2, columns = 4, y = 2, color = 0x8edcff,
    emissiveIntensity = 0.8,
  } = options;
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity,
    roughness: 0.22,
    metalness: 0.25,
  });
  const windowWidth = width / (columns * 1.7);
  const windowHeight = height / (rows * 2.1);
  const geometry = new THREE.BoxGeometry(windowWidth, windowHeight, 0.07);
  const windows = new THREE.InstancedMesh(geometry, material, rows * columns * 2);
  const dummy = new THREE.Object3D();
  let index = 0;
  for (const side of [-1, 1]) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        dummy.position.set(
          (column - (columns - 1) / 2) * (width / columns),
          y + (row - (rows - 1) / 2) * (height / rows),
          side * (depth / 2 + 0.04),
        );
        if (side < 0) dummy.rotation.y = Math.PI;
        else dummy.rotation.y = 0;
        dummy.updateMatrix();
        windows.setMatrixAt(index++, dummy.matrix);
      }
    }
  }
  windows.instanceMatrix.needsUpdate = true;
  parent.add(windows);
  return windows;
}

function createFlag(THREE, color = 0xd7b95d) {
  const flag = new THREE.Group();
  const pole = makeCylinder(THREE, 0.035, 0.05, 2.5, 8, makeMaterial(THREE, 0x4d5357, 0.35, 0.8));
  pole.position.y = 1.25;
  const clothGeometry = new THREE.BufferGeometry();
  clothGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 2.35, 0, 1.1, 2.25, 0, 0.88, 1.7, 0, 0, 1.78, 0,
  ], 3));
  clothGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  clothGeometry.computeVertexNormals();
  const cloth = new THREE.Mesh(clothGeometry, makeMaterial(THREE, color, 0.8, 0.03, { side: THREE.DoubleSide }));
  cloth.userData.windCloth = true;
  flag.add(pole, cloth);
  return flag;
}

function createIndustrialBuilding(THREE, palette) {
  const group = new THREE.Group();
  const brick = makeMaterial(THREE, palette.wall, 0.92, 0.02);
  const roof = makeMaterial(THREE, palette.roof, 0.58, 0.55);
  const dark = makeMaterial(THREE, 0x242a2c, 0.65, 0.55);
  const smokeTexture = sharedSmokeTexture(THREE);
  const body = makeBox(THREE, [6.6, 3.3, 5.2], [0, 1.65, 0], brick, 0.12);
  const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(4.45, 2.1, 4), roof);
  roofMesh.rotation.y = Math.PI / 4;
  roofMesh.scale.z = 0.82;
  roofMesh.position.y = 4.15;
  group.add(body, roofMesh);
  const masonryTrim = makeMaterial(THREE, 0x332d29, 0.88, 0.04);
  for (const y of [0.34, 2.92]) {
    group.add(makeBox(THREE, [6.76, 0.16, 5.34], [0, y, 0], masonryTrim));
  }
  for (const x of [-2.2, 0, 2.2]) {
    group.add(makeBox(THREE, [0.12, 2.45, 0.18], [x, 1.55, 2.7], masonryTrim));
  }
  for (const x of [-2.15, 2.15]) {
    const chimney = makeCylinder(THREE, 0.45, 0.62, 5.4, 14, dark);
    chimney.position.set(x, 5.1, 1.25);
    const lip = makeCylinder(THREE, 0.56, 0.56, 0.25, 14, dark);
    lip.position.set(x, 7.78, 1.25);
    group.add(chimney, lip);
    for (let puffIndex = 0; puffIndex < 4; puffIndex += 1) {
      const smokeMaterial = new THREE.SpriteMaterial({
        map: smokeTexture,
        color: 0x70756f,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      });
      const puff = new THREE.Sprite(smokeMaterial);
      puff.position.set(x + (puffIndex % 2 ? 0.15 : -0.08), 8.35 + puffIndex * 0.72, 1.25);
      puff.scale.setScalar(1.35 + puffIndex * 0.18);
      puff.scale.y *= 0.7;
      puff.userData.smoke = true;
      puff.userData.baseY = puff.position.y;
      puff.userData.phase = puffIndex / 4 + (x > 0 ? 0.42 : 0);
      group.add(puff);
    }
  }
  addWindowGrid(THREE, group, {
    width: 6.2, height: 1.7, depth: 5.2, rows: 2, columns: 5, y: 2,
    color: palette.glow, emissiveIntensity: 0.32,
  });
  return group;
}

function createCommandBuilding(THREE, palette) {
  const group = new THREE.Group();
  const brick = makeMaterial(THREE, palette.wall, 0.9, 0.03);
  const stone = makeMaterial(THREE, 0xb8a98e, 0.94, 0.01);
  const roof = makeMaterial(THREE, palette.roof, 0.52, 0.42);
  const dark = makeMaterial(THREE, 0x2c302f, 0.62, 0.55);

  group.add(makeBox(THREE, [8.2, 3.3, 5.8], [0, 1.65, 0], brick));
  group.add(makeBox(THREE, [3.35, 1.45, 6.35], [0, 3.72, 0], brick));
  const mainRoof = new THREE.Mesh(new THREE.ConeGeometry(4.95, 2.25, 4), roof);
  mainRoof.rotation.y = Math.PI / 4;
  mainRoof.scale.z = 0.78;
  mainRoof.position.y = 4.47;
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(2.45, 1.65, 4), roof);
  towerRoof.rotation.y = Math.PI / 4;
  towerRoof.scale.z = 1.12;
  towerRoof.position.y = 5.75;
  group.add(mainRoof, towerRoof);

  const foundation = makeBox(THREE, [8.55, 0.38, 6.15], [0, 0.19, 0], stone);
  const cornice = makeBox(THREE, [8.42, 0.2, 6.02], [0, 3.2, 0], stone);
  const entrance = makeBox(THREE, [2.35, 2.45, 0.42], [0, 1.25, 3.08], stone);
  const door = makeBox(THREE, [1.28, 1.92, 0.12], [0, 0.98, 3.34], dark);
  group.add(foundation, cornice, entrance, door);

  for (const x of [-3.05, -1.8, 1.8, 3.05]) {
    const frame = makeBox(THREE, [0.78, 1.24, 0.1], [x, 1.9, 2.96], stone);
    const glass = makeBox(THREE, [0.5, 0.94, 0.07], [x, 1.9, 3.03], makeMaterial(THREE, palette.glow, 0.28, 0.18, {
      emissive: palette.glow,
      emissiveIntensity: 0.28,
    }));
    group.add(frame, glass);
  }

  const clockRim = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.14, 24), stone);
  clockRim.rotation.x = Math.PI / 2;
  clockRim.position.set(0, 4.18, 3.25);
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.43, 24), makeMaterial(THREE, 0xe0d1ad, 0.82, 0.02));
  clockFace.position.set(0, 4.18, 3.34);
  group.add(clockRim, clockFace);
  return group;
}

function createMilitaryBuilding(THREE, palette) {
  const group = new THREE.Group();
  const concrete = makeMaterial(THREE, palette.wall, 0.96, 0.02);
  const metal = makeMaterial(THREE, palette.roof, 0.48, 0.72);
  group.add(makeBox(THREE, [7.6, 2.7, 5.8], [0, 1.35, 0], concrete, 0.2));
  const roof = makeBox(THREE, [7.9, 0.35, 6.1], [0, 2.87, 0], metal);
  group.add(roof);
  for (const x of [-3.25, 3.25]) {
    for (const z of [-2.35, 2.35]) {
      const tower = makeCylinder(THREE, 0.48, 0.62, 3.5, 10, concrete);
      tower.position.set(x, 1.75, z);
      group.add(tower);
    }
  }
  const door = makeBox(THREE, [2.5, 2, 0.18], [0, 1.03, 2.98], metal);
  group.add(door);
  const lintel = makeBox(THREE, [3.2, 0.3, 0.34], [0, 2.32, 3.05], metal);
  const sideBand = makeMaterial(THREE, palette.accent, 0.58, 0.4);
  group.add(lintel);
  for (const x of [-2.55, 2.55]) {
    group.add(makeBox(THREE, [0.28, 1.65, 0.22], [x, 1.25, 3.04], sideBand));
  }
  const antenna = makeCylinder(THREE, 0.035, 0.07, 3.4, 8, metal);
  antenna.position.set(2.1, 4.65, -1.1);
  group.add(antenna);
  return group;
}

function createModernBuilding(THREE, palette, futuristic = false) {
  const group = new THREE.Group();
  const baseMaterial = makeMaterial(THREE, palette.wall, 0.38, 0.55);
  const trim = makeMaterial(THREE, palette.roof, 0.25, 0.82);
  const glass = makeMaterial(THREE, palette.glow, 0.12, 0.45, {
    emissive: palette.glow,
    emissiveIntensity: futuristic ? 1.5 : 0.65,
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.5, 1.2, futuristic ? 8 : 12), baseMaterial);
  base.position.y = 0.6;
  group.add(base);
  const levels = futuristic ? 4 : 3;
  for (let level = 0; level < levels; level += 1) {
    const radius = 3.35 - level * 0.34;
    const section = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.9, radius, 1.25, futuristic ? 8 : 12),
      level % 2 ? glass : baseMaterial,
    );
    section.position.y = 1.75 + level * 1.18;
    section.rotation.y = level * 0.16;
    group.add(section);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.08, 6, 32), trim);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = section.position.y + 0.62;
    group.add(ring);
  }
  const crown = new THREE.Mesh(new THREE.OctahedronGeometry(futuristic ? 0.8 : 0.48, 0), glass);
  crown.position.y = 2.4 + levels * 1.2;
  crown.userData.float = futuristic;
  crown.userData.baseY = crown.position.y;
  group.add(crown);
  return group;
}

function createHouse(THREE, palette) {
  const group = new THREE.Group();
  const walls = makeMaterial(THREE, palette.wall, 0.9, 0.02);
  const roofMaterial = makeMaterial(THREE, palette.roof, 0.83, 0.08);
  group.add(makeBox(THREE, [4.4, 2.6, 3.8], [0, 1.3, 0], walls, 0.08));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.15, 1.7, 4), roofMaterial);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.86;
  roof.position.y = 3.3;
  group.add(roof);
  const foundation = makeBox(THREE, [4.68, 0.3, 4.08], [0, 0.15, 0], makeMaterial(THREE, 0x77736b, 0.95, 0.01));
  const chimney = makeBox(THREE, [0.5, 1.85, 0.58], [1.15, 3.65, -0.25], makeMaterial(THREE, 0x4b4038, 0.9, 0.04));
  group.add(foundation, chimney);
  const door = makeBox(THREE, [0.8, 1.6, 0.1], [0, 0.82, 1.94], makeMaterial(THREE, 0x51372a, 0.82, 0.02));
  group.add(door);
  addWindowGrid(THREE, group, {
    width: 4, height: 1, depth: 3.8, rows: 1, columns: 3, y: 1.6,
    color: palette.glow, emissiveIntensity: 0.22,
  });
  const smokeTexture = sharedSmokeTexture(THREE);
  for (let puffIndex = 0; puffIndex < 3; puffIndex += 1) {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTexture,
      color: 0x8b8c82,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    }));
    puff.position.set(1.15 + puffIndex * 0.04, 4.78 + puffIndex * 0.55, -0.25);
    puff.userData.smoke = true;
    puff.userData.baseY = puff.position.y;
    puff.userData.phase = puffIndex / 3 + 0.18;
    group.add(puff);
  }
  return group;
}

function buildingPalette(era, teamColor) {
  if (era <= 1800) return { wall: 0x8d6950, roof: 0x454b4b, glow: 0xffc66d, accent: teamColor };
  if (era <= 1900) return { wall: 0x6f7568, roof: 0x343b3d, glow: 0xffd28b, accent: teamColor };
  if (era <= 2000) return { wall: 0x889397, roof: 0x303a43, glow: 0x72cfff, accent: teamColor };
  return { wall: 0xa9b0c8, roof: 0x2a3050, glow: 0x9d8cff, accent: teamColor };
}

function addBuildingWeathering(THREE, model, type, era) {
  const decalMaterial = new THREE.MeshStandardMaterial({
    color: era <= 1900 ? 0x34271e : 0x263033,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
  const groundMaterial = decalMaterial.clone();
  groundMaterial.color.setHex(type === 'fabrica' || type === 'fundicion' ? 0x1f2422 : 0x493b2b);
  groundMaterial.opacity = type === 'fabrica' || type === 'fundicion' ? 0.38 : 0.25;

  // Huellas de hollin, humedad y barro: planos simples, deliberadamente
  // irregulares, que rompen la limpieza procedural de las fachadas.
  const groundMarks = [
    [-2.2, 1.25, 1.7, 0.58],
    [2.35, -1.7, 1.3, 0.44],
    [0.65, 2.85, 1.15, 0.34],
  ];
  groundMarks.forEach(([x, z, sx, sy], index) => {
    const mark = new THREE.Mesh(createIrregularDiscGeometry(THREE, 22, 31 + index * 17), groundMaterial.clone());
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = index * 1.17;
    mark.position.set(x, 0.302 + index * 0.002, z);
    mark.scale.set(sx, sy, 1);
    mark.userData.groundDecal = true;
    model.add(mark);
  });

  const stainCount = type === 'fabrica' || type === 'fundicion' ? 5 : 3;
  const isHouse = type === 'casa' || type === 'vivienda';
  const frontZ = isHouse ? 1.951 : (type === 'fabrica' || type === 'fundicion' ? 2.651 : 2.951);
  const facadeSpan = isHouse ? 3.2 : 5.4;
  for (let index = 0; index < stainCount; index += 1) {
    const width = 0.28 + (index % 3) * 0.13;
    const height = 0.55 + (index % 2) * 0.46;
    const stain = new THREE.Mesh(new THREE.PlaneGeometry(width, height), decalMaterial.clone());
    stain.position.set(-facadeSpan * 0.5 + (index + 0.5) * (facadeSpan / stainCount), 0.75 + (index % 2) * 0.48, frontZ);
    stain.material.opacity *= 0.68 + (index % 3) * 0.14;
    stain.userData.wallDecal = true;
    model.add(stain);
  }

  const crackMaterial = new THREE.MeshBasicMaterial({
    color: 0x211e18, transparent: true, opacity: 0.35, depthWrite: false,
  });
  for (let index = 0; index < 5; index += 1) {
    const crack = makeBox(THREE, [0.035, 0.012, 0.48 + index * 0.09], [
      -3.1 + index * 1.48, 0.31, 3.35 + (index % 2) * 0.16,
    ], crackMaterial);
    crack.rotation.y = -0.7 + index * 0.31;
    crack.userData.groundDecal = true;
    model.add(crack);
  }
}

function addFactionIdentity(THREE, model, type, teamColor, era) {
  const accent = makeMaterial(THREE, teamColor, 0.48, era >= 2000 ? 0.52 : 0.16, {
    emissive: era >= 2100 ? teamColor : 0x000000,
    emissiveIntensity: era >= 2100 ? 0.32 : 0,
  });
  const frontZ = type === 'casa' || type === 'vivienda' ? 2.02 : 3.13;
  const span = type === 'casa' || type === 'vivienda' ? 3.6 : 6.4;
  const bandY = type === 'casa' || type === 'vivienda' ? 2.28 : 2.7;
  const band = makeBox(THREE, [span, 0.18, 0.12], [0, bandY, frontZ], accent);
  band.userData.factionAccent = true;
  model.add(band);

  // Escudo volumetrico grande: se lee mejor que otro aro de UI y mantiene la
  // identidad de faccion integrada en la arquitectura.
  const shield = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.48, 0.11, 5),
    accent,
  );
  shield.rotation.x = Math.PI / 2;
  shield.rotation.z = Math.PI;
  shield.position.set(type === 'casa' || type === 'vivienda' ? 1.45 : 2.7, bandY - 0.58, frontZ + 0.1);
  shield.userData.factionAccent = true;
  model.add(shield);
}

function addBuildingLandmark(THREE, model, type, era, palette) {
  const metal = makeMaterial(THREE, era <= 1900 ? 0x3b4140 : 0x273b49, 0.42, 0.74);
  const accent = makeMaterial(THREE, palette.accent, 0.38, 0.48, {
    emissive: era >= 2100 ? palette.accent : 0x000000,
    emissiveIntensity: era >= 2100 ? 0.55 : 0,
  });

  if (type === 'fabrica' || type === 'fundicion') {
    const gantry = new THREE.Group();
    for (const x of [-2.75, 2.75]) {
      gantry.add(makeBox(THREE, [0.18, 3.1, 0.22], [x, 1.85, -2.95], metal));
    }
    gantry.add(makeBox(THREE, [5.85, 0.2, 0.25], [0, 3.35, -2.95], metal));
    const hookCable = makeCylinder(THREE, 0.025, 0.025, 1.45, 5, metal);
    hookCable.position.set(1.15, 2.6, -2.95);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 5, 10, Math.PI * 1.45), metal);
    hook.position.set(1.15, 1.86, -2.95);
    gantry.add(hookCable, hook);
    model.add(gantry);
  } else if (type === 'cuartel' || type === 'hangar') {
    const mast = makeCylinder(THREE, 0.055, 0.09, 4.25, 8, metal);
    mast.position.set(-2.55, 4.75, -1.5);
    const searchlight = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.28, 0.5, 12), metal);
    searchlight.rotation.x = Math.PI / 2.8;
    searchlight.position.set(-2.55, 6.72, -1.24);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), accent);
    lens.rotation.x = -Math.PI / 2.8;
    lens.position.set(-2.55, 6.91, -1.04);
    model.add(mast, searchlight, lens);
  } else if (era >= 2000) {
    const radar = new THREE.Group();
    const mast = makeCylinder(THREE, 0.06, 0.11, 2.2, 8, metal);
    mast.position.y = 7.2;
    radar.add(mast);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.88, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), metal);
    dish.scale.y = 0.34;
    dish.rotation.x = -0.38;
    dish.position.y = 8.35;
    dish.userData.radarDish = true;
    radar.add(dish);
    if (era >= 2100) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.06, 7, 32), accent);
      halo.position.y = 7.86;
      halo.rotation.x = Math.PI / 2;
      halo.userData.landmarkHalo = true;
      radar.add(halo);
    }
    model.add(radar);
  } else if (type !== 'casa' && type !== 'vivienda') {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), makeMaterial(THREE, 0xa98546, 0.36, 0.74));
    bell.scale.y = 1.25;
    bell.position.set(-1.1, 6.0, 0.15);
    model.add(bell);
  }
}

function addInstancedArchitecture(THREE, model, type, era, palette) {
  const isHouse = type === 'casa' || type === 'vivienda';
  const isIndustrial = type === 'fabrica' || type === 'fundicion';
  const isMilitary = type === 'cuartel' || type === 'hangar';
  const historic = era <= 1900;
  const structure = makeMaterial(THREE, historic ? 0x665a49 : 0x2f3b42, 0.68, historic ? 0.08 : 0.62);
  const roofDetail = makeMaterial(THREE, palette.roof, 0.48, historic ? 0.34 : 0.78);
  const litDetail = makeMaterial(THREE, palette.glow, 0.24, 0.48, {
    emissive: palette.glow,
    emissiveIntensity: era >= 2000 ? 0.68 : 0.12,
  });
  const dummy = new THREE.Object3D();

  // Pilastras, contrafuertes y nervios dan escala y sombras de contacto a las
  // fachadas. Cada familia es una sola draw call aunque repita muchas piezas.
  if (historic || isIndustrial || isMilitary) {
    const spanX = isHouse ? 4.35 : (isIndustrial ? 6.65 : (isMilitary ? 7.65 : 8.22));
    const depth = isHouse ? 3.84 : (isIndustrial ? 5.24 : (isMilitary ? 5.84 : 5.84));
    const height = isHouse ? 2.48 : (isIndustrial ? 3.08 : (isMilitary ? 2.52 : 3.08));
    const columns = isHouse ? 6 : 10;
    const pilasters = new THREE.InstancedMesh(
      new THREE.BoxGeometry(isHouse ? 0.16 : 0.2, height, 0.18),
      structure,
      columns,
    );
    let instance = 0;
    for (const side of [-1, 1]) {
      const perSide = columns / 2;
      for (let index = 0; index < perSide; index += 1) {
        const x = -spanX * 0.5 + (index / (perSide - 1)) * spanX;
        dummy.position.set(x, height * 0.5 + 0.26, side * (depth * 0.5 + 0.09));
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, index === 0 || index === perSide - 1 ? 1.08 : 0.88, 1);
        dummy.updateMatrix();
        pilasters.setMatrixAt(instance++, dummy.matrix);
      }
    }
    pilasters.instanceMatrix.needsUpdate = true;
    pilasters.castShadow = true;
    pilasters.receiveShadow = true;
    pilasters.name = 'arquitectura-pilastras-instanciadas';
    model.add(pilasters);

    const roofCount = isHouse ? 3 : 5;
    const roofRibs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.13, 0.13, depth + (isHouse ? 0.48 : 0.7)),
      roofDetail,
      roofCount,
    );
    for (let index = 0; index < roofCount; index += 1) {
      const x = -spanX * 0.4 + index * (spanX * 0.8 / Math.max(1, roofCount - 1));
      const roofY = isHouse ? 3.42 : (isMilitary ? 3.12 : 4.42);
      dummy.position.set(x, roofY + Math.abs(x) * (isHouse ? -0.03 : 0.015), 0);
      dummy.rotation.set(0, 0, isHouse || (!isIndustrial && !isMilitary) ? -x * 0.045 : 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      roofRibs.setMatrixAt(index, dummy.matrix);
    }
    roofRibs.instanceMatrix.needsUpdate = true;
    roofRibs.castShadow = true;
    roofRibs.name = 'arquitectura-nervios-instanciados';
    model.add(roofRibs);
  }

  if (isIndustrial || isMilitary) {
    const ventCount = isIndustrial ? 6 : 4;
    const vents = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.2, 0.27, 0.55, 8),
      roofDetail,
      ventCount,
    );
    for (let index = 0; index < ventCount; index += 1) {
      const column = index % 3;
      const row = Math.floor(index / 3);
      dummy.position.set(-1.45 + column * 1.45, isIndustrial ? 5.08 : 3.48, -1.1 + row * 2.15);
      dummy.rotation.set(0, index * 0.37, 0);
      dummy.scale.set(1, 0.75 + (index % 2) * 0.36, 1);
      dummy.updateMatrix();
      vents.setMatrixAt(index, dummy.matrix);
    }
    vents.instanceMatrix.needsUpdate = true;
    vents.castShadow = true;
    vents.name = 'arquitectura-ventilas-instanciadas';
    model.add(vents);
  }

  if (era >= 2000 && !isHouse) {
    const finCount = era >= 2100 ? 16 : 12;
    const fins = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, era >= 2100 ? 3.9 : 3.25, 0.42),
      structure,
      finCount,
    );
    const lightNodes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.19, 0.38, 0.48),
      litDetail,
      finCount,
    );
    for (let index = 0; index < finCount; index += 1) {
      const angle = index / finCount * Math.PI * 2;
      const radius = 3.72 + (index % 2) * 0.16;
      dummy.position.set(Math.cos(angle) * radius, era >= 2100 ? 3.05 : 2.7, Math.sin(angle) * radius);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(1, 0.9 + (index % 3) * 0.08, 1);
      dummy.updateMatrix();
      fins.setMatrixAt(index, dummy.matrix);
      dummy.position.y = 1.55 + (index % 3) * 1.08;
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lightNodes.setMatrixAt(index, dummy.matrix);
    }
    fins.instanceMatrix.needsUpdate = true;
    lightNodes.instanceMatrix.needsUpdate = true;
    fins.castShadow = true;
    lightNodes.name = 'arquitectura-nodos-luz-instanciados';
    fins.name = 'arquitectura-aletas-instanciadas';
    model.add(fins, lightNodes);
  }
}

export function createBuilding(THREE, options = {}) {
  const {
    type = 'centro', era: eraInput = 1800, teamColor = 0xd6b85a,
    position = [0, 0, 0], rotation = 0, scale = 1,
  } = options;
  const era = nearestEra(Number(eraInput));
  const palette = buildingPalette(era, teamColor);
  let model;
  if (type === 'fabrica' || type === 'fundicion') model = createIndustrialBuilding(THREE, palette);
  else if (type === 'cuartel' || type === 'hangar') model = createMilitaryBuilding(THREE, palette);
  else if (type === 'casa' || type === 'vivienda') model = createHouse(THREE, palette);
  else if (era <= 1900) model = createCommandBuilding(THREE, palette);
  else model = createModernBuilding(THREE, palette, era >= 2100);

  model.name = `edificio-${type}-${era}`;
  model.position.set(position[0], position[1], position[2]);
  model.rotation.y = rotation;
  model.scale.setScalar(scale);
  model.userData.entityType = 'building';
  model.userData.kind = type;
  model.userData.era = era;
  model.userData.health = options.health ?? 1000;
  model.userData.maxHealth = options.maxHealth ?? model.userData.health;
  model.userData.action = options.action ?? 'operativo';

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(5.2, 5.45, 0.28, era >= 2100 ? 8 : 12),
    makeMaterial(THREE, 0x353a3c, 0.9, 0.18),
  );
  plinth.position.y = 0.14;
  plinth.receiveShadow = true;
  model.add(plinth);
  plinth.renderOrder = -1;

  const flag = createFlag(THREE, teamColor);
  flag.position.set(-3.4, 0.25, 2.7);
  flag.traverse((part) => { part.userData.keepWithAtlas = true; });
  model.add(flag);
  addFactionIdentity(THREE, model, type, teamColor, era);
  addBuildingLandmark(THREE, model, type, era, palette);
  addInstancedArchitecture(THREE, model, type, era, palette);
  addBuildingWeathering(THREE, model, type, era);
  addBuildingAtlasSilhouette(THREE, model, options, era, type);
  addHealthBar(THREE, model, { width: 3.35, height: 0.15, y: era >= 2100 ? 7.65 : 7.15 });
  shadowize(model);
  return model;
}

function createInfantry(THREE, palette, era, role = 'rifle') {
  const unit = new THREE.Group();
  const worker = role === 'worker';
  const modern = era >= 2000;
  const teamShade = new THREE.Color(palette.body).offsetHSL(0, worker ? -0.08 : 0.04, worker ? 0.08 : -0.03);
  const uniform = makeMaterial(THREE, teamShade, 0.78, modern ? 0.16 : 0.04);
  const teamTrim = makeMaterial(THREE, palette.body, 0.62, modern ? 0.28 : 0.08);
  const dark = makeMaterial(THREE, palette.trim, 0.46, 0.5);
  const leather = makeMaterial(THREE, worker ? 0x68482f : 0x49372a, 0.86, 0.02);
  const brass = makeMaterial(THREE, 0xb9974f, 0.36, 0.7);
  const skin = makeMaterial(THREE, worker ? 0xb97f5e : 0xc58c68, 0.88, 0.01);

  // Un pequeno rig articulado aporta una silueta humana real incluso a la
  // distancia tipica de una camara RTS, sin el coste de un esqueleto skinned.
  const bodyRig = new THREE.Group();
  bodyRig.userData.bodyRig = true;
  bodyRig.userData.baseY = 0;
  unit.add(bodyRig);
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.34, worker ? 0.82 : 0.88, 8), uniform);
  coat.position.y = 1.3;
  coat.scale.z = 0.78;
  const shoulders = makeBox(THREE, [0.64, 0.16, 0.31], [0, 1.63, 0], teamTrim, 0.05);
  const belt = makeBox(THREE, [0.57, 0.105, 0.33], [0, 1.01, 0], leather, 0.025);
  bodyRig.add(coat, shoulders, belt);
  for (const side of [-1, 1]) {
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.135, 9, 6), teamTrim);
    pauldron.scale.set(1.18, 0.66, 1.02);
    pauldron.position.set(side * 0.335, 1.62, 0.01);
    bodyRig.add(pauldron);
  }
  const factionTab = makeBox(THREE, [0.25, 0.34, 0.04], [0, 1.38, 0.205], teamTrim, 0.025);
  factionTab.rotation.z = -0.08;
  bodyRig.add(factionTab);

  const headRig = new THREE.Group();
  headRig.position.y = 1.75;
  headRig.userData.headRig = true;
  const neck = makeCylinder(THREE, 0.085, 0.095, 0.18, 8, skin);
  neck.position.y = 0.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.195, 12, 8), skin);
  head.position.y = 0.23;
  head.scale.set(0.92, 1.08, 0.9);
  headRig.add(neck, head);
  if (worker) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.218, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), teamTrim);
    cap.position.y = 0.32;
    const brim = makeBox(THREE, [0.34, 0.045, 0.22], [0, 0.31, 0.15], teamTrim, 0.02);
    headRig.add(cap, brim);
  } else if (era <= 1800) {
    const shako = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.31, 10), dark);
    shako.position.y = 0.43;
    const badge = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 6), brass);
    badge.rotation.x = Math.PI / 2;
    badge.position.set(0, 0.45, 0.205);
    const brim = makeBox(THREE, [0.38, 0.035, 0.18], [0, 0.3, 0.12], dark, 0.018);
    headRig.add(shako, badge, brim);
  } else if (era < 2000) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    helmet.position.y = 0.34;
    helmet.scale.z = 1.1;
    const helmetBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.035, 16), dark);
    helmetBrim.position.y = 0.31;
    headRig.add(helmet, helmetBrim);
  } else {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.225, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    helmet.position.y = 0.34;
    helmet.scale.z = 1.08;
    const brow = makeBox(THREE, [0.35, 0.07, 0.12], [0, 0.31, 0.17], dark, 0.025);
    const headset = makeCylinder(THREE, 0.065, 0.065, 0.08, 8, teamTrim);
    headset.rotation.z = Math.PI / 2;
    headset.position.set(-0.22, 0.24, 0);
    headRig.add(helmet, brow, headset);
  }
  bodyRig.add(headRig);

  for (const side of [-1, 1]) {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.145, 0.93, 0);
    legPivot.userData.walkLimb = side;
    legPivot.userData.limbAmplitude = 0.55;
    const trouser = makeCylinder(THREE, 0.095, 0.13, 0.66, 8, uniform);
    trouser.position.y = -0.32;
    const gaiter = makeCylinder(THREE, 0.085, 0.105, 0.3, 8, dark);
    gaiter.position.y = -0.69;
    const boot = makeBox(THREE, [0.19, 0.16, 0.34], [0, -0.88, 0.075], leather, 0.035);
    if (modern && !worker) {
      const knee = makeBox(THREE, [0.17, 0.13, 0.08], [0, -0.51, 0.11], teamTrim, 0.035);
      legPivot.add(knee);
    }
    legPivot.add(trouser, gaiter, boot);
    unit.add(legPivot);

    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.335, 1.57, 0.015);
    armPivot.rotation.z = side * 0.1;
    armPivot.userData.walkLimb = -side;
    armPivot.userData.limbAmplitude = worker ? 0.42 : 0.2;
    armPivot.userData.restZ = armPivot.rotation.z;
    const sleeve = makeCylinder(THREE, 0.072, 0.1, 0.42, 8, uniform);
    sleeve.position.y = -0.2;
    const forearm = makeCylinder(THREE, 0.062, 0.078, 0.36, 8, worker ? uniform : dark);
    forearm.position.set(-side * 0.035, -0.46, worker ? 0 : 0.12);
    forearm.rotation.x = worker ? 0 : 0.68;
    forearm.rotation.z = -side * 0.18;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), skin);
    hand.position.set(-side * 0.06, worker ? -0.59 : -0.57, worker ? 0 : 0.23);
    armPivot.add(sleeve, forearm, hand);
    bodyRig.add(armPivot);
  }

  if (worker) {
    const apron = makeBox(THREE, [0.46, 0.63, 0.06], [0, 1.22, 0.22], leather, 0.025);
    apron.rotation.x = -0.05;
    const satchel = makeBox(THREE, [0.43, 0.42, 0.25], [-0.37, 1.03, 0], leather);
    satchel.rotation.z = -0.12;
    const tool = new THREE.Group();
    tool.position.set(0.48, 1.02, 0.24);
    tool.rotation.z = -0.28;
    tool.userData.toolRig = true;
    tool.userData.restX = tool.rotation.x;
    tool.userData.restZ = tool.rotation.z;
    const handle = makeCylinder(THREE, 0.035, 0.045, 1.42, 7, makeMaterial(THREE, 0x7a5935, 0.9, 0.01));
    const pick = makeBox(THREE, [0.64, 0.09, 0.1], [0, 0.66, 0], dark);
    pick.rotation.z = 0.08;
    tool.add(handle, pick);
    bodyRig.add(apron, satchel, tool);
  } else {
    const backpack = makeBox(THREE, [0.48, modern ? 0.57 : 0.66, 0.25], [0, 1.32, -0.25], modern ? dark : leather, 0.055);
    const bedroll = makeCylinder(THREE, 0.105, 0.105, 0.56, 8, teamTrim);
    bedroll.rotation.z = Math.PI / 2;
    bedroll.position.set(0, 1.66, -0.3);
    const strap = makeBox(THREE, [0.065, 0.78, 0.04], [-0.13, 1.34, 0.205], modern ? dark : brass, 0.02);
    strap.rotation.z = -0.27;
    for (const side of [-1, 1]) {
      const pouch = makeBox(THREE, [0.18, 0.2, 0.13], [side * 0.2, 1.02, 0.18], leather, 0.035);
      bodyRig.add(pouch);
    }
    if (modern) {
      const vest = makeBox(THREE, [0.5, 0.48, 0.12], [0, 1.37, 0.19], dark, 0.055);
      const antenna = makeCylinder(THREE, 0.012, 0.018, 0.48, 6, dark);
      antenna.position.set(-0.19, 1.75, -0.26);
      antenna.rotation.z = -0.08;
      bodyRig.add(vest, antenna);
    }
    const rifle = new THREE.Group();
    rifle.position.set(0.06, 1.27, 0.29);
    rifle.rotation.x = modern ? 1.43 : 1.34;
    rifle.rotation.z = -0.08;
    const stock = makeBox(THREE, [0.14, 0.38, 0.13], [0, -0.45, 0], leather, 0.025);
    const barrelLength = modern ? 1.45 : 1.55;
    const barrel = makeCylinder(THREE, 0.025, 0.041, barrelLength, 8, dark);
    barrel.position.y = 0.22;
    const receiver = makeBox(THREE, [0.17, 0.36, 0.16], [0, -0.12, 0], dark, 0.025);
    const magazine = makeBox(THREE, [0.11, 0.23, 0.1], [0, -0.13, -0.13], dark, 0.025);
    magazine.rotation.x = 0.18;
    const muzzle = makeCylinder(THREE, 0.04, 0.04, 0.14, 8, modern ? teamTrim : brass);
    muzzle.position.y = 1.0;
    rifle.add(stock, barrel, receiver, magazine, muzzle);
    rifle.userData.weaponRig = true;
    rifle.userData.weaponClass = 'rifle';
    rifle.userData.restX = rifle.rotation.x;
    rifle.userData.restZ = rifle.rotation.z;
    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 1.08, 0);
    muzzleAnchor.userData.muzzleAnchor = true;
    rifle.add(muzzleAnchor);
    bodyRig.add(backpack, bedroll, strap, rifle);
  }

  const stepDust = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sharedSmokeTexture(THREE),
    color: 0xb89b6f,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }));
  stepDust.position.set(0, 0.28, -0.06);
  stepDust.scale.set(0.72, 0.34, 1);
  stepDust.userData.stepDust = true;
  unit.add(stepDust);

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(worker ? 0.48 : 0.53, 20),
    new THREE.MeshBasicMaterial({ color: 0x111613, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.018;
  contactShadow.scale.set(1, 0.62, 1);
  contactShadow.userData.groundDecal = true;
  unit.add(contactShadow);
  return unit;
}

function createExosuit(THREE, palette) {
  const unit = new THREE.Group();
  unit.userData.unitRole = 'exo';
  const shell = makeMaterial(THREE, palette.body, 0.38, 0.62);
  const armor = makeMaterial(THREE, 0x172832, 0.3, 0.8);
  const joint = makeMaterial(THREE, 0x0c151b, 0.58, 0.54);
  const glow = makeMaterial(THREE, palette.glow, 0.13, 0.5, {
    emissive: palette.glow, emissiveIntensity: 2.2,
  });

  const bodyRig = new THREE.Group();
  bodyRig.userData.bodyRig = true;
  bodyRig.userData.baseY = 0;
  const pelvis = makeBox(THREE, [0.72, 0.34, 0.48], [0, 1.08, 0], armor, 0.09);
  const abdomen = makeCylinder(THREE, 0.25, 0.31, 0.52, 8, joint);
  abdomen.position.y = 1.42;
  const chest = makeBox(THREE, [0.92, 0.68, 0.55], [0, 1.82, 0], shell, 0.13);
  chest.scale.set(1, 1, 0.82);
  const breastplate = makeBox(THREE, [0.58, 0.42, 0.12], [0, 1.86, 0.31], armor, 0.06);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.125, 0), glow);
  core.position.set(0, 1.88, 0.41);
  bodyRig.add(pelvis, abdomen, chest, breastplate, core);

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 6), shell);
    shoulder.scale.set(1.25, 0.72, 1.05);
    shoulder.position.set(side * 0.56, 2.03, 0);
    const shoulderLamp = makeBox(THREE, [0.18, 0.08, 0.12], [side * 0.58, 2.08, 0.23], glow, 0.025);
    bodyRig.add(shoulder, shoulderLamp);

    const arm = new THREE.Group();
    arm.position.set(side * 0.5, 1.9, 0);
    arm.userData.walkLimb = -side;
    arm.userData.limbAmplitude = 0.16;
    const upper = makeCylinder(THREE, 0.105, 0.14, 0.48, 8, armor);
    upper.position.y = -0.22;
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), joint);
    elbow.position.y = -0.48;
    const forearm = makeBox(THREE, [0.25, 0.48, 0.3], [0, -0.67, 0.1], shell, 0.06);
    forearm.rotation.x = 0.35;
    arm.add(upper, elbow, forearm);
    bodyRig.add(arm);

    const leg = new THREE.Group();
    leg.position.set(side * 0.25, 1.12, 0);
    leg.userData.walkLimb = side;
    leg.userData.limbAmplitude = 0.44;
    const thigh = makeBox(THREE, [0.31, 0.53, 0.36], [0, -0.22, 0], shell, 0.07);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.145, 8, 6), joint);
    knee.position.set(0, -0.51, 0.12);
    const shin = makeBox(THREE, [0.3, 0.56, 0.38], [0, -0.78, 0.04], armor, 0.07);
    const boot = makeBox(THREE, [0.35, 0.22, 0.6], [0, -1.12, 0.14], shell, 0.07);
    const shinLight = makeBox(THREE, [0.07, 0.28, 0.05], [0, -0.76, 0.25], glow, 0.02);
    leg.add(thigh, knee, shin, boot, shinLight);
    unit.add(leg);
  }

  const headRig = new THREE.Group();
  headRig.position.y = 2.2;
  headRig.userData.headRig = true;
  const neck = makeCylinder(THREE, 0.12, 0.15, 0.2, 8, joint);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8), armor);
  helmet.scale.set(0.92, 1.08, 1.05);
  helmet.position.y = 0.27;
  const visor = makeBox(THREE, [0.46, 0.12, 0.12], [0, 0.29, 0.245], glow, 0.04);
  headRig.add(neck, helmet, visor);
  bodyRig.add(headRig);

  const powerPack = makeBox(THREE, [0.68, 0.82, 0.34], [0, 1.72, -0.38], armor, 0.09);
  const aerial = makeCylinder(THREE, 0.018, 0.025, 0.72, 7, glow);
  aerial.position.set(-0.28, 2.2, -0.38);
  aerial.rotation.z = -0.08;
  bodyRig.add(powerPack, aerial);

  const weapon = new THREE.Group();
  weapon.position.set(0.08, 1.43, 0.43);
  weapon.rotation.x = 1.48;
  weapon.rotation.z = -0.06;
  weapon.userData.weaponRig = true;
  weapon.userData.weaponClass = 'energy';
  weapon.userData.restX = weapon.rotation.x;
  weapon.userData.restZ = weapon.rotation.z;
  const receiver = makeBox(THREE, [0.3, 0.64, 0.27], [0, -0.12, 0], armor, 0.065);
  const barrel = makeCylinder(THREE, 0.055, 0.08, 1.48, 10, shell);
  barrel.position.y = 0.53;
  const rail = makeBox(THREE, [0.09, 1.35, 0.08], [0.16, 0.48, 0], glow, 0.025);
  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 14), glow);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.y = 1.27;
  weapon.add(receiver, barrel, rail, muzzle);
  const muzzleAnchor = new THREE.Object3D();
  muzzleAnchor.position.y = 1.42;
  muzzleAnchor.userData.muzzleAnchor = true;
  weapon.add(muzzleAnchor);
  bodyRig.add(weapon);
  unit.add(bodyRig);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 22),
    new THREE.MeshBasicMaterial({ color: 0x091012, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.018;
  shadow.scale.set(0.82, 1.22, 1);
  shadow.userData.groundDecal = true;
  unit.add(shadow);
  return unit;
}

function createCavalry(THREE, palette) {
  const unit = new THREE.Group();
  unit.userData.unitRole = 'cavalry';

  const coat = makeMaterial(THREE, palette.body, 0.72, 0.08);
  const horse = makeMaterial(THREE, 0x6b422b, 0.9, 0.01);
  const horseDark = makeMaterial(THREE, 0x2b211c, 0.94, 0.01);
  const leather = makeMaterial(THREE, 0x39261c, 0.86, 0.02);
  const metal = makeMaterial(THREE, 0xb7aa83, 0.34, 0.72);
  const skin = makeMaterial(THREE, 0xc58c68, 0.88, 0.01);

  // Volúmenes grandes y superpuestos priorizan una lectura inequívoca desde
  // cámara RTS: grupa + pecho, cuello inclinado y cabeza adelantada.
  const horseRig = new THREE.Group();
  horseRig.userData.bodyRig = true;
  horseRig.userData.baseY = 0;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 9), horse);
  body.scale.set(1.05, 0.78, 1.62);
  body.position.y = 1.32;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 8), horse);
  chest.scale.set(1, 1.08, 0.92);
  chest.position.set(0, 1.38, 0.86);
  const neck = makeCylinder(THREE, 0.3, 0.42, 1.35, 10, horse);
  neck.rotation.x = -0.52;
  neck.position.set(0, 1.88, 1.2);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), horse);
  head.scale.set(0.86, 0.92, 1.38);
  head.position.set(0, 2.34, 1.76);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 7), horseDark);
  muzzle.scale.set(0.92, 0.7, 1.25);
  muzzle.position.set(0, 2.2, 2.17);
  horseRig.add(body, chest, neck, head, muzzle);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.36, 7), horseDark);
    ear.position.set(side * 0.2, 2.72, 1.72);
    ear.rotation.x = -0.16;
    horseRig.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 5), metal);
    eye.position.set(side * 0.33, 2.43, 1.91);
    horseRig.add(eye);
  }
  for (let index = 0; index < 4; index += 1) {
    const mane = makeBox(THREE, [0.12, 0.38, 0.28], [0, 2.35 - index * 0.22, 1.32 - index * 0.14], horseDark);
    mane.rotation.x = -0.45;
    horseRig.add(mane);
  }
  const tail = makeCylinder(THREE, 0.09, 0.18, 1.3, 8, horseDark);
  tail.position.set(0, 1.27, -1.38);
  tail.rotation.x = -0.68;
  tail.userData.horseTail = true;
  tail.userData.restX = tail.rotation.x;
  horseRig.add(tail);
  unit.add(horseRig);

  const legPositions = [
    [-0.43, 0.82, 1], [0.43, 0.82, -1],
    [-0.43, -0.82, -1], [0.43, -0.82, 1],
  ];
  for (const [x, z, phase] of legPositions) {
    const leg = new THREE.Group();
    leg.position.set(x, 1.12, z);
    leg.userData.walkLimb = phase;
    leg.userData.limbAmplitude = 0.48;
    const upper = makeCylinder(THREE, 0.12, 0.17, 0.66, 7, horse);
    upper.position.y = -0.3;
    const lower = makeCylinder(THREE, 0.075, 0.11, 0.58, 7, horseDark);
    lower.position.y = -0.78;
    const hoof = makeBox(THREE, [0.24, 0.16, 0.34], [0, -1.08, 0.07], horseDark, 0.04);
    leg.add(upper, lower, hoof);
    unit.add(leg);
  }

  const saddle = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, 0.22, 10), leather);
  saddle.scale.z = 1.22;
  saddle.position.set(0, 1.93, -0.05);
  unit.add(saddle);
  const blanket = makeBox(THREE, [1.15, 0.13, 1.2], [0, 1.78, -0.03], coat, 0.08);
  blanket.rotation.x = 0.05;
  unit.add(blanket);

  const rider = new THREE.Group();
  rider.userData.bodyRig = true;
  rider.userData.baseY = 0;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.92, 8), coat);
  torso.position.y = 2.56;
  const belt = makeBox(THREE, [0.72, 0.13, 0.43], [0, 2.18, 0], leather);
  rider.add(torso, belt);
  for (const side of [-1, 1]) {
    const riderLeg = makeCylinder(THREE, 0.1, 0.14, 0.88, 7, coat);
    riderLeg.position.set(side * 0.35, 1.78, -0.02);
    riderLeg.rotation.z = side * 0.27;
    const boot = makeCylinder(THREE, 0.095, 0.12, 0.54, 7, leather);
    boot.position.set(side * 0.47, 1.31, 0.08);
    boot.rotation.z = side * 0.15;
    const arm = makeCylinder(THREE, 0.075, 0.11, 0.68, 7, coat);
    arm.position.set(side * 0.33, 2.54, 0.28);
    arm.rotation.x = -0.72;
    arm.rotation.z = side * 0.2;
    rider.add(riderLeg, boot, arm);
  }
  const headRig = new THREE.Group();
  headRig.position.y = 3.05;
  headRig.userData.headRig = true;
  const riderHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 11, 7), skin);
  riderHead.position.y = 0.16;
  const shako = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.42, 10), horseDark);
  shako.position.y = 0.47;
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.34, 7), coat);
  plume.position.set(0, 0.82, 0);
  headRig.add(riderHead, shako, plume);
  rider.add(headRig);

  const sabre = makeBox(THREE, [0.055, 0.82, 0.07], [0.57, 2.18, 0.04], metal, 0.02);
  sabre.rotation.z = -0.22;
  const scabbard = makeBox(THREE, [0.1, 0.94, 0.12], [-0.54, 1.84, -0.05], leather, 0.03);
  scabbard.rotation.z = 0.24;
  rider.add(sabre, scabbard);
  unit.add(rider);

  const reinMaterial = new THREE.LineBasicMaterial({ color: 0x2b1d17 });
  for (const side of [-1, 1]) {
    const rein = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(side * 0.18, 2.5, 0.38),
        new THREE.Vector3(side * 0.24, 2.35, 1.2),
        new THREE.Vector3(side * 0.21, 2.24, 1.94),
      ]),
      reinMaterial,
    );
    unit.add(rein);
  }

  const dust = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sharedSmokeTexture(THREE), color: 0xb89b6f, transparent: true, opacity: 0, depthWrite: false,
  }));
  dust.position.set(0, 0.3, -0.9);
  dust.scale.set(1.25, 0.5, 1);
  dust.userData.stepDust = true;
  unit.add(dust);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 22),
    new THREE.MeshBasicMaterial({ color: 0x111613, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.scale.set(0.72, 1.62, 1);
  shadow.userData.groundDecal = true;
  unit.add(shadow);
  return unit;
}

function createVehicle(THREE, palette, era, artillery = false) {
  const unit = new THREE.Group();
  const futuristic = era >= 2100;
  const bodyMat = makeMaterial(THREE, palette.body, futuristic ? 0.36 : 0.62, futuristic ? 0.68 : 0.45);
  const trim = makeMaterial(THREE, palette.trim, 0.42, 0.82);
  const rubber = makeMaterial(THREE, 0x151919, 0.88, 0.08);
  const steel = makeMaterial(THREE, 0x687176, 0.34, 0.82);
  const glow = makeMaterial(THREE, palette.glow, 0.12, 0.45, {
    emissive: palette.glow, emissiveIntensity: 2.15,
  });

  if (artillery) {
    // Cureña abierta, ruedas altas y cola partida: una lectura de artillería
    // inequívoca incluso cuando el cañón queda parcialmente tapado por FX.
    const carriage = makeBox(THREE, [1.32, 0.34, 2.05], [0, 0.62, -0.18], trim, 0.07);
    carriage.userData.feedbackChassis = true;
    const cradle = makeBox(THREE, [0.78, 0.48, 1.1], [0, 0.93, 0.3], bodyMat, 0.08);
    const axle = makeCylinder(THREE, 0.11, 0.11, 2.45, 10, steel);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, 0.57, -0.08);
    unit.add(carriage, cradle, axle);

    for (const side of [-1, 1]) {
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.14, 8, 20), rubber);
      tire.rotation.y = Math.PI / 2;
      tire.position.set(side * 1.12, 0.66, -0.08);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.18, 14), bodyMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.copy(tire.position);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.24, 12), steel);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(tire.position);
      const trail = makeBox(THREE, [0.24, 0.25, 2.75], [side * 0.48, 0.34, -1.35], trim, 0.055);
      trail.rotation.y = side * -0.085;
      const spade = makeBox(THREE, [0.62, 0.15, 0.48], [side * 0.58, 0.27, -2.72], steel, 0.04);
      spade.rotation.y = side * -0.085;
      unit.add(tire, wheel, hub, trail, spade);
    }

    const shield = makeBox(THREE, [2.12, 0.9, 0.12], [0, 1.2, 0.38], bodyMat, 0.075);
    const shieldCut = makeBox(THREE, [0.38, 0.96, 0.16], [0, 1.2, 0.39], trim, 0.04);
    const sight = makeCylinder(THREE, 0.08, 0.08, 0.42, 8, steel);
    sight.position.set(-0.53, 1.61, 0.36);
    unit.add(shield, shieldCut, sight);

    const gunRig = new THREE.Group();
    gunRig.position.set(0, 1.24, 0.42);
    gunRig.rotation.x = Math.PI / 2 - (futuristic ? 0.12 : 0.2);
    gunRig.userData.turretRig = true;
    gunRig.userData.weaponRig = true;
    gunRig.userData.weaponClass = 'artillery';
    gunRig.userData.recoilAxis = 'z';
    const breech = makeBox(THREE, [0.62, 0.82, 0.55], [0, -0.3, 0], trim, 0.07);
    const barrelLength = futuristic ? 5 : 4.65;
    const barrel = makeCylinder(THREE, 0.095, 0.17, barrelLength, 12, futuristic ? bodyMat : steel);
    barrel.position.y = barrelLength * 0.38;
    const collar = makeCylinder(THREE, 0.19, 0.19, 0.32, 12, bodyMat);
    collar.position.y = 0.5;
    const brake = makeCylinder(THREE, 0.16, 0.16, 0.34, 10, trim);
    brake.position.y = barrelLength * 0.88;
    const brakePort = makeBox(THREE, [0.42, 0.22, 0.18], [0, barrelLength * 0.88, 0], trim, 0.03);
    gunRig.add(breech, barrel, collar, brake, brakePort);
    if (futuristic) {
      const energyRail = makeBox(THREE, [0.08, barrelLength * 0.68, 0.08], [0.19, barrelLength * 0.48, 0], glow, 0.025);
      gunRig.add(energyRail);
    }
    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.y = barrelLength * 0.98;
    muzzleAnchor.userData.muzzleAnchor = true;
    gunRig.add(muzzleAnchor);
    unit.add(gunRig);
  } else {
    const lowerHull = makeBox(THREE, [2.78, 0.52, 3.72], [0, 0.62, -0.08], trim, 0.14);
    lowerHull.userData.feedbackChassis = true;
    const upperHull = makeBox(THREE, [2.35, 0.62, 2.95], [0, 1.02, 0.18], bodyMat, 0.16);
    upperHull.rotation.x = -0.035;
    const glacis = makeBox(THREE, [2.2, 0.38, 0.88], [0, 1.13, 1.47], bodyMat, 0.09);
    glacis.rotation.x = -0.32;
    const rearDeck = makeBox(THREE, [2.18, 0.18, 0.88], [0, 1.31, -1.14], trim, 0.045);
    unit.add(lowerHull, upperHull, glacis, rearDeck);

    for (const side of [-1, 1]) {
      if (!futuristic) {
        const trackHousing = makeBox(THREE, [0.54, 0.68, 3.68], [side * 1.38, 0.64, -0.08], rubber, 0.18);
        const topTrack = makeBox(THREE, [0.58, 0.12, 2.82], [side * 1.39, 0.98, -0.08], trim, 0.04);
        const bottomTrack = makeBox(THREE, [0.58, 0.12, 2.92], [side * 1.39, 0.29, -0.08], trim, 0.04);
        unit.add(trackHousing, topTrack, bottomTrack);
        for (const z of [-1.25, -0.62, 0, 0.62, 1.25]) {
          const radius = Math.abs(z) > 1 ? 0.34 : 0.29;
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.6, 14), bodyMat);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(side * 1.4, 0.62, z - 0.08);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.36, radius * 0.36, 0.64, 10), steel);
          hub.rotation.z = Math.PI / 2;
          hub.position.copy(wheel.position);
          unit.add(wheel, hub);
        }
      } else {
        for (const z of [-1.15, 0.95]) {
          const pod = makeBox(THREE, [0.72, 0.24, 1.08], [side * 1.22, 0.32, z], trim, 0.11);
          const hoverRing = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.07, 7, 20), glow);
          hoverRing.rotation.x = Math.PI / 2;
          hoverRing.position.set(side * 1.22, 0.18, z);
          unit.add(pod, hoverRing);
        }
      }
    }

    const turretRig = new THREE.Group();
    turretRig.position.y = 1.36;
    turretRig.userData.turretRig = true;
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(futuristic ? 0.72 : 0.78, 1.02, 0.58, futuristic ? 8 : 12), bodyMat);
    turret.position.y = 0.16;
    turret.scale.z = futuristic ? 1.18 : 1.08;
    const mantlet = makeBox(THREE, [0.78, 0.44, 0.34], [0, 0.18, 0.77], trim, 0.09);
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.24, 10), trim);
    cupola.position.set(-0.32, 0.58, -0.06);
    const hatch = makeBox(THREE, [0.5, 0.08, 0.42], [-0.32, 0.72, -0.06], steel, 0.035);
    turretRig.add(turret, mantlet, cupola, hatch);
    if (era >= 2000) {
      const optics = makeBox(THREE, [0.18, 0.24, 0.2], [0.42, 0.58, 0.18], futuristic ? glow : steel, 0.035);
      const antenna = makeCylinder(THREE, 0.012, 0.018, 0.9, 7, futuristic ? glow : steel);
      antenna.position.set(-0.55, 0.95, -0.18);
      antenna.rotation.z = -0.06;
      turretRig.add(optics, antenna);
    }

    const barrelLength = futuristic ? 3.65 : 3.25;
    const barrelRig = new THREE.Group();
    barrelRig.position.set(0, 0.22, 0.72);
    barrelRig.rotation.x = Math.PI / 2 - (futuristic ? 0.035 : 0.06);
    barrelRig.userData.weaponRig = true;
    barrelRig.userData.weaponClass = futuristic ? 'energy' : 'cannon';
    barrelRig.userData.recoilAxis = 'z';
    const barrel = makeCylinder(THREE, futuristic ? 0.07 : 0.085, 0.15, barrelLength, 12, futuristic ? bodyMat : steel);
    barrel.position.y = barrelLength * 0.48;
    const bore = makeCylinder(THREE, 0.12, 0.12, 0.24, 10, trim);
    bore.position.y = barrelLength * 0.96;
    barrelRig.add(barrel, bore);
    if (futuristic) {
      for (const side of [-1, 1]) {
        const rail = makeBox(THREE, [0.055, barrelLength * 0.72, 0.055], [side * 0.17, barrelLength * 0.51, 0], glow, 0.02);
        barrelRig.add(rail);
      }
    }
    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.y = barrelLength * 1.04;
    muzzleAnchor.userData.muzzleAnchor = true;
    barrelRig.add(muzzleAnchor);
    turretRig.add(barrelRig);
    unit.add(turretRig);

    if (era >= 2000 && !futuristic) {
      for (const side of [-1, 1]) {
        for (const z of [-0.82, -0.22, 0.38, 0.98]) {
          const eraBlock = makeBox(THREE, [0.52, 0.28, 0.48], [side * 1.24, 1.12, z], bodyMat, 0.045);
          unit.add(eraBlock);
        }
      }
    }
  }

  const recognitionFlag = createFlag(THREE, palette.body);
  recognitionFlag.scale.setScalar(artillery ? 0.42 : 0.5);
  recognitionFlag.position.set(artillery ? -0.92 : -0.72, artillery ? 1.25 : 1.58, artillery ? -0.5 : -0.72);
  unit.add(recognitionFlag);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(artillery ? 1.6 : 1.72, 24),
    new THREE.MeshBasicMaterial({ color: 0x0c1110, transparent: true, opacity: 0.26, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.018;
  shadow.scale.set(artillery ? 0.82 : 0.94, artillery ? 1.75 : 1.42, 1);
  shadow.userData.groundDecal = true;
  unit.add(shadow);
  return unit;
}

function createWalker(THREE, palette) {
  const unit = new THREE.Group();
  const shell = makeMaterial(THREE, palette.body, 0.3, 0.72);
  const armor = makeMaterial(THREE, 0x142630, 0.27, 0.84);
  const joint = makeMaterial(THREE, 0x0a1217, 0.54, 0.66);
  const glow = makeMaterial(THREE, palette.glow, 0.1, 0.48, { emissive: palette.glow, emissiveIntensity: 2.3 });
  const chassis = makeBox(THREE, [2.35, 0.78, 2.45], [0, 2.02, 0], shell, 0.2);
  chassis.userData.feedbackChassis = true;
  const prow = makeBox(THREE, [1.82, 0.56, 0.92], [0, 1.98, 1.46], armor, 0.14);
  prow.rotation.x = -0.22;
  const cockpit = makeBox(THREE, [1.25, 0.42, 0.46], [0, 2.42, 0.4], glow, 0.1);
  unit.add(chassis, prow, cockpit);
  for (const side of [-1, 1]) {
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 7), joint);
    hip.position.set(side * 1.02, 1.82, 0);
    const thigh = makeBox(THREE, [0.48, 0.92, 0.55], [side * 1.12, 1.22, 0.06], armor, 0.12);
    thigh.rotation.z = side * -0.12;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 7), glow);
    knee.position.set(side * 1.2, 0.78, 0.15);
    const shin = makeBox(THREE, [0.55, 0.86, 0.7], [side * 1.22, 0.38, 0], shell, 0.12);
    const foot = makeBox(THREE, [0.72, 0.25, 1.1], [side * 1.22, 0.08, 0.28], armor, 0.1);
    unit.add(hip, thigh, knee, shin, foot);
  }
  const turretRig = new THREE.Group();
  turretRig.position.y = 2.42;
  turretRig.userData.turretRig = true;
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.78, 0.48, 8), armor);
  const sensor = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), glow);
  sensor.position.set(0, 0.28, 0.42);
  turretRig.add(turret, sensor);
  for (const side of [-1, 1]) {
    const cannon = new THREE.Group();
    cannon.position.set(side * 0.5, 0.04, 0.4);
    cannon.rotation.x = Math.PI / 2 - 0.04;
    cannon.userData.weaponRig = true;
    cannon.userData.weaponClass = 'energy';
    cannon.userData.recoilAxis = 'z';
    const tube = makeCylinder(THREE, 0.075, 0.12, 2.75, 10, shell);
    tube.position.y = 1.24;
    const rail = makeBox(THREE, [0.05, 2.15, 0.06], [side * 0.14, 1.15, 0], glow, 0.018);
    cannon.add(tube, rail);
    const anchor = new THREE.Object3D();
    anchor.position.y = 2.68;
    anchor.userData.muzzleAnchor = true;
    cannon.add(anchor);
    turretRig.add(cannon);
  }
  unit.add(turretRig);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 24),
    new THREE.MeshBasicMaterial({ color: 0x071013, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.018;
  shadow.scale.set(1, 1.18, 1);
  shadow.userData.groundDecal = true;
  unit.add(shadow);
  return unit;
}

function createDrone(THREE, palette, era) {
  const unit = new THREE.Group();
  const futuristic = era >= 2100;
  const shell = makeMaterial(THREE, palette.body, futuristic ? 0.2 : 0.28, 0.72);
  const armor = makeMaterial(THREE, 0x122630, 0.28, 0.78);
  const glow = makeMaterial(THREE, palette.glow, 0.12, 0.32, {
    emissive: palette.glow, emissiveIntensity: 2.4,
  });
  const fuselage = new THREE.Mesh(new THREE.SphereGeometry(0.68, 14, 9), shell);
  fuselage.scale.set(1.08, 0.46, futuristic ? 1.55 : 1.28);
  fuselage.position.z = 0.08;
  const spine = makeBox(THREE, [0.48, 0.32, 1.65], [0, 0.12, -0.08], armor, 0.12);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.95, 6), shell);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, 1.12);
  unit.add(fuselage, spine, nose);
  const rotorPositions = [[-1.08, -0.58], [1.08, -0.58], [-1.14, 0.72], [1.14, 0.72]];
  rotorPositions.forEach(([x, z], index) => {
    const arm = makeBox(THREE, [Math.abs(x) * 1.35, 0.12, 0.18], [x * 0.5, 0, z], armor, 0.045);
    arm.rotation.y = x < 0 ? -0.06 : 0.06;
    const duct = new THREE.Mesh(new THREE.TorusGeometry(futuristic ? 0.38 : 0.42, 0.085, 7, 24), index < 2 ? shell : glow);
    duct.rotation.x = Math.PI / 2;
    duct.position.set(x, 0, z);
    const rotor = new THREE.Group();
    rotor.position.set(x, 0.015, z);
    rotor.rotation.x = Math.PI / 2;
    rotor.userData.rotor = true;
    const bladeA = makeBox(THREE, [0.62, 0.035, 0.075], [0, 0, 0], armor, 0.018);
    const bladeB = makeBox(THREE, [0.075, 0.035, 0.62], [0, 0, 0], armor, 0.018);
    rotor.add(bladeA, bladeB);
    unit.add(arm, duct, rotor);
  });
  if (futuristic) {
    for (const side of [-1, 1]) {
      const wing = makeBox(THREE, [0.58, 0.08, 1.05], [side * 0.72, 0.14, -0.38], shell, 0.055);
      wing.rotation.y = side * -0.28;
      const fin = makeBox(THREE, [0.08, 0.42, 0.62], [side * 0.55, 0.32, -0.82], armor, 0.045);
      fin.rotation.z = side * -0.2;
      unit.add(wing, fin);
    }
  }
  const weapon = new THREE.Group();
  weapon.position.set(0, -0.28, 0.66);
  weapon.userData.weaponRig = true;
  weapon.userData.weaponClass = 'energy';
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), glow);
  const gun = makeCylinder(THREE, 0.045, 0.075, 0.72, 9, armor);
  gun.rotation.x = Math.PI / 2;
  gun.position.z = 0.35;
  weapon.add(eye, gun);
  const muzzleAnchor = new THREE.Object3D();
  muzzleAnchor.position.z = 0.76;
  muzzleAnchor.userData.muzzleAnchor = true;
  weapon.add(muzzleAnchor);
  unit.add(weapon);
  return unit;
}

export function createUnit(THREE, options = {}) {
  const {
    type = 'infanteria', era: eraInput = 1800, teamColor = 0xd6b85a,
    position = [0, 0, 0], rotation = 0, scale = 1,
  } = options;
  const era = nearestEra(Number(eraInput));
  const futuristic = era >= 2100;
  const palette = {
    body: teamColor,
    trim: futuristic ? 0x182b38 : 0x2b302f,
    glow: era >= 2100 ? 0xa68cff : era >= 2000 ? 0x55d7ff : era >= 1900 ? 0xffb66d : 0xffcf8a,
  };
  let model;
  let silhouette = type;
  if (type === 'caballeria' || (type === 'vehiculo' && era === 1800)) {
    model = createCavalry(THREE, palette);
  } else if (type === 'tanque' || type === 'artilleria' || type === 'vehiculo') {
    // El adaptador de simulación conserva compatibilidad mapeando el caminante
    // a "tanque". Su blindaje/vida permite recuperar aquí la silueta bípedoide.
    const orbitalWalker = futuristic && type === 'tanque' && (options.health ?? 0) > 480;
    model = orbitalWalker ? createWalker(THREE, palette) : createVehicle(THREE, palette, era, type === 'artilleria');
    if (orbitalWalker) silhouette = 'walker';
  } else if (type === 'dron' || type === 'aeronave') {
    model = createDrone(THREE, palette, era);
    model.position.y = 3.2;
  } else {
    // El mapeo de la simulacion agrupa pionero/fusilero bajo "infanteria".
    // Vida y era recuperan además el exotraje sin ampliar la API pública.
    const exosuit = futuristic && (options.health ?? 0) > 150;
    const role = options.role ?? ((options.health ?? 100) <= 80 ? 'worker' : 'rifle');
    model = exosuit ? createExosuit(THREE, palette) : createInfantry(THREE, palette, era, role);
    model.userData.unitRole = exosuit ? 'exo' : role;
    if (exosuit) silhouette = 'exo';
  }
  model.name = `unidad-${type}-${era}`;
  model.position.x += position[0];
  model.position.y += position[1];
  model.position.z += position[2];
  model.rotation.y = rotation;
  model.scale.setScalar(scale);
  model.userData.entityType = 'unit';
  model.userData.kind = type;
  model.userData.era = era;
  model.userData.health = options.health ?? 100;
  model.userData.maxHealth = options.maxHealth ?? model.userData.health;
  model.userData.action = options.action ?? 'inactivo';
  model.userData.baseY = model.position.y;
  model.userData.phase = options.phase ?? Math.random() * Math.PI * 2;
  model.userData.motion = 0;
  model.userData.lastWorldX = model.position.x;
  model.userData.lastWorldZ = model.position.z;
  addUnitAtlasSilhouette(THREE, model, options, era, type);
  if (options.simulationType === 'obrero') addWorkerCargoVisual(THREE, model);
  const mounted = model.userData.unitRole === 'cavalry';
  const exosuit = silhouette === 'exo';
  const walker = silhouette === 'walker';
  addHealthBar(THREE, model, {
    width: mounted ? 2.25 : (walker ? 3 : (exosuit ? 1.92 : (type === 'tanque' || type === 'artilleria' || type === 'vehiculo' ? 2.7 : 1.62))),
    height: 0.115,
    y: mounted ? 4.05 : (type === 'dron' || type === 'aeronave' ? 1.45 : (walker ? 3.45 : (exosuit ? 3.08 : (type === 'tanque' || type === 'artilleria' || type === 'vehiculo' ? 2.42 : 2.48)))),
  });
  shadowize(model);
  return model;
}

export function createSelectionMarker(THREE, options = {}) {
  const color = options.color ?? 0x6fffd1;
  const radius = options.radius ?? 1.27;
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.94, radius, 48), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  const chevrons = new THREE.Group();
  for (let i = 0; i < 4; i += 1) {
    const chevron = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 3), material);
    const angle = i * Math.PI / 2;
    chevron.position.set(Math.sin(angle) * radius * 1.09, 0.08, Math.cos(angle) * radius * 1.09);
    chevron.rotation.x = Math.PI / 2;
    chevron.rotation.z = -angle;
    chevrons.add(chevron);
  }
  group.add(ring, chevrons);
  group.userData.selectionMarker = true;
  return group;
}

function vectorFrom(THREE, value, fallback = [0, 0, 0]) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) return new THREE.Vector3(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
  if (value && typeof value === 'object') return new THREE.Vector3(value.x ?? 0, value.y ?? 0, value.z ?? 0);
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

/**
 * Crea un proyectil visual autocontenido. createWorld.createProjectile lo
 * registra y anima; la exportacion directa permite reutilizar el aspecto en
 * escenas de menu o inspectores de unidades.
 */
export function createProjectile(THREE, options = {}) {
  const origin = vectorFrom(THREE, options.from ?? options.origin ?? options.position);
  const target = vectorFrom(THREE, options.to ?? options.target, [origin.x, origin.y, origin.z + 8]);
  const distance = origin.distanceTo(target);
  const speed = Math.max(4, options.speed ?? 34);
  const duration = Math.max(0.08, options.duration ?? distance / speed);
  const color = options.color ?? (options.kind === 'energy' ? 0x6df6ff : 0xff9a42);
  const projectile = new THREE.Group();
  projectile.name = `proyectil-${options.kind ?? 'trazador'}`;
  projectile.position.copy(origin);

  const glowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(
    options.kind === 'shell'
      ? new THREE.CapsuleGeometry(0.055, 0.22, 3, 6)
      : new THREE.SphereGeometry(options.radius ?? 0.075, 7, 5),
    glowMaterial,
  );
  core.scale.set(1, 1, options.kind === 'energy' ? 2.2 : 1);
  core.userData.projectileCore = true;
  const tracerGeometry = new THREE.BufferGeometry();
  tracerGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
  const tracer = new THREE.Line(tracerGeometry, new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: options.tracerOpacity ?? 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  tracer.frustumCulled = false;
  const trailBody = new THREE.Mesh(
    new THREE.CylinderGeometry(options.kind === 'energy' ? 0.045 : 0.028, options.kind === 'energy' ? 0.07 : 0.046, 1, 6),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: options.kind === 'energy' ? 0.54 : 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  trailBody.userData.projectileTrailBody = true;
  projectile.add(core, tracer, trailBody);
  projectile.userData.effectKind = 'projectile';
  projectile.userData.projectileKind = options.kind ?? 'tracer';
  projectile.userData.age = 0;
  projectile.userData.life = duration;
  projectile.userData.duration = duration;
  projectile.userData.origin = origin;
  projectile.userData.target = target;
  projectile.userData.arc = options.arc ?? (options.kind === 'shell' ? Math.min(9, distance * 0.22) : 0);
  projectile.userData.previous = origin.clone();
  projectile.userData.tracer = tracer;
  projectile.userData.trailBody = trailBody;
  projectile.userData.trailLength = options.trailLength ?? clamp(distance * 0.12, 0.75, 4.8);
  projectile.userData.impact = options.impact !== false;
  projectile.userData.impactOptions = {
    material: options.material ?? 'tierra',
    power: options.power ?? (options.kind === 'shell' ? 1.65 : 0.55),
    color: options.impactColor,
    smoke: options.smoke,
    direction: target.clone().sub(origin).normalize(),
  };
  return projectile;
}

const IMPACT_PALETTES = Object.freeze({
  tierra: { flash: 0xffb35c, smoke: 0x776552, debris: 0x5b4632, scar: 0x211b16 },
  madera: { flash: 0xffa04e, smoke: 0x6b5b4b, debris: 0x6e4727, scar: 0x23180f },
  metal: { flash: 0xffe3a6, smoke: 0x687177, debris: 0x9aa3a5, scar: 0x1b2022 },
  hormigon: { flash: 0xffc17b, smoke: 0x8b8982, debris: 0x77756e, scar: 0x292925 },
  agua: { flash: 0xb8f2ff, smoke: 0x8dc9d2, debris: 0x75d8e6, scar: 0x174b5a },
  energia: { flash: 0xa784ff, smoke: 0x536688, debris: 0x75efff, scar: 0x29326a },
});

function normalizeImpactMaterial(value) {
  const aliases = {
    dirt: 'tierra', earth: 'tierra', soil: 'tierra',
    wood: 'madera',
    steel: 'metal',
    concrete: 'hormigon', stone: 'hormigon',
    water: 'agua',
    energy: 'energia', plasma: 'energia',
  };
  return aliases[value] ?? value;
}

/** Explosion e impacto multicapa, con piezas etiquetadas para su animacion. */
export function createImpact(THREE, options = {}) {
  const materialKind = normalizeImpactMaterial(options.material ?? 'tierra');
  const palette = IMPACT_PALETTES[materialKind] ?? IMPACT_PALETTES.tierra;
  const power = clamp(options.power ?? 1, 0.18, 3.5);
  const color = options.color ?? palette.flash;
  const impact = new THREE.Group();
  const incoming = vectorFrom(THREE, options.direction, [0, 0, 1]);
  if (incoming.lengthSq() < 0.0001) incoming.set(0, 0, 1);
  incoming.normalize();
  impact.name = `impacto-${materialKind}`;
  impact.position.copy(vectorFrom(THREE, options.position));
  impact.userData.effectKind = 'impact';
  impact.userData.materialKind = materialKind;
  impact.userData.age = 0;
  impact.userData.life = options.life ?? (2.6 + power * 0.7);
  impact.userData.power = power;
  impact.userData.direction = incoming;
  impact.userData.flashLife = options.flashLife ?? 0.46;
  impact.userData.coreLife = options.coreLife ?? 0.34;

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sharedMuzzleTexture(THREE),
    color,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  flash.scale.setScalar(0.48 * power);
  flash.userData.impactLayer = 'flash';
  flash.position.y = 0.22 * power;
  impact.add(flash);

  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sharedMuzzleTexture(THREE),
    color: 0xfff4d0,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  core.scale.setScalar(0.22 * power);
  core.position.y = 0.2 * power;
  core.userData.impactLayer = 'core';
  impact.add(core);

  const scar = new THREE.Mesh(
    createIrregularDiscGeometry(THREE, 28, Math.floor(power * 947) + materialKind.length),
    new THREE.MeshBasicMaterial({
      color: palette.scar,
      transparent: true,
      opacity: materialKind === 'agua' ? 0.18 : 0.52,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
    }),
  );
  scar.rotation.x = -Math.PI / 2;
  scar.position.y = 0.025;
  scar.scale.setScalar(power * 0.8);
  scar.userData.impactLayer = 'scar';
  scar.userData.groundDecal = true;
  impact.add(scar);

  const particleCount = Math.round(10 + power * 10);
  const sparkPositions = new Float32Array(particleCount * 3);
  const sparkVelocities = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
    const offset = index * 3;
    const angle = (index / particleCount) * Math.PI * 2 + hash2(index, power, 219) * 0.7;
    const outward = (1.6 + hash2(index, 31, 97) * 4.2) * power;
    const forwardBias = 0.45 + hash2(index, 58, 177) * 0.85;
    sparkPositions[offset + 1] = 0.16;
    sparkVelocities[offset] = Math.cos(angle) * outward * 0.68 + incoming.x * outward * forwardBias;
    sparkVelocities[offset + 1] = (2.5 + hash2(index, 77, 311) * 5.4) * power;
    sparkVelocities[offset + 2] = Math.sin(angle) * outward * 0.68 + incoming.z * outward * forwardBias;
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({
    color: materialKind === 'agua' ? 0xb4f5ff : (materialKind === 'metal' ? 0xfff0b0 : color),
    size: materialKind === 'metal' ? 0.095 : 0.14 * power,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sparks.userData.impactLayer = 'sparks';
  sparks.userData.velocities = sparkVelocities;
  impact.add(sparks);

  const smokeCount = options.smoke === false ? 0 : Math.round(2 + power * 2.4);
  for (let index = 0; index < smokeCount; index += 1) {
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sharedSmokeTexture(THREE),
      color: palette.smoke,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }));
    const angle = hash2(index, power, 503) * Math.PI * 2;
    smoke.position.set(Math.cos(angle) * 0.18 * power, 0.3 + index * 0.09, Math.sin(angle) * 0.18 * power);
    smoke.scale.setScalar(0.42 * power * (0.75 + hash2(index, 17, 113) * 0.55));
    smoke.userData.impactLayer = 'smoke';
    smoke.userData.velocity = new THREE.Vector3(
      Math.cos(angle) * (0.12 + index * 0.02) + incoming.x * (0.16 + power * 0.08),
      0.72 + hash2(index, 22, 83) * 0.55,
      Math.sin(angle) * (0.12 + index * 0.02) + incoming.z * (0.16 + power * 0.08),
    );
    impact.add(smoke);
  }

  const debrisCount = Math.round(2 + power * 2);
  const debrisMaterial = makeMaterial(THREE, palette.debris, 0.72, materialKind === 'metal' ? 0.78 : 0.04);
  for (let index = 0; index < debrisCount; index += 1) {
    const shard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.18), debrisMaterial);
    shard.position.y = 0.15;
    const angle = hash2(index, 19, 401) * Math.PI * 2;
    shard.userData.impactLayer = materialKind === 'metal' ? 'casing' : 'debris';
    shard.userData.velocity = new THREE.Vector3(
      (Math.cos(angle) * (0.7 + hash2(index, 67, 91) * 1.3) + incoming.x * (1.1 + hash2(index, 9, 81))) * power,
      (1.8 + hash2(index, 61, 177) * 3.5) * power,
      (Math.sin(angle) * (0.7 + hash2(index, 43, 203) * 1.3) + incoming.z * (1.1 + hash2(index, 37, 141))) * power,
    );
    shard.userData.spin = new THREE.Vector3(5 + index, 7 - index * 0.4, 4 + index * 0.7);
    impact.add(shard);
  }
  return impact;
}

function createRoad(THREE, points, material, width = 3.5) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    for (const side of [-1, 1]) {
      positions.push(points[i].x + nx * width * 0.5 * side, points[i].y, points[i].z + nz * width * 0.5 * side);
      uvs.push(side < 0 ? 0 : 1, i / (points.length - 1));
    }
    if (i < points.length - 1) {
      const offset = i * 2;
      indices.push(offset, offset + 2, offset + 1, offset + 2, offset + 3, offset + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const road = new THREE.Mesh(geometry, material);
  road.receiveShadow = true;
  return road;
}

function offsetRoadPoints(THREE, points, offset, yLift = 0) {
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(point.x - (dz / length) * offset, point.y + yLift, point.z + (dx / length) * offset);
  });
}

function addRoadDetails(THREE, parent, points, width, seed) {
  const rutMaterial = new THREE.MeshBasicMaterial({
    color: 0x2b241c,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
  });
  for (const offset of [-width * 0.27, width * 0.27]) {
    const ruts = createRoad(THREE, offsetRoadPoints(THREE, points, offset, 0.025), rutMaterial.clone(), 0.18);
    ruts.name = 'huella-carro';
    ruts.userData.groundDecal = true;
    parent.add(ruts);
  }

  const random = mulberry32(seed + Math.round(width * 119));
  const markerMaterial = makeMaterial(THREE, 0xafa17e, 0.98, 0.01);
  const markerCap = makeMaterial(THREE, 0x54483a, 0.87, 0.08);
  for (let index = 2; index < points.length - 1; index += 4) {
    const side = index % 8 === 2 ? -1 : 1;
    const position = offsetRoadPoints(THREE, [
      points[Math.max(0, index - 1)], points[index], points[Math.min(points.length - 1, index + 1)],
    ], side * (width * 0.7 + 0.7))[1];
    const milestone = new THREE.Group();
    const post = makeBox(THREE, [0.32, 0.86, 0.28], [0, 0.43, 0], markerMaterial);
    const cap = makeBox(THREE, [0.42, 0.14, 0.38], [0, 0.91, 0], markerCap);
    milestone.add(post, cap);
    milestone.position.copy(position);
    milestone.rotation.y = (random() - 0.5) * 0.18;
    shadowize(milestone);
    parent.add(milestone);
  }

  // Bordes erosionados por tramos: manchas, grava y vegetacion invaden la
  // banquina con ritmos desiguales y borran la silueta de cinta perfecta.
  const vergeCount = Math.max(16, Math.floor(points.length * 2.35));
  const vergeMaterial = new THREE.MeshStandardMaterial({
    color: 0x776744,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -6,
  });
  const verge = new THREE.InstancedMesh(
    createIrregularDiscGeometry(THREE, 14, seed + 213),
    vergeMaterial,
    vergeCount,
  );
  const gravel = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.12, 0),
    makeMaterial(THREE, 0x817965, 0.98, 0.01, { vertexColors: true }),
    vergeCount,
  );
  const dummy = new THREE.Object3D();
  const stoneTint = new THREE.Color();
  for (let index = 0; index < vergeCount; index += 1) {
    const progress = (index + random() * 0.72) / vergeCount * (points.length - 1);
    const pointIndex = Math.min(points.length - 2, Math.floor(progress));
    const mix = progress - pointIndex;
    const a = points[pointIndex];
    const b = points[pointIndex + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    const side = index % 3 === 0 ? -1 : 1;
    const offset = side * (width * (0.46 + random() * 0.2));
    const x = lerp(a.x, b.x, mix) - dz / length * offset;
    const z = lerp(a.z, b.z, mix) + dx / length * offset;
    const y = lerp(a.y, b.y, mix);
    dummy.position.set(x, y + 0.018, z);
    dummy.rotation.set(-Math.PI / 2, 0, Math.atan2(dz, dx) + (random() - 0.5) * 0.6);
    dummy.scale.set(0.55 + random() * 1.15, 0.28 + random() * 0.58, 1);
    dummy.updateMatrix();
    verge.setMatrixAt(index, dummy.matrix);

    dummy.position.set(x + (random() - 0.5) * 0.7, y + 0.1, z + (random() - 0.5) * 0.7);
    const stoneScale = 0.38 + random() * 0.78;
    dummy.rotation.set(random() * 0.8, random() * Math.PI, random() * 0.7);
    dummy.scale.set(stoneScale, stoneScale * 0.54, stoneScale * 0.78);
    dummy.updateMatrix();
    gravel.setMatrixAt(index, dummy.matrix);
    stoneTint.setHex(index % 4 === 0 ? 0x655e50 : 0x91866c);
    gravel.setColorAt(index, stoneTint);
  }
  verge.instanceMatrix.needsUpdate = true;
  gravel.instanceMatrix.needsUpdate = true;
  if (gravel.instanceColor) gravel.instanceColor.needsUpdate = true;
  verge.userData.groundDecal = true;
  verge.name = 'banquina-erosionada-instanciada';
  gravel.name = 'grava-borde-instanciada';
  gravel.castShadow = true;
  parent.add(verge, gravel);
}

function createCoastlineDetails(THREE, parent, heightAt, seed, size, waterLevel) {
  const random = mulberry32(seed + 4431);
  const rockMaterial = makeMaterial(THREE, 0x6d6b62, 0.99, 0.01, { vertexColors: true });
  const rockCount = Math.floor(size * WORLD_DETAIL_BUDGET.coastElementsPerUnit * 0.72);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), rockMaterial, rockCount);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placed = 0;
  for (let attempts = 0; attempts < rockCount * 16 && placed < rockCount; attempts += 1) {
    const angle = random() * Math.PI * 2;
    const radius = size * (0.35 + random() * 0.16);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = heightAt(x, z);
    if (y < waterLevel - 0.42 || y > waterLevel + 1.05) continue;
    const scale = 0.32 + random() * 1.18;
    dummy.position.set(x, y + scale * 0.2, z);
    dummy.scale.set(scale, scale * (0.35 + random() * 0.42), scale * (0.65 + random() * 0.7));
    dummy.rotation.set(random() * 0.35, angle + random(), random() * 0.3);
    dummy.updateMatrix();
    rocks.setMatrixAt(placed, dummy.matrix);
    tint.setHex(random() > 0.55 ? 0x77736a : 0x5b615c);
    rocks.setColorAt(placed, tint);
    placed += 1;
  }
  rocks.count = placed;
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.name = 'borde-costero-rocoso';
  parent.add(rocks);

  const patchCount = Math.floor(size * 0.38);
  const wetSand = new THREE.InstancedMesh(
    createIrregularDiscGeometry(THREE, 16, seed + 4487),
    new THREE.MeshStandardMaterial({
      color: 0xb49a62,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
    }),
    patchCount,
  );
  const foam = new THREE.InstancedMesh(
    createIrregularDiscGeometry(THREE, 12, seed + 4501),
    new THREE.MeshBasicMaterial({
      color: 0xd8dfcc,
      transparent: true,
      opacity: 0.27,
      depthWrite: false,
    }),
    patchCount,
  );
  placed = 0;
  for (let attempts = 0; attempts < patchCount * 26 && placed < patchCount; attempts += 1) {
    const angle = random() * Math.PI * 2;
    const radius = size * (0.34 + random() * 0.2);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = heightAt(x, z);
    if (y < waterLevel - 0.12 || y > waterLevel + 0.48) continue;
    const length = 0.85 + random() * 2.4;
    dummy.position.set(x, y + 0.035, z);
    dummy.rotation.set(-Math.PI / 2, 0, angle + (random() - 0.5) * 0.58);
    dummy.scale.set(length, 0.34 + random() * 0.62, 1);
    dummy.updateMatrix();
    wetSand.setMatrixAt(placed, dummy.matrix);
    dummy.position.set(x - Math.cos(angle) * 0.45, waterLevel + 0.018, z - Math.sin(angle) * 0.45);
    dummy.scale.set(length * 0.52, 0.13 + random() * 0.24, 1);
    dummy.updateMatrix();
    foam.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  wetSand.count = placed;
  foam.count = placed;
  wetSand.instanceMatrix.needsUpdate = true;
  foam.instanceMatrix.needsUpdate = true;
  wetSand.userData.groundDecal = true;
  foam.userData.groundDecal = true;
  wetSand.name = 'playa-humeda-fragmentada';
  foam.name = 'espuma-costera-fragmentada';
  parent.add(wetSand, foam);

  const driftCount = Math.max(12, Math.floor(size * 0.12));
  const driftwood = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.09, 0.16, 1.8, 7),
    makeMaterial(THREE, 0x554838, 0.98, 0.01),
    driftCount,
  );
  placed = 0;
  for (let attempts = 0; attempts < driftCount * 28 && placed < driftCount; attempts += 1) {
    const angle = random() * Math.PI * 2;
    const radius = size * (0.35 + random() * 0.18);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = heightAt(x, z);
    if (y < waterLevel + 0.04 || y > waterLevel + 0.72) continue;
    const scale = 0.55 + random() * 0.85;
    dummy.position.set(x, y + 0.12, z);
    dummy.rotation.set(Math.PI / 2 + (random() - 0.5) * 0.1, angle + random() * 1.3, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    driftwood.setMatrixAt(placed++, dummy.matrix);
  }
  driftwood.count = placed;
  driftwood.instanceMatrix.needsUpdate = true;
  driftwood.castShadow = true;
  driftwood.name = 'madera-deriva-instanciada';
  parent.add(driftwood);
  rocks.userData.coastalLayers = { wetSand, foam, driftwood };
  return rocks;
}

function createTerrain(THREE, size, segments, seed, heightAt, waterLevel) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const positions = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const worldZ = -positions.getY(index);
    const height = heightAt(x, worldZ);
    positions.setZ(index, height);
    const moisture = fbm(x * 0.025 + 17, worldZ * 0.025 - 11, seed + 91);
    const patches = fbm(x * 0.09 + 31, worldZ * 0.09 - 19, seed + 303);
    const slope = Math.hypot(
      heightAt(x + 0.62, worldZ) - height,
      heightAt(x, worldZ + 0.62) - height,
    ) / 0.62;
    const shore = clamp((height - waterLevel) / 1.22, 0, 1);
    const soil = new THREE.Color(0x806f48);
    const meadow = new THREE.Color(0x6b824a);
    const moss = new THREE.Color(0x3d6745);
    const stone = new THREE.Color(height > 4.1 ? 0x596157 : 0x6a695a);
    color.copy(soil).lerp(meadow, clamp(shore * 0.74 + patches * 0.32, 0, 1));
    color.lerp(moss, clamp((moisture - 0.48) * 1.85, 0, 0.76));
    color.lerp(stone, clamp((slope - 0.42) * 1.18 + Math.max(0, height - 4.0) * 0.16, 0, 0.88));
    color.lerp(new THREE.Color(0xb29a66), (1 - shore) * 0.92);
    const variation = (hash2(x * 0.3, worldZ * 0.3, seed) - 0.5) * 0.075;
    color.offsetHSL(variation * 0.14, variation * 0.12, variation);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const surfaceTexture = createSurfaceTexture(THREE, seed + 511);
  const material = applyMacroSurfaceShader(new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: surfaceTexture,
    bumpMap: surfaceTexture,
    bumpScale: 0.24,
    roughnessMap: surfaceTexture,
    roughness: 0.96,
    metalness: 0,
  }), seed);
  const terrain = new THREE.Mesh(geometry, material);
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  terrain.name = 'terreno-procedural';
  return terrain;
}

function createWater(THREE, size, waterLevel) {
  const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x0c4262) },
      uShallow: { value: new THREE.Color(0x2d8f9e) },
      uSun: { value: new THREE.Color(0xf6e3b4) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vWave;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w1 = sin(p.x * 0.15 + uTime * 0.75) * 0.08;
        float w2 = cos(p.y * 0.12 - uTime * 0.55) * 0.055;
        p.z += w1 + w2;
        vWave = w1 + w2;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vWave;
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSun;
      void main() {
        float bands = sin((vUv.x + vUv.y) * 90.0 + uTime) * 0.5 + 0.5;
        float glint = smoothstep(0.84, 1.0, bands) * (0.18 + vWave);
        vec3 color = mix(uDeep, uShallow, 0.48 + vWave * 1.6);
        color = mix(color, uSun, glint * 0.4);
        gl_FragColor = vec4(color, 0.68);
      }
    `,
  });
  const water = new THREE.Mesh(geometry, material);
  water.rotation.x = -Math.PI / 2;
  water.position.y = waterLevel;
  water.renderOrder = 1;
  water.name = 'agua-animada';
  return water;
}

function createVegetation(THREE, group, heightAt, seed, size) {
  const random = mulberry32(seed + 771);
  const trunkMaterial = makeMaterial(THREE, 0xffffff, 0.98, 0, {
    vertexColors: true,
    emissive: 0x160f09,
    emissiveIntensity: 0.12,
  });
  const leafMaterials = [0x315f3f, 0x476b3a, 0x385f35, 0x657042, 0x304d32]
    .map((tone) => makeMaterial(THREE, 0xffffff, 0.9, 0.01, {
      vertexColors: true,
      emissive: tone,
      emissiveIntensity: 0.2,
    }));
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.23, 2.05, 7);
  const amount = Math.floor(size * WORLD_DETAIL_BUDGET.treesPerUnit);
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, amount);
  const canopies = new THREE.InstancedMesh(new THREE.ConeGeometry(1.18, 2.05, 14), leafMaterials[0], amount);
  const upperCanopies = new THREE.InstancedMesh(new THREE.ConeGeometry(0.77, 1.72, 12), leafMaterials[0], amount);
  const broadCanopies = new THREE.InstancedMesh(createOrganicCanopyGeometry(THREE, 1.12, seed + 31, 0.82), leafMaterials[1], amount);
  const broadCrowns = new THREE.InstancedMesh(createOrganicCanopyGeometry(THREE, 0.82, seed + 43, 0.9), leafMaterials[1], amount);
  const oakCanopies = new THREE.InstancedMesh(createOrganicCanopyGeometry(THREE, 1.08, seed + 67, 0.78), leafMaterials[2], amount);
  const oakCrowns = new THREE.InstancedMesh(createOrganicCanopyGeometry(THREE, 0.76, seed + 89, 0.88), leafMaterials[2], amount);
  const windCanopies = new THREE.InstancedMesh(createOrganicCanopyGeometry(THREE, 1, seed + 101, 0.62), leafMaterials[3], amount);
  const cypressCanopies = new THREE.InstancedMesh(new THREE.ConeGeometry(0.62, 3.25, 16), leafMaterials[4], amount);
  const families = [
    [canopies, upperCanopies],
    [broadCanopies, broadCrowns],
    [oakCanopies, oakCrowns],
    [windCanopies],
    [cypressCanopies],
  ];
  families.flat().forEach((mesh) => { mesh.visible = false; });
  const foliageTexture = new THREE.TextureLoader().load(assetUrl('foliage-chroma-atlas-v1.png'));
  foliageTexture.colorSpace = THREE.SRGBColorSpace;
  foliageTexture.anisotropy = 8;
  foliageTexture.generateMipmaps = false;
  foliageTexture.minFilter = THREE.LinearFilter;
  const foliageMaterial = createChromaFoliageMaterial(THREE, foliageTexture);
  const foliageQuadrants = [
    [0.5, 0.5, 1, 1],
    [0, 0.5, 0.5, 1],
    [0, 0.5, 0.5, 1],
    [0, 0, 0.5, 0.5],
    [0.5, 0, 1, 0.5],
  ];
  const foliageBillboards = foliageQuadrants.map((quadrant) => new THREE.InstancedMesh(
    createCrossBillboardGeometry(THREE, quadrant),
    foliageMaterial,
    amount,
  ));
  const familyCounts = families.map(() => 0);
  const clusterCenters = [
    [-0.31, -0.27, 0.105], [-0.37, 0.04, 0.08], [-0.25, 0.31, 0.11],
    [0.31, 0.29, 0.12], [0.38, -0.04, 0.085], [0.22, -0.34, 0.105],
    [-0.05, -0.39, 0.075], [0.04, 0.4, 0.07], [0.42, 0.17, 0.065],
  ].slice(0, WORLD_DETAIL_BUDGET.biomeClusters).map(([x, z, radius]) => ({
    x: x * size,
    z: z * size,
    radius: radius * size,
  }));
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  for (let attempts = 0; attempts < amount * 5 && placed < amount; attempts += 1) {
    const clustered = random() < 0.82;
    const cluster = clusterCenters[attempts % clusterCenters.length];
    const clusterAngle = random() * Math.PI * 2;
    const clusterRadius = Math.sqrt(random()) * cluster.radius;
    const x = clustered ? cluster.x + Math.cos(clusterAngle) * clusterRadius : (random() - 0.5) * size * 0.94;
    const z = clustered ? cluster.z + Math.sin(clusterAngle) * clusterRadius : (random() - 0.5) * size * 0.94;
    const y = heightAt(x, z);
    const settlementClearance = Math.min(Math.hypot(x + 55, z - 34), Math.hypot(x - 55, z + 34)) < 12.5;
    const centerClearance = Math.hypot(x, z) < 22 || Math.abs(x + z * 0.18) < 4.5 || settlementClearance;
    const moisture = fbm(x * 0.032 + 17, z * 0.032 - 11, seed + 91);
    const forestFloor = smoothNoise(x * 0.055, z * 0.055, seed + 611);
    if (y < -0.55 || centerClearance || (!clustered && forestFloor < 0.52) || random() < 0.13) continue;
    const scale = 0.58 + random() * 0.54 + (clustered ? 0.05 : 0);
    dummy.position.set(x, y + 1.02 * scale, z);
    dummy.scale.set(scale * (0.82 + random() * 0.3), scale, scale * (0.82 + random() * 0.3));
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    color.setHSL(0.19 + random() * 0.18, 0.25 + random() * 0.23, 0.34 + random() * 0.16);
    trunks.setColorAt(placed, new THREE.Color(0x4c3827).offsetHSL(0, 0, (random() - 0.5) * 0.1));

    let family;
    if (y > 3.2) family = random() > 0.28 ? 0 : 4;
    else if (moisture > 0.64) family = random() > 0.48 ? 1 : 2;
    else if (Math.hypot(x, z) > size * 0.41) family = random() > 0.42 ? 3 : 4;
    else if (moisture < 0.43) family = random() > 0.38 ? 0 : 3;
    else family = random() > 0.55 ? 2 : 1;
    const slot = familyCounts[family]++;
    const billboardSizes = [[3.8, 5.1], [4.3, 4.6], [4.1, 4.35], [4.8, 4.25], [2.35, 5.25]];
    const [billboardWidth, billboardHeight] = billboardSizes[family];
    dummy.position.set(x, y, z);
    dummy.scale.set(billboardWidth * scale, billboardHeight * scale, billboardWidth * scale);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.updateMatrix();
    foliageBillboards[family].setMatrixAt(slot, dummy.matrix);
    const primary = families[family][0];
    const secondary = families[family][1];
    if (family === 0) {
      dummy.position.set(x, y + 2.35 * scale, z);
      dummy.scale.set(scale * 1.08, scale, scale * 0.94);
      dummy.updateMatrix();
      primary.setMatrixAt(slot, dummy.matrix);
      dummy.position.y = y + 3.42 * scale;
      dummy.scale.set(scale * 0.83, scale, scale * 0.75);
      dummy.rotation.y += 0.41;
      dummy.updateMatrix();
      secondary.setMatrixAt(slot, dummy.matrix);
    } else if (family === 1) {
      dummy.position.set(x, y + 2.65 * scale, z);
      dummy.scale.set(scale * 1.18, scale * 0.9, scale * 0.95);
      dummy.rotation.z = (random() - 0.5) * 0.16;
      dummy.updateMatrix();
      primary.setMatrixAt(slot, dummy.matrix);
      dummy.position.set(x + 0.5 * scale, y + 3.15 * scale, z - 0.18 * scale);
      dummy.scale.set(scale * 0.82, scale * 0.72, scale * 0.78);
      dummy.updateMatrix();
      secondary.setMatrixAt(slot, dummy.matrix);
    } else if (family === 2) {
      dummy.position.set(x, y + 2.5 * scale, z);
      dummy.scale.set(scale * 1.32, scale * 0.75, scale * 1.05);
      dummy.rotation.z = (random() - 0.5) * 0.1;
      dummy.updateMatrix();
      primary.setMatrixAt(slot, dummy.matrix);
      dummy.position.set(x - 0.58 * scale, y + 2.9 * scale, z + 0.28 * scale);
      dummy.scale.set(scale * 0.72, scale * 0.65, scale * 0.72);
      dummy.updateMatrix();
      secondary.setMatrixAt(slot, dummy.matrix);
    } else if (family === 3) {
      dummy.position.set(x + 0.36 * scale, y + 2.55 * scale, z);
      dummy.scale.set(scale * 1.48, scale * 0.68, scale * 0.76);
      dummy.rotation.z = -0.16 - random() * 0.22;
      dummy.updateMatrix();
      primary.setMatrixAt(slot, dummy.matrix);
    } else {
      dummy.position.set(x, y + 2.75 * scale, z);
      dummy.scale.set(scale * 0.82, scale * 0.9, scale * 0.82);
      dummy.rotation.z = (random() - 0.5) * 0.06;
      dummy.updateMatrix();
      primary.setMatrixAt(slot, dummy.matrix);
    }
    primary.setColorAt(slot, color);
    if (secondary) secondary.setColorAt(slot, color.clone().offsetHSL(0.015, 0.04, -0.045));
    placed += 1;
  }
  trunks.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
  families.forEach((meshes, family) => meshes.forEach((mesh) => {
    mesh.count = familyCounts[family];
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }));
  foliageBillboards.forEach((mesh, family) => {
    mesh.count = familyCounts[family];
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = `follaje-atlas-${family}`;
    group.add(mesh);
  });
  group.add(trunks);

  const rockGeometry = new THREE.IcosahedronGeometry(0.55, 1);
  const rockMaterial = makeMaterial(THREE, 0x6c706c, 0.97, 0.02);
  const rockCapacity = Math.floor(size * WORLD_DETAIL_BUDGET.rocksPerUnit);
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCapacity);
  let rockPlaced = 0;
  for (let attempts = 0; attempts < rockCapacity * 6 && rockPlaced < rockCapacity; attempts += 1) {
    const x = (random() - 0.5) * size * 0.92;
    const z = (random() - 0.5) * size * 0.92;
    const y = heightAt(x, z);
    const s = 0.3 + random() * 1.2;
    if (y < -0.65 || Math.hypot(x, z) < 18) continue;
    dummy.position.set(x, y + s * 0.27, z);
    dummy.scale.set(s, s * (0.6 + random() * 0.6), s * (0.7 + random() * 0.5));
    dummy.rotation.set(random(), random() * Math.PI, random());
    dummy.updateMatrix();
    rocks.setMatrixAt(rockPlaced++, dummy.matrix);
  }
  rocks.count = rockPlaced;
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);
  return {
    trunks, canopies, upperCanopies, broadCanopies, broadCrowns,
    oakCanopies, oakCrowns, windCanopies, cypressCanopies, foliageBillboards, foliageMaterial,
    familyCounts: [...familyCounts], rocks,
  };
}

function createRuins(THREE, parent, heightAt, random) {
  const stone = makeMaterial(THREE, 0x777168, 0.98, 0.01);
  const root = new THREE.Group();
  root.name = 'ruinas-historicas';
  parent.add(root);
  const positions = [[-26, -19], [31, 24], [-34, 23]];
  for (const [x, z] of positions) {
    const ruin = new THREE.Group();
    for (let i = 0; i < 5; i += 1) {
      const width = 0.7 + random() * 1.1;
      const height = 0.5 + random() * 2.8;
      const block = makeBox(THREE, [width, height, 0.75 + random() * 0.5], [
        (i - 2) * 1.1,
        height / 2,
        (random() - 0.5) * 1.5,
      ], stone);
      block.rotation.set((random() - 0.5) * 0.12, (random() - 0.5) * 0.35, (random() - 0.5) * 0.18);
      ruin.add(block);
    }
    ruin.position.set(x, heightAt(x, z), z);
    ruin.rotation.y = random() * Math.PI * 2;
    shadowize(ruin);
    root.add(ruin);
  }
  return root;
}

function createBiomePropClusters(THREE, parent, heightAt, seed, size, texture, initialEra) {
  const root = new THREE.Group();
  root.name = 'clusters-funcionales-atlas-por-era';
  parent.add(root);
  const clusterDefs = [
    [-0.25, -0.27, 'madera'], [-0.32, 0.11, 'puesto'], [-0.18, 0.35, 'cultivo'],
    [0.27, 0.29, 'cantera'], [0.34, -0.12, 'humedal'], [0.2, -0.36, 'puesto'],
  ].slice(0, WORLD_DETAIL_BUDGET.eraClusters);
  const random = mulberry32(seed + 7213);
  const eraGroups = new Map();
  const billboards = [];
  ERA_YEARS.forEach((era, row) => {
    const eraGroup = new THREE.Group();
    eraGroup.name = `props-atlas-era-${era}`;
    clusterDefs.forEach(([px, pz, kind], clusterIndex) => {
      const column = kind === 'madera' ? 1 : kind === 'cultivo' || kind === 'humedal' ? 2 : kind === 'puesto' ? 3 : 0;
      const dimensions = column === 3 ? [7.6, 5.4] : column === 2 ? [7.0, 4.8] : [6.5, 4.8];
      const geometry = new THREE.PlaneGeometry(...dimensions);
      geometry.translate(0, dimensions[1] * 0.5, 0);
      const material = createUnitAtlasMaterial(THREE, texture, row, column, 0x292a25, {
        outlineBrightness: 0.06,
        baseWash: 0,
        accentWash: 0,
        gamma: 0.92,
      });
      const prop = new THREE.Mesh(geometry, material);
      const x = px * size + (random() - 0.5) * 2.2;
      const z = pz * size + (random() - 0.5) * 2.2;
      prop.position.set(x, heightAt(x, z) + 0.035, z);
      prop.scale.setScalar(0.86 + random() * 0.18);
      prop.userData.environmentBillboard = true;
      prop.userData.atlasCell = `${row}:${column}`;
      prop.name = `prop-atlas-${era}-${kind}-${clusterIndex}`;
      prop.renderOrder = 1;
      eraGroup.add(prop);
      billboards.push(prop);
    });
    root.add(eraGroup);
    eraGroups.set(era, eraGroup);
  });
  const setEra = (nextEra) => eraGroups.forEach((group, key) => { group.visible = key === nextEra; });
  setEra(initialEra);
  return { root, eraGroups, billboards, setEra };
}

function createEraInfrastructure(THREE, parent, heightAt, seed, size, initialEra) {
  const root = new THREE.Group();
  root.name = 'infraestructura-ambiental-por-era';
  parent.add(root);
  const eraGroups = new Map();
  const random = mulberry32(seed + 8123);
  const positions = [[-0.24, 0.02], [0.24, -0.04]];
  for (const era of ERA_YEARS) {
    const eraGroup = new THREE.Group();
    eraGroup.name = `infraestructura-era-${era}`;
    const palette = buildingPalette(era, 0x42bde8);
    positions.forEach(([px, pz], index) => {
      const cluster = new THREE.Group();
      const metal = makeMaterial(THREE, era <= 1900 ? 0x414441 : 0x334957, 0.48, 0.72);
      const accent = makeMaterial(THREE, palette.glow, 0.24, 0.46, {
        emissive: era >= 2000 ? palette.glow : 0x000000,
        emissiveIntensity: era >= 2000 ? 0.72 : 0,
      });
      if (era === 1800) {
        const tank = makeCylinder(THREE, 0.62, 0.72, 1.65, 10, metal);
        tank.position.y = 0.84;
        const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.09, 6, 16, Math.PI * 1.45), metal);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(0.7, 1.18, 0);
        const coal = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 0), makeMaterial(THREE, 0x242521, 1, 0));
        coal.scale.set(1.8, 0.58, 1.2);
        coal.position.set(-1.45, 0.42, 0.35);
        cluster.add(tank, pipe, coal);
      } else if (era === 1900) {
        const mast = makeBox(THREE, [0.24, 3.8, 0.28], [0, 1.9, 0], metal);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.13, 7, 22), metal);
        wheel.position.set(0, 2.65, 0);
        wheel.userData.rotor = true;
        const generator = makeBox(THREE, [2.3, 1.1, 1.45], [0.3, 0.55, 0.15], metal);
        cluster.add(mast, wheel, generator);
      } else if (era === 2000) {
        for (let panel = 0; panel < 3; panel += 1) {
          const solar = makeBox(THREE, [1.7, 0.12, 1.05], [(panel - 1) * 1.55, 0.9, 0], accent);
          solar.rotation.x = -0.42;
          solar.rotation.z = (panel - 1) * 0.05;
          cluster.add(solar);
        }
        cluster.add(makeBox(THREE, [0.18, 1.45, 0.18], [0, 0.55, 0.55], metal));
      } else {
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.78, 0), accent);
        core.position.y = 2.0;
        core.userData.float = true;
        core.userData.baseY = 2.0;
        cluster.add(core);
        for (const y of [0.7, 1.4, 2.1]) {
          const halo = new THREE.Mesh(new THREE.TorusGeometry(1.2 - y * 0.12, 0.06, 6, 24), accent);
          halo.rotation.x = Math.PI / 2;
          halo.position.y = y;
          halo.userData.landmarkHalo = true;
          cluster.add(halo);
        }
      }
      const x = px * size;
      const z = pz * size;
      cluster.position.set(x, heightAt(x, z), z);
      cluster.rotation.y = random() * Math.PI * 2 + index * Math.PI;
      shadowize(cluster);
      eraGroup.add(cluster);
    });
    root.add(eraGroup);
    eraGroups.set(era, eraGroup);
  }
  const setEra = (nextEra) => eraGroups.forEach((group, key) => { group.visible = key === nextEra; });
  setEra(initialEra);
  return { root, eraGroups, setEra };
}

function createGroundLife(THREE, parent, heightAt, seed, size) {
  const random = mulberry32(seed + 1337);
  const detail = new THREE.Group();
  detail.name = 'detalle-ambiental-instanciado';
  parent.add(detail);

  const occupied = [
    [-55, 34, 7], [-45, 27, 6], [-45, 41, 6], [-62, 27, 4.5], [-63, 38, 4.5],
    [55, -34, 7], [45, -27, 6], [45, -41, 6], [62, -27, 4.5], [63, -38, 4.5],
  ];
  const blockedByStructure = (x, z) => occupied.some(([cx, cz, radius]) => Math.hypot(x - cx, z - cz) < radius);
  const onRoad = (x, z) => Math.abs(x + z * 0.18) < 3.7 || (Math.abs(z - 7) < 2.5 && Math.abs(x) < 35);

  const grassAmount = Math.floor(size * WORLD_DETAIL_BUDGET.groundTuftsPerUnit);
  const grass = new THREE.InstancedMesh(
    createGrassTuftGeometry(THREE),
    makeMaterial(THREE, 0x5f7f43, 0.98, 0, { side: THREE.DoubleSide }),
    grassAmount,
  );
  grass.name = 'matas-y-pastos';
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placed = 0;
  for (let attempts = 0; attempts < grassAmount * 6 && placed < grassAmount; attempts += 1) {
    const x = (random() - 0.5) * size * 0.9;
    const z = (random() - 0.5) * size * 0.9;
    const y = heightAt(x, z);
    if (y < -0.42 || blockedByStructure(x, z) || onRoad(x, z)) continue;
    const scale = 0.55 + random() * 0.85;
    dummy.position.set(x, y + 0.38 * scale, z);
    dummy.scale.set(scale * (0.7 + random() * 0.7), scale, scale * (0.7 + random() * 0.7));
    dummy.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.18);
    dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix);
    tint.setHSL(0.2 + random() * 0.09, 0.28 + random() * 0.18, 0.34 + random() * 0.13);
    grass.setColorAt(placed, tint);
    placed += 1;
  }
  grass.count = placed;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  grass.receiveShadow = true;
  detail.add(grass);

  const flowerAmount = Math.floor(size * 0.55);
  const stems = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.018, 0.026, 0.42, 5),
    makeMaterial(THREE, 0x45613a, 0.96, 0),
    flowerAmount,
  );
  const blossoms = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.09, 0),
    makeMaterial(THREE, 0xd5b85a, 0.8, 0.02),
    flowerAmount,
  );
  placed = 0;
  for (let attempts = 0; attempts < flowerAmount * 8 && placed < flowerAmount; attempts += 1) {
    const x = (random() - 0.5) * size * 0.84;
    const z = (random() - 0.5) * size * 0.84;
    const y = heightAt(x, z);
    if (y < -0.3 || blockedByStructure(x, z) || onRoad(x, z) || random() < 0.34) continue;
    dummy.position.set(x, y + 0.21, z);
    dummy.scale.setScalar(0.75 + random() * 0.7);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.updateMatrix();
    stems.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = y + 0.44 * dummy.scale.y;
    dummy.updateMatrix();
    blossoms.setMatrixAt(placed, dummy.matrix);
    tint.setHex(random() > 0.52 ? 0xdcb35f : (random() > 0.45 ? 0xe8dfc2 : 0xb06047));
    blossoms.setColorAt(placed, tint);
    placed += 1;
  }
  stems.count = placed;
  blossoms.count = placed;
  stems.instanceMatrix.needsUpdate = true;
  blossoms.instanceMatrix.needsUpdate = true;
  if (blossoms.instanceColor) blossoms.instanceColor.needsUpdate = true;
  detail.add(stems, blossoms);

  const dirtMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b3c2b,
    roughness: 1,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  const wornGround = [
    [-54, 22, 3.3, 1.45], [-37, 30, 2.6, 1.25], [-54, 47, 2.2, 1.05],
    [54, -22, 3.3, 1.45], [37, -30, 2.6, 1.25], [54, -47, 2.2, 1.05],
  ];
  wornGround.forEach(([x, z, sx, sz], index) => {
    const decal = new THREE.Mesh(createIrregularDiscGeometry(THREE, 26, 207 + index * 23), dirtMaterial.clone());
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = index * 0.93;
    decal.position.set(x, heightAt(x, z) + 0.185, z);
    decal.scale.set(sx, sz, 1);
    decal.userData.groundDecal = true;
    detail.add(decal);
  });

  const wood = makeMaterial(THREE, 0x765335, 0.88, 0.04);
  const darkWood = makeMaterial(THREE, 0x3d3025, 0.94, 0.02);
  const iron = makeMaterial(THREE, 0x343a39, 0.56, 0.68);
  const legacySupply = new THREE.Group();
  legacySupply.name = 'suministros-historicos-1800-1900';
  detail.add(legacySupply);
  const supplyPositions = [
    [-53.5, 21.5, 0], [-51.9, 22.25, 0.24], [-50.8, 21.2, -0.12],
    [53.5, -21.5, 0], [51.9, -22.25, 0.24], [50.8, -21.2, -0.12],
  ];
  supplyPositions.forEach(([x, z, rotation], index) => {
    const crate = new THREE.Group();
    const scale = index % 3 === 1 ? 0.82 : 1;
    const box = makeBox(THREE, [1.05, 0.82, 0.92], [0, 0.41, 0], wood);
    const slatA = makeBox(THREE, [1.1, 0.1, 0.98], [0, 0.2, 0], darkWood);
    const slatB = makeBox(THREE, [1.1, 0.1, 0.98], [0, 0.64, 0], darkWood);
    crate.add(box, slatA, slatB);
    crate.position.set(x, heightAt(x, z), z);
    crate.rotation.y = rotation + (index > 2 ? Math.PI : 0);
    crate.scale.setScalar(scale);
    shadowize(crate);
    legacySupply.add(crate);
  });

  for (const [x, z] of [[-56.2, 21.4], [-49.4, 22.25], [56.2, -21.4], [49.4, -22.25]]) {
    const barrel = new THREE.Group();
    const body = makeCylinder(THREE, 0.34, 0.37, 0.92, 12, darkWood);
    body.position.y = 0.46;
    for (const y of [0.16, 0.48, 0.79]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.032, 5, 14), iron);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = y;
      barrel.add(hoop);
    }
    barrel.add(body);
    barrel.position.set(x, heightAt(x, z), z);
    shadowize(barrel);
    legacySupply.add(barrel);
  }

  // Linea de telegrafo: tecnologia de 1800 reconocible, ritmo vertical y
  // profundidad de escena sin tapar la lectura de las unidades.
  const telegraph = new THREE.Group();
  telegraph.name = 'telegrafo-ambiental-1800';
  detail.add(telegraph);
  const poleTop = [];
  for (let index = 0; index < 9; index += 1) {
    const z = -48 + index * 12;
    const x = -z * 0.18 + 5.4;
    const y = heightAt(x, z);
    const pole = new THREE.Group();
    const trunk = makeCylinder(THREE, 0.09, 0.16, 4.6, 7, darkWood);
    trunk.position.y = 2.3;
    const crossbar = makeBox(THREE, [1.35, 0.13, 0.13], [0, 4.25, 0], wood);
    pole.add(trunk, crossbar);
    for (const side of [-1, 1]) {
      const insulator = makeCylinder(THREE, 0.065, 0.09, 0.2, 8, makeMaterial(THREE, 0x9cbea7, 0.27, 0.18));
      insulator.position.set(side * 0.51, 4.42, 0);
      pole.add(insulator);
    }
    pole.position.set(x, y, z);
    shadowize(pole);
    telegraph.add(pole);
    poleTop.push(new THREE.Vector3(x, y + 4.48, z));
  }
  for (const offset of [-0.5, 0.5]) {
    const wirePoints = poleTop.map((point) => point.clone().add(new THREE.Vector3(offset, 0, 0)));
    const wire = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wirePoints), 72, 0.018, 3, false),
      iron,
    );
    wire.name = 'cable-telegrafo';
    telegraph.add(wire);
  }

  const dustCount = 84;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustOrigins = new Float32Array(dustCount * 3);
  const dustPhases = new Float32Array(dustCount);
  for (let index = 0; index < dustCount; index += 1) {
    let x;
    let z;
    let y;
    do {
      x = (random() - 0.5) * size * 0.72;
      z = (random() - 0.5) * size * 0.72;
      y = heightAt(x, z);
    } while (y < -0.35);
    const offset = index * 3;
    dustPositions[offset] = x;
    dustPositions[offset + 1] = y + 0.35 + random() * 2.1;
    dustPositions[offset + 2] = z;
    dustOrigins.set(dustPositions.subarray(offset, offset + 3), offset);
    dustPhases[index] = random() * Math.PI * 2;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    color: 0xe2c994,
    size: 0.16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  dust.userData.ambientDust = true;
  dust.userData.origins = dustOrigins;
  dust.userData.phases = dustPhases;
  detail.add(dust);

  return { detail, grass, flowers: blossoms, dust, legacySupply, telegraph };
}

function createAtmosphere(THREE, scene, size) {
  if (!scene.fog) scene.fog = new THREE.FogExp2(0x9aaca5, 0.0068);
  else {
    scene.fog.color.setHex(0x9aaca5);
    scene.fog.density = 0.0068;
  }
  const skyGeometry = new THREE.SphereGeometry(size * 1.35, 32, 16);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x355c70) },
      horizonColor: { value: new THREE.Color(0xd6bd90) },
      bottomColor: { value: new THREE.Color(0x74877e) },
    },
    vertexShader: 'varying vec3 vWorld; void main(){ vWorld=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 vWorld;
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      void main(){
        float h=normalize(vWorld).y;
        vec3 c=mix(bottomColor,horizonColor,smoothstep(-0.25,0.08,h));
        c=mix(c,topColor,smoothstep(0.02,0.72,h));
        gl_FragColor=vec4(c,1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.name = 'cielo-atmosferico';
  scene.add(sky);

  const hemisphere = new THREE.HemisphereLight(0xd7e4e5, 0x83745f, 1.9);
  const fill = new THREE.AmbientLight(0xb8c1ba, 0.68);
  const sun = new THREE.DirectionalLight(0xffd59b, 3.35);
  sun.position.set(-48, 72, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -72;
  sun.shadow.camera.right = 72;
  sun.shadow.camera.top = 72;
  sun.shadow.camera.bottom = -72;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 175;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.03;
  scene.add(hemisphere, fill, sun);
  return { sky, hemisphere, fill, sun };
}

function createClouds(THREE, parent, seed, size) {
  const random = mulberry32(seed + 991);
  const material = new THREE.MeshBasicMaterial({
    color: 0xe4e8e2,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const clouds = new THREE.Group();
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Group();
    for (let puff = 0; puff < 5; puff += 1) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + random() * 2.5, 1), material);
      mesh.position.set((puff - 2) * 2.4, random() * 0.8, (random() - 0.5) * 2.2);
      mesh.scale.y = 0.38;
      cloud.add(mesh);
    }
    cloud.position.set((random() - 0.5) * size, 24 + random() * 10, (random() - 0.5) * size);
    cloud.userData.speed = 0.35 + random() * 0.38;
    clouds.add(cloud);
  }
  parent.add(clouds);
  return clouds;
}

function createAmbientWildlife(THREE, parent, heightAt, seed, size) {
  const random = mulberry32(seed + 4099);
  const wildlife = new THREE.Group();
  wildlife.name = 'fauna-ambiental-lod';
  parent.add(wildlife);

  // Una sola malla instanciada dibuja toda la bandada. Las matrices se
  // actualizan a 20 Hz, suficiente para fauna distante y mucho mas economico
  // que mantener esqueletos individuales.
  const birdGeometry = new THREE.BufferGeometry();
  birdGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.04, 0.52, -0.9, 0, -0.22, -0.08, 0, -0.08,
    0, 0.04, 0.52, 0.08, 0, -0.08, 0.9, 0, -0.22,
  ], 3));
  birdGeometry.computeVertexNormals();
  const birdCount = 16;
  const birds = new THREE.InstancedMesh(
    birdGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x344143,
      side: THREE.DoubleSide,
      fog: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
    birdCount,
  );
  birds.name = 'bandada-instanciada';
  birds.frustumCulled = false;
  birds.userData.origins = [];
  birds.userData.phases = [];
  birds.userData.speeds = [];
  for (let index = 0; index < birdCount; index += 1) {
    birds.userData.origins.push(new THREE.Vector3(
      (random() - 0.5) * size * 0.62,
      16 + random() * 10,
      (random() - 0.5) * size * 0.62,
    ));
    birds.userData.phases.push(random() * Math.PI * 2);
    birds.userData.speeds.push(0.45 + random() * 0.6);
  }
  wildlife.add(birds);

  const animals = [];
  const fur = makeMaterial(THREE, 0x745b3d, 0.96, 0.01);
  const darkFur = makeMaterial(THREE, 0x443829, 0.98, 0);
  const makeNearAnimal = () => {
    const animal = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.72, 3, 7), fur);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.7;
    const neck = makeCylinder(THREE, 0.14, 0.2, 0.62, 7, fur);
    neck.position.set(0.42, 1.02, 0);
    neck.rotation.z = -0.38;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.48, 7), fur);
    head.rotation.z = -Math.PI / 2;
    head.position.set(0.66, 1.27, 0);
    animal.add(body, neck, head);
    for (const x of [-0.3, 0.32]) {
      for (const z of [-0.15, 0.15]) {
        const leg = makeCylinder(THREE, 0.035, 0.055, 0.62, 5, darkFur);
        leg.position.set(x, 0.32, z);
        animal.add(leg);
      }
    }
    return shadowize(animal, true, false);
  };
  const farGeometry = new THREE.ConeGeometry(0.38, 1.3, 5);
  for (let index = 0; index < 4; index += 1) {
    const angle = index / 4 * Math.PI * 2 + 0.4;
    const radius = size * (0.27 + random() * 0.11);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const lod = new THREE.LOD();
    lod.addLevel(makeNearAnimal(), 0);
    const far = new THREE.Mesh(farGeometry, darkFur);
    far.position.y = 0.6;
    far.scale.set(0.65, 1, 0.42);
    lod.addLevel(far, 28);
    lod.position.set(x, heightAt(x, z), z);
    lod.rotation.y = random() * Math.PI * 2;
    lod.userData.phase = random() * Math.PI * 2;
    lod.userData.origin = lod.position.clone();
    wildlife.add(lod);
    animals.push(lod);
  }

  const dummy = new THREE.Object3D();
  let accumulator = 0;
  const update = (delta, elapsed) => {
    accumulator += delta;
    if (accumulator >= 0.05) {
      accumulator = 0;
      for (let index = 0; index < birdCount; index += 1) {
        const origin = birds.userData.origins[index];
        const phase = birds.userData.phases[index];
        const speed = birds.userData.speeds[index];
        const angle = elapsed * speed * 0.12 + phase;
        const radius = 8 + (index % 5) * 1.6;
        dummy.position.set(
          origin.x + Math.cos(angle) * radius,
          origin.y + Math.sin(elapsed * 1.4 + phase) * 1.2,
          origin.z + Math.sin(angle) * radius,
        );
        dummy.rotation.set(0, -angle + Math.PI * 0.5, Math.sin(elapsed * 5.5 + phase) * 0.13);
        const wingPulse = 0.78 + Math.abs(Math.sin(elapsed * 6.7 + phase)) * 0.36;
        const birdScale = 0.24 + index % 3 * 0.035;
        dummy.scale.set(birdScale, birdScale * wingPulse, birdScale);
        dummy.updateMatrix();
        birds.setMatrixAt(index, dummy.matrix);
      }
      birds.instanceMatrix.needsUpdate = true;
    }
    animals.forEach((animal, index) => {
      const phase = animal.userData.phase;
      animal.rotation.y += Math.sin(elapsed * 0.18 + phase) * delta * 0.045;
      animal.position.x = animal.userData.origin.x + Math.sin(elapsed * 0.08 + phase) * (1.2 + index * 0.2);
      animal.position.z = animal.userData.origin.z + Math.cos(elapsed * 0.075 + phase) * (1.1 + index * 0.16);
      animal.position.y = heightAt(animal.position.x, animal.position.z);
    });
  };
  return { root: wildlife, birds, animals, update };
}

export function createWorld(THREE, scene, renderer, options = {}) {
  if (!THREE || !scene) throw new Error('createWorld requiere THREE y una Scene validos.');
  const size = options.size ?? 140;
  const segments = options.segments ?? 96;
  const seed = options.seed ?? 18002100;
  const waterLevel = options.waterLevel ?? -1.12;
  let era = nearestEra(Number(options.era ?? 1800));
  let elapsed = 0;
  const random = mulberry32(seed);
  const viewCamera = options.camera ?? null;
  const atlasParentRotation = new THREE.Quaternion();
  const atlasTiltRotation = new THREE.Quaternion();
  const atlasTiltAxis = new THREE.Vector3(0, 0, 1);
  const atlasCameraRight = new THREE.Vector3();
  const atlasCameraForward = new THREE.Vector3();
  const atlasFacing = new THREE.Vector3();
  const root = new THREE.Group();
  root.name = 'mundo-cronicas-del-horizonte';
  scene.add(root);
  configureRenderer(THREE, renderer);

  const heightAt = (x, z) => {
    const broad = fbm(x * 0.014, z * 0.014, seed) * 8.1 - 3.1;
    const detail = (fbm(x * 0.052 + 12, z * 0.052 - 7, seed + 37) - 0.48) * 1.65;
    const ridgeNoise = fbm(x * 0.118 - 8, z * 0.118 + 13, seed + 167);
    const ridges = (0.5 - Math.abs(ridgeNoise - 0.5)) * 2;
    const erosion = Math.sin(x * 0.19 + smoothNoise(z * 0.08, x * 0.035, seed + 289) * 5.2) * 0.18;
    const islandFalloff = clamp((Math.hypot(x, z) - size * 0.34) / (size * 0.24), 0, 1);
    const mainRoadDistance = Math.abs(x + z * 0.18);
    const crossRoadDistance = Math.abs(z - 7) + Math.max(0, Math.abs(x) - 35) * 0.8;
    const roadDistance = Math.min(mainRoadDistance, crossRoadDistance);
    const roadInfluence = 1 - clamp((roadDistance - 2.2) / 5.8, 0, 1);
    const rugged = broad + detail + (ridges - 0.56) * 0.54 + erosion;
    return rugged * lerp(1, 0.7, roadInfluence) - islandFalloff * islandFalloff * 6.5;
  };

  const terrain = createTerrain(THREE, size, segments, seed, heightAt, waterLevel);
  root.add(terrain);
  // Cada siglo usa su propio albedo cenital. El relieve, vertex colors y
  // macrovariacion procedural siguen activos debajo de la textura pintada.
  const terrainEraMaps = new Map();
  const terrainLoader = new THREE.TextureLoader();
  ERA_YEARS.forEach((terrainEra) => {
    terrainLoader.load(assetUrl(`terrain-${terrainEra}-v1.png`), (albedo) => {
      albedo.wrapS = THREE.MirroredRepeatWrapping;
      albedo.wrapT = THREE.MirroredRepeatWrapping;
      albedo.repeat.set(3.4, 3.4);
      albedo.colorSpace = THREE.SRGBColorSpace;
      albedo.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
      terrainEraMaps.set(terrainEra, albedo);
      if (terrainEra === era) setEra(era);
    });
  });
  // El plano se extiende mucho mas alla del terreno para que una camara RTS
  // inclinada nunca revele sus esquinas en el horizonte.
  const water = createWater(THREE, size * 5, waterLevel);
  root.add(water);
  const unitAtlasTexture = new THREE.TextureLoader().load(assetUrl('unit-silhouette-atlas-v1.png'));
  unitAtlasTexture.colorSpace = THREE.SRGBColorSpace;
  unitAtlasTexture.generateMipmaps = false;
  unitAtlasTexture.minFilter = THREE.LinearFilter;
  unitAtlasTexture.magFilter = THREE.LinearFilter;
  unitAtlasTexture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
  const directionalUnitAtlasTexture = new THREE.TextureLoader().load(assetUrl('unit-directional-atlas-v1.png'));
  directionalUnitAtlasTexture.colorSpace = THREE.SRGBColorSpace;
  directionalUnitAtlasTexture.generateMipmaps = false;
  directionalUnitAtlasTexture.minFilter = THREE.LinearFilter;
  directionalUnitAtlasTexture.magFilter = THREE.LinearFilter;
  directionalUnitAtlasTexture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
  const buildingAtlasTexture = new THREE.TextureLoader().load(assetUrl('building-silhouette-atlas-v1.png'));
  buildingAtlasTexture.colorSpace = THREE.SRGBColorSpace;
  buildingAtlasTexture.generateMipmaps = false;
  buildingAtlasTexture.minFilter = THREE.LinearFilter;
  buildingAtlasTexture.magFilter = THREE.LinearFilter;
  buildingAtlasTexture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
  const environmentPropsTexture = new THREE.TextureLoader().load(assetUrl('environment-props-atlas-v1.png'));
  environmentPropsTexture.colorSpace = THREE.SRGBColorSpace;
  environmentPropsTexture.generateMipmaps = false;
  environmentPropsTexture.minFilter = THREE.LinearFilter;
  environmentPropsTexture.magFilter = THREE.LinearFilter;
  environmentPropsTexture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);

  const roadMaterial = applyMacroSurfaceShader(makeMaterial(THREE, 0x5a4a39, 1, 0, {
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  }), seed + 73);
  const shoulderMaterial = applyMacroSurfaceShader(makeMaterial(THREE, 0x756247, 1, 0, {
    transparent: true,
    opacity: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  }), seed + 109);
  const roads = new THREE.Group();
  roads.name = 'red-vial-con-huellas';
  root.add(roads);
  const roadPoints = [];
  for (let i = 0; i <= 18; i += 1) {
    const z = -size * 0.43 + (i / 18) * size * 0.86;
    const x = -z * 0.18 + Math.sin(i * 0.72) * 1.2;
    roadPoints.push(new THREE.Vector3(x, heightAt(x, z) + 0.16, z));
  }
  const mainShoulder = createRoad(THREE, offsetRoadPoints(THREE, roadPoints, 0, -0.018), shoulderMaterial, 6.15);
  mainShoulder.name = 'banquina-principal';
  roads.add(mainShoulder);
  const mainRoad = createRoad(THREE, roadPoints, roadMaterial, 4.2);
  mainRoad.name = 'camino-principal';
  roads.add(mainRoad);
  addRoadDetails(THREE, roads, roadPoints, 4.2, seed + 17);
  const crossPoints = [];
  for (let i = 0; i <= 12; i += 1) {
    const x = -32 + i * (64 / 12);
    const z = 7 + Math.sin(i * 0.55) * 1.2;
    crossPoints.push(new THREE.Vector3(x, heightAt(x, z) + 0.16, z));
  }
  const crossShoulderMaterial = shoulderMaterial.clone();
  roads.add(createRoad(THREE, offsetRoadPoints(THREE, crossPoints, 0, -0.018), crossShoulderMaterial, 4.65));
  roads.add(createRoad(THREE, crossPoints, roadMaterial, 3.2));
  addRoadDetails(THREE, roads, crossPoints, 3.2, seed + 91);

  const basePathGroups = new Map();
  const baseGroundGroups = new Map();
  ERA_YEARS.forEach((pathEra) => {
    const spacing = pathEra >= 2100 ? 1.48 : pathEra >= 2000 ? 1.24 : 1;
    const pathGroup = new THREE.Group();
    pathGroup.name = `senderos-base-${pathEra}`;
    [[-55, 34, 1], [55, -34, -1]].forEach(([baseX, baseZ, facing], baseIndex) => {
      const destinations = [
        [baseX + 10 * spacing * facing, baseZ - 7 * spacing * facing],
        [baseX + 10 * spacing * facing, baseZ + 7 * spacing * facing],
        [baseX - 7 * spacing * facing, baseZ - 7 * spacing * facing],
        [baseX - 8 * spacing * facing, baseZ + 4 * spacing * facing],
      ];
      destinations.forEach(([targetX, targetZ], branchIndex) => {
        const bend = (branchIndex % 2 ? 1 : -1) * (0.75 + spacing * 0.22);
        const midX = (baseX + targetX) * 0.5 + bend;
        const midZ = (baseZ + targetZ) * 0.5 - bend * facing;
        const points = [[baseX, baseZ], [midX, midZ], [targetX, targetZ]].map(([x, z]) => (
          new THREE.Vector3(x, heightAt(x, z) + 0.175 + branchIndex * 0.001, z)
        ));
        const shoulder = createRoad(THREE, offsetRoadPoints(THREE, points, 0, -0.012), shoulderMaterial, 3.4);
        const path = createRoad(THREE, points, roadMaterial, 2.4);
        shoulder.name = `sendero-banquina-${baseIndex}-${branchIndex}`;
        path.name = `sendero-activo-${baseIndex}-${branchIndex}`;
        pathGroup.add(shoulder, path);
        if (pathEra >= 2100) {
          const conduitMaterial = new THREE.MeshBasicMaterial({
            color: baseIndex === 0 ? 0x45d9ff : 0xff765f,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            polygonOffset: true,
            polygonOffsetFactor: -7,
          });
          [-0.72, 0.72].forEach((offset, railIndex) => {
            const conduit = createRoad(
              THREE,
              offsetRoadPoints(THREE, points, offset, 0.035 + railIndex * 0.002),
              conduitMaterial.clone(),
              0.11,
            );
            conduit.name = `conducto-luminoso-${baseIndex}-${branchIndex}-${railIndex}`;
            conduit.userData.groundDecal = true;
            pathGroup.add(conduit);
          });
          const insetMaterial = new THREE.MeshBasicMaterial({
            color: baseIndex === 0 ? 0x92efff : 0xffa08e,
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            polygonOffset: true,
            polygonOffsetFactor: -8,
          });
          for (let markerIndex = 1; markerIndex <= 4; markerIndex += 1) {
            const progress = markerIndex / 5;
            const segment = progress < 0.5 ? 0 : 1;
            const localProgress = segment === 0 ? progress * 2 : (progress - 0.5) * 2;
            const markerPosition = points[segment].clone().lerp(points[segment + 1], localProgress);
            const direction = points[segment + 1].clone().sub(points[segment]);
            const inset = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.64), insetMaterial.clone());
            inset.position.copy(markerPosition);
            inset.position.y += 0.045;
            inset.rotation.set(-Math.PI / 2, 0, -Math.atan2(direction.z, direction.x));
            inset.userData.groundDecal = true;
            inset.name = `baliza-logistica-${baseIndex}-${branchIndex}-${markerIndex}`;
            pathGroup.add(inset);
          }
        } else {
          const trafficMaterial = new THREE.MeshBasicMaterial({
            color: pathEra <= 1800 ? 0x2c2017 : pathEra <= 1900 ? 0x242322 : 0x293233,
            transparent: true,
            opacity: pathEra <= 1900 ? 0.48 : 0.34,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -7,
          });
          [-0.46, 0.46].forEach((offset, rutIndex) => {
            const rut = createRoad(
              THREE,
              offsetRoadPoints(THREE, points, offset, 0.03 + rutIndex * 0.002),
              trafficMaterial.clone(),
              pathEra <= 1900 ? 0.13 : 0.09,
            );
            rut.name = `huella-logistica-${baseIndex}-${branchIndex}-${rutIndex}`;
            rut.userData.groundDecal = true;
            pathGroup.add(rut);
          });
        }
      });
    });
    pathGroup.visible = pathEra === era;
    roads.add(pathGroup);
    basePathGroups.set(pathEra, pathGroup);

    const groundGroup = new THREE.Group();
    groundGroup.name = `suelo-habitado-${pathEra}`;
    const groundProfile = {
      1800: { color: 0x4d3b2d, opacity: 0.55 },
      1900: { color: 0x363a39, opacity: 0.52 },
      2000: { color: 0x4c5656, opacity: 0.48 },
      2100: { color: 0x59667e, opacity: 0.34 },
    }[pathEra];
    const occupiedGround = new THREE.InstancedMesh(
      createIrregularDiscGeometry(THREE, 26, seed + pathEra * 3),
      applyMacroSurfaceShader(new THREE.MeshStandardMaterial({
        color: groundProfile.color,
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: groundProfile.opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -5,
      }), seed + pathEra),
      10,
    );
    const groundDummy = new THREE.Object3D();
    let groundIndex = 0;
    [[-55, 34, 1], [55, -34, -1]].forEach(([baseX, baseZ, facing], baseIndex) => {
      const occupied = [
        [baseX, baseZ, 6.4, 4.8],
        [baseX + 10 * spacing * facing, baseZ - 7 * spacing * facing, 4.9, 3.7],
        [baseX + 10 * spacing * facing, baseZ + 7 * spacing * facing, 5.1, 3.9],
        [baseX - 7 * spacing * facing, baseZ - 7 * spacing * facing, 4.2, 3.3],
        [baseX - 8 * spacing * facing, baseZ + 4 * spacing * facing, 4.2, 3.3],
      ];
      occupied.forEach(([x, z, radiusX, radiusZ], localIndex) => {
        groundDummy.position.set(x, heightAt(x, z) + 0.105 + localIndex * 0.001, z);
        groundDummy.rotation.set(-Math.PI / 2, 0, (baseIndex * 5 + localIndex) * 0.37);
        groundDummy.scale.set(radiusX, radiusZ, 1);
        groundDummy.updateMatrix();
        occupiedGround.setMatrixAt(groundIndex++, groundDummy.matrix);
      });
    });
    occupiedGround.instanceMatrix.needsUpdate = true;
    occupiedGround.userData.groundDecal = true;
    occupiedGround.name = `huellas-asentamiento-${pathEra}`;
    groundGroup.add(occupiedGround);
    if (pathEra <= 1900) {
      const soilMaterial = new THREE.MeshStandardMaterial({
        color: pathEra <= 1800 ? 0x5e4828 : 0x514536,
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -6,
      });
      const cropMaterial = new THREE.MeshStandardMaterial({
        color: pathEra <= 1800 ? 0x6f873d : 0x70723a,
        roughness: 0.96,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      [[-55, 34, 1], [55, -34, -1]].forEach(([baseX, baseZ, facing], baseIndex) => {
        [
          [baseX - 11 * facing, baseZ + 13 * facing, 0.16 * facing],
          [baseX + 2 * facing, baseZ + 16 * facing, -0.12 * facing],
        ].forEach(([x, z, rotation], plotIndex) => {
          const plot = new THREE.Group();
          plot.name = `parcela-productiva-${pathEra}-${baseIndex}-${plotIndex}`;
          plot.position.set(x, heightAt(x, z) + 0.12, z);
          plot.rotation.y = rotation;
          const soil = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 5.4), soilMaterial.clone());
          soil.rotation.x = -Math.PI / 2;
          soil.userData.groundDecal = true;
          plot.add(soil);
          for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
            const cropRow = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 0.18), cropMaterial.clone());
            cropRow.rotation.x = -Math.PI / 2;
            cropRow.position.set(0, 0.035 + rowIndex * 0.001, -2.1 + rowIndex * 0.6);
            cropRow.userData.groundDecal = true;
            plot.add(cropRow);
          }
          groundGroup.add(plot);
        });
      });
    }
    if (pathEra >= 2100) {
      const padMaterial = new THREE.MeshStandardMaterial({
        color: 0x46505d,
        roughness: 0.72,
        metalness: 0.34,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -8,
      });
      const padRings = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 6), padMaterial, 10);
      groundDummy.matrix.identity();
      groundIndex = 0;
      [[-55, 34, 1], [55, -34, -1]].forEach(([baseX, baseZ, facing]) => {
        const occupied = [
          [baseX, baseZ, 5.65, 4.15],
          [baseX + 10 * spacing * facing, baseZ - 7 * spacing * facing, 4.1, 3.0],
          [baseX + 10 * spacing * facing, baseZ + 7 * spacing * facing, 4.3, 3.2],
          [baseX - 7 * spacing * facing, baseZ - 7 * spacing * facing, 3.55, 2.65],
          [baseX - 8 * spacing * facing, baseZ + 4 * spacing * facing, 3.55, 2.65],
        ];
        occupied.forEach(([x, z, radiusX, radiusZ], localIndex) => {
          groundDummy.position.set(x, heightAt(x, z) + 0.145 + localIndex * 0.001, z);
          groundDummy.rotation.set(-Math.PI / 2, 0, localIndex * 0.29);
          groundDummy.scale.set(radiusX, radiusZ, 1);
          groundDummy.updateMatrix();
          padRings.setMatrixAt(groundIndex++, groundDummy.matrix);
        });
      });
      padRings.instanceMatrix.needsUpdate = true;
      padRings.userData.groundDecal = true;
      padRings.name = 'perimetros-plataforma-orbital';
      groundGroup.add(padRings);
      const signalRings = new THREE.InstancedMesh(
        new THREE.RingGeometry(0.955, 1, 6),
        new THREE.MeshBasicMaterial({
          color: 0x7eeaff,
          transparent: true,
          opacity: 0.58,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          polygonOffset: true,
          polygonOffsetFactor: -9,
        }),
        10,
      );
      const signalMatrix = new THREE.Matrix4();
      for (let index = 0; index < 10; index += 1) {
        padRings.getMatrixAt(index, signalMatrix);
        signalRings.setMatrixAt(index, signalMatrix);
      }
      signalRings.instanceMatrix.needsUpdate = true;
      signalRings.userData.groundDecal = true;
      signalRings.name = 'señal-plataforma-orbital';
      groundGroup.add(signalRings);
    }
    groundGroup.visible = pathEra === era;
    roads.add(groundGroup);
    baseGroundGroups.set(pathEra, groundGroup);
  });

  const nature = new THREE.Group();
  nature.name = 'naturaleza-instanciada';
  root.add(nature);
  const vegetation = createVegetation(THREE, nature, heightAt, seed, size);
  vegetation.rocks.visible = false;
  const coastline = createCoastlineDetails(THREE, nature, heightAt, seed, size, waterLevel);
  const historicalRuins = createRuins(THREE, root, heightAt, random);
  const groundLife = createGroundLife(THREE, root, heightAt, seed, size);
  groundLife.grass.userData.fullCount = groundLife.grass.count;
  groundLife.flowers.userData.fullCount = groundLife.flowers.count;
  const biomeProps = createBiomePropClusters(THREE, root, heightAt, seed, size, environmentPropsTexture, era);
  const eraInfrastructure = createEraInfrastructure(THREE, root, heightAt, seed, size, era);

  const atmosphere = createAtmosphere(THREE, scene, size);
  const clouds = createClouds(THREE, root, seed, size);
  const wildlife = createAmbientWildlife(THREE, root, heightAt, seed, size);
  const entities = new Set();
  const effects = new Set();
  const maxEffects = options.maxEffects ?? 128;
  const feedbackEffects = new Set();
  const recentFeedbackEvents = new Map();
  const feedbackOptionObjects = new WeakSet();
  const maxFeedbackEffects = options.maxFeedbackEffects ?? 72;
  const movementTrails = new THREE.Group();
  movementTrails.name = 'huellas-de-unidades';
  root.add(movementTrails);
  const trailMarks = [];

  function disposeFeedbackObject(object) {
    if (!object) return;
    feedbackEffects.delete(object);
    object.removeFromParent();
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else if (child.material) child.material.dispose();
    });
  }

  function registerFeedback(object, parent = root) {
    parent.add(object);
    feedbackEffects.add(object);
    while (feedbackEffects.size > maxFeedbackEffects) {
      const candidates = [...feedbackEffects].filter((item) => item !== object);
      const disposable = candidates.find((item) => !item.userData.persistentFeedback) ?? candidates[0];
      if (!disposable) break;
      disposeFeedbackObject(disposable);
    }
    return object;
  }

  function acceptFeedbackEvent(kind, entity, feedbackOptions) {
    if (!entity || !feedbackOptions || typeof feedbackOptions !== 'object') return Boolean(entity);
    if (feedbackOptionObjects.has(feedbackOptions)) return false;
    feedbackOptionObjects.add(feedbackOptions);
    const suppliedId = feedbackOptions.eventId ?? feedbackOptions.eventKey ?? feedbackOptions.id;
    if (suppliedId == null) return true;
    const key = `${kind}:${entity.uuid}:${suppliedId}`;
    if (recentFeedbackEvents.has(key)) return false;
    recentFeedbackEvents.set(key, elapsed + 30);
    while (recentFeedbackEvents.size > 256) {
      recentFeedbackEvents.delete(recentFeedbackEvents.keys().next().value);
    }
    return true;
  }

  function findEntityPart(entity, marker) {
    let found = null;
    entity.traverse((part) => {
      if (!found && part.userData[marker]) found = part;
    });
    return found;
  }

  function feedbackWeaponClass(entity, requested) {
    if (requested) return requested;
    const rig = findEntityPart(entity, 'weaponRig');
    if (rig?.userData.weaponClass) return rig.userData.weaponClass;
    if (entity.userData.kind === 'artilleria') return 'artillery';
    if (entity.userData.kind === 'tanque' || entity.userData.kind === 'vehiculo') return 'cannon';
    if (entity.userData.kind === 'dron' || entity.userData.kind === 'aeronave') return 'energy';
    return 'rifle';
  }

  function feedbackPalette(weaponClass) {
    if (weaponClass === 'energy' || weaponClass === 'plasma' || weaponClass === 'laser') {
      return { flash: 0x92efff, core: 0xffffff, smoke: 0x738fa5 };
    }
    if (weaponClass === 'artillery' || weaponClass === 'cannon' || weaponClass === 'shell') {
      return { flash: 0xffa743, core: 0xfff0bd, smoke: 0x554d43 };
    }
    return { flash: 0xffc35a, core: 0xffffff, smoke: 0x6b6257 };
  }

  function createMuzzleFeedback(entity, feedbackOptions) {
    const weaponClass = feedbackWeaponClass(entity, feedbackOptions.weaponClass);
    const palette = feedbackPalette(weaponClass);
    const power = clamp(feedbackOptions.power ?? 1, 0.2, 3.5);
    const rig = findEntityPart(entity, 'weaponRig') ?? entity;
    const muzzle = findEntityPart(rig, 'muzzleAnchor') ?? rig;
    const flash = new THREE.Group();
    flash.name = `fogonazo-${weaponClass}`;
    flash.userData.feedbackKind = 'muzzle';
    flash.userData.age = 0;
    flash.userData.life = weaponClass === 'rifle' ? 0.12 : 0.19;
    flash.userData.power = power;
    flash.userData.feedbackEntity = entity;
    const burst = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sharedMuzzleTexture(THREE),
      color: palette.flash,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    burst.scale.setScalar(0.34 + power * (weaponClass === 'rifle' ? 0.2 : 0.34));
    burst.userData.feedbackLayer = 'muzzle-burst';
    const light = new THREE.PointLight(palette.flash, 2.2 + power * 2.4, 3.8 + power * 3.2, 2);
    light.userData.feedbackLayer = 'muzzle-light';
    flash.add(burst, light);
    registerFeedback(flash, muzzle);

    muzzle.updateWorldMatrix(true, false);
    const worldPosition = muzzle.getWorldPosition(new THREE.Vector3());
    const target = vectorFrom(THREE, feedbackOptions.targetPosition, [
      worldPosition.x + Math.sin(entity.rotation.y) * 8,
      worldPosition.y,
      worldPosition.z + Math.cos(entity.rotation.y) * 8,
    ]);
    const direction = target.sub(worldPosition).normalize();
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sharedSmokeTexture(THREE),
      color: palette.smoke,
      transparent: true,
      opacity: weaponClass === 'energy' ? 0.2 : 0.42,
      depthWrite: false,
    }));
    smoke.name = 'humo-de-boca';
    smoke.position.copy(worldPosition).addScaledVector(direction, 0.18 + power * 0.12);
    smoke.scale.setScalar(0.28 + power * 0.18);
    smoke.userData.feedbackKind = 'muzzle-smoke';
    smoke.userData.age = 0;
    smoke.userData.life = 0.72 + power * 0.16;
    smoke.userData.power = power;
    smoke.userData.velocity = direction.multiplyScalar(0.5 + power * 0.18).add(new THREE.Vector3(0, 0.38, 0));
    registerFeedback(smoke);
  }

  function playAttackFeedback(entity, feedbackOptions = {}) {
    if (!acceptFeedbackEvent('attack', entity, feedbackOptions)) return false;
    const weaponClass = feedbackWeaponClass(entity, feedbackOptions.weaponClass);
    entity.userData.attackFeedback = {
      age: 0,
      life: weaponClass === 'rifle' ? 0.2 : 0.38,
      power: clamp(feedbackOptions.power ?? 1, 0.2, 3.5),
      weaponClass,
    };
    createMuzzleFeedback(entity, { ...feedbackOptions, weaponClass });
    return true;
  }

  function createHitFlash(entity, feedbackOptions, localIncoming) {
    const materialKind = normalizeImpactMaterial(feedbackOptions.material ?? entity.userData.impactMaterial ?? 'metal');
    const palette = IMPACT_PALETTES[materialKind] ?? IMPACT_PALETTES.metal;
    const strength = clamp(feedbackOptions.damageRatio ?? 0.2, 0.04, 1);
    const radius = entity.userData.entityType === 'building' ? 2.1 : (
      entity.userData.kind === 'tanque' || entity.userData.kind === 'artilleria' || entity.userData.kind === 'vehiculo' ? 1.25 : 0.48
    );
    const y = entity.userData.entityType === 'building' ? 2.65 : (entity.userData.unitRole ? 1.35 : 1.05);
    const flash = new THREE.Group();
    flash.name = 'reaccion-impacto-direccional';
    flash.position.set(-localIncoming.x * radius, y, -localIncoming.z * radius);
    flash.userData.feedbackKind = 'hit-flash';
    flash.userData.age = 0;
    flash.userData.life = 0.24 + strength * 0.18;
    flash.userData.feedbackEntity = entity;
    const flareMaterial = new THREE.SpriteMaterial({
      map: sharedMuzzleTexture(THREE),
      color: palette.flash,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const flare = new THREE.Sprite(flareMaterial);
    flare.scale.setScalar(0.22 + strength * 0.52);
    flare.userData.feedbackLayer = 'hit-flare';
    const light = new THREE.PointLight(palette.flash, 1.1 + strength * 2.4, 2.4 + strength * 2.4, 2);
    light.userData.feedbackLayer = 'hit-light';
    flash.add(flare, light);
    registerFeedback(flash, entity);
  }

  function addDamageSmoke(entity, damageRoot, severe = false) {
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sharedSmokeTexture(THREE),
      color: severe ? 0x363534 : 0x5a5b57,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }));
    const building = entity.userData.entityType === 'building';
    const vehicle = ['tanque', 'artilleria', 'vehiculo'].includes(entity.userData.kind);
    smoke.position.set(severe ? 0.45 : -0.35, building ? 4.1 : (vehicle ? 1.6 : 1.72), severe ? -0.22 : 0.18);
    smoke.scale.setScalar(building ? (severe ? 2.1 : 1.45) : (severe ? 0.85 : 0.58));
    smoke.userData.damageSmoke = true;
    smoke.userData.baseY = smoke.position.y;
    smoke.userData.phase = hash2(entity.id, severe ? 7 : 3, seed) * Math.PI * 2;
    smoke.userData.baseScale = smoke.scale.x;
    damageRoot.add(smoke);
  }

  function ensurePersistentDamage(entity, healthRatio) {
    if (!entity || healthRatio >= 0.66) return;
    let damageRoot = entity.userData.damageFeedbackRoot;
    if (!damageRoot) {
      damageRoot = new THREE.Group();
      damageRoot.name = 'dano-persistente';
      damageRoot.userData.damageStage = 0;
      entity.userData.damageFeedbackRoot = damageRoot;
      entity.add(damageRoot);
    }
    const requestedStage = healthRatio <= 0.32 ? 2 : 1;
    if (damageRoot.userData.damageStage < 1 && requestedStage >= 1) {
      addDamageSmoke(entity, damageRoot, false);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(entity.userData.entityType === 'building' ? 1.15 : 0.48, 0.045, entity.userData.entityType === 'building' ? 0.7 : 0.34),
        makeMaterial(THREE, 0x201e1b, 0.96, 0.12),
      );
      plate.position.set(-0.38, entity.userData.entityType === 'building' ? 1.8 : 0.94, 0.5);
      plate.rotation.set(-0.35, 0.18, -0.22);
      plate.userData.damagedPlate = true;
      damageRoot.add(plate);
      damageRoot.userData.damageStage = 1;
    }
    if (damageRoot.userData.damageStage < 2 && requestedStage >= 2) {
      addDamageSmoke(entity, damageRoot, true);
      const fireMaterial = new THREE.MeshBasicMaterial({
        color: 0xff7c28,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.72, 7), fireMaterial);
      fire.position.set(0.32, entity.userData.entityType === 'building' ? 2.5 : 1.18, 0.2);
      fire.userData.damageFire = true;
      fire.userData.baseY = fire.position.y;
      fire.userData.baseScale = 1;
      fire.userData.phase = hash2(entity.id, 19, seed) * Math.PI * 2;
      const glow = new THREE.PointLight(0xff7426, 1.8, entity.userData.entityType === 'building' ? 6 : 3.2, 2);
      glow.position.copy(fire.position);
      glow.userData.damageLight = true;
      damageRoot.add(fire, glow);
      damageRoot.userData.damageStage = 2;
    }
  }

  function createDestructionResidue(entity, feedbackOptions, incoming) {
    if (entity.userData.destructionFeedbackPlayed) return null;
    entity.userData.destructionFeedbackPlayed = true;
    entity.updateWorldMatrix(true, false);
    const position = entity.getWorldPosition(new THREE.Vector3());
    const building = entity.userData.entityType === 'building';
    const scale = building ? 1.8 : (entity.userData.unitRole ? 0.62 : 1.1);
    const materialKind = normalizeImpactMaterial(feedbackOptions.material ?? entity.userData.impactMaterial ?? 'metal');
    const palette = IMPACT_PALETTES[materialKind] ?? IMPACT_PALETTES.metal;
    const residue = new THREE.Group();
    residue.name = 'residuo-destruccion-persistente';
    residue.position.copy(position);
    residue.userData.feedbackKind = 'destruction';
    residue.userData.age = 0;
    residue.userData.life = building ? 32 : 24;
    residue.userData.persistentFeedback = true;
    residue.userData.scaleClass = scale;
    residue.userData.groundY = heightAt(position.x, position.z) - position.y + 0.06;

    const scorch = new THREE.Mesh(
      createIrregularDiscGeometry(THREE, 28, entity.id + 177),
      new THREE.MeshBasicMaterial({
        color: 0x151514,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -7,
      }),
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = residue.userData.groundY;
    scorch.scale.setScalar(scale * 1.65);
    scorch.userData.feedbackLayer = 'wreck-scorch';
    residue.add(scorch);

    const atlasSilhouette = entity.userData.atlasSilhouette;
    if (!building && entity.userData.unitRole && atlasSilhouette?.geometry && atlasSilhouette?.material) {
      const casualty = new THREE.Mesh(atlasSilhouette.geometry.clone(), atlasSilhouette.material.clone());
      casualty.name = 'silueta-caida-persistente';
      casualty.position.y = residue.userData.groundY + 0.018;
      casualty.rotation.set(-Math.PI / 2, 0, entity.rotation.y + Math.PI * 0.5);
      casualty.scale.setScalar(0.84);
      casualty.renderOrder = 1;
      casualty.userData.feedbackLayer = 'wreck-corpse';
      casualty.userData.groundDecal = true;
      if (casualty.material.uniforms?.uBrightness) casualty.material.uniforms.uBrightness.value *= 0.52;
      if (casualty.material.uniforms?.uBaseWash) casualty.material.uniforms.uBaseWash.value *= 0.35;
      residue.add(casualty);
    }

    const shardMaterial = makeMaterial(THREE, palette.debris, 0.78, materialKind === 'metal' ? 0.72 : 0.08, {
      transparent: true,
      opacity: 1,
    });
    const shardCount = building ? 12 : 7;
    for (let index = 0; index < shardCount; index += 1) {
      const length = scale * (0.24 + hash2(index, entity.id, seed) * 0.48);
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(length, length * 0.38, length * (0.55 + hash2(index, 9, seed))),
        shardMaterial,
      );
      shard.position.set(0, scale * (0.45 + hash2(index, 13, seed) * 0.7), 0);
      const angle = (index / shardCount) * Math.PI * 2 + hash2(index, 41, seed) * 0.5;
      shard.userData.feedbackLayer = 'wreck-shard';
      shard.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * scale * (1.8 + hash2(index, 43, seed) * 2.5) + incoming.x * scale * 1.2,
        scale * (2.6 + hash2(index, 47, seed) * 4.2),
        Math.sin(angle) * scale * (1.8 + hash2(index, 53, seed) * 2.5) + incoming.z * scale * 1.2,
      );
      shard.userData.spin = new THREE.Vector3(4 + index * 0.7, 5 - index * 0.16, 3 + index * 0.5);
      residue.add(shard);
    }
    for (let index = 0; index < (building ? 4 : 3); index += 1) {
      const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sharedSmokeTexture(THREE),
        color: index === 0 ? 0x292827 : 0x484541,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      }));
      smoke.position.set((index - 1.5) * scale * 0.22, scale * (0.5 + index * 0.28), (index % 2 ? -1 : 1) * scale * 0.16);
      smoke.scale.setScalar(scale * (0.72 + index * 0.18));
      smoke.userData.feedbackLayer = 'wreck-smoke';
      smoke.userData.phase = hash2(index, entity.id, seed) * Math.PI * 2;
      smoke.userData.baseScale = smoke.scale.x;
      residue.add(smoke);
    }
    const ember = new THREE.Mesh(
      new THREE.IcosahedronGeometry(scale * 0.22, 1),
      new THREE.MeshBasicMaterial({
        color: 0xff6a25,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ember.position.y = scale * 0.36;
    ember.userData.feedbackLayer = 'wreck-fire';
    const light = new THREE.PointLight(0xff6c2a, 3.2 * scale, 5 * scale, 2);
    light.position.y = scale * 0.55;
    light.userData.feedbackLayer = 'wreck-light';
    residue.add(ember, light);
    return registerFeedback(residue);
  }

  function playHitFeedback(entity, feedbackOptions = {}) {
    if (!acceptFeedbackEvent('hit', entity, feedbackOptions)) return false;
    const incoming = vectorFrom(THREE, feedbackOptions.incoming, [0, 0, 1]);
    if (incoming.lengthSq() < 0.0001) incoming.set(0, 0, 1);
    incoming.normalize();
    entity.updateWorldMatrix(true, false);
    const worldQuaternion = entity.getWorldQuaternion(new THREE.Quaternion());
    const localIncoming = incoming.clone().applyQuaternion(worldQuaternion.invert()).normalize();
    const damageRatio = clamp(feedbackOptions.damageRatio ?? 0.15, 0.02, 1);
    const healthRatio = clamp(
      feedbackOptions.healthRatio ?? ((entity.userData.health ?? 1) / Math.max(1, entity.userData.maxHealth ?? 1)),
      0,
      1,
    );
    entity.userData.hitFeedback = {
      age: 0,
      life: 0.28 + damageRatio * 0.24,
      strength: clamp(0.18 + damageRatio * 1.1, 0.18, 1.25),
      incoming: localIncoming,
    };
    createHitFlash(entity, feedbackOptions, localIncoming);
    ensurePersistentDamage(entity, healthRatio);
    if (feedbackOptions.lethal || healthRatio <= 0) {
      createDestructionResidue(entity, feedbackOptions, incoming);
    }
    return true;
  }

  function clearEntityFeedbackOffsets(entity) {
    entity.traverse((part) => {
      const appliedPosition = part.userData.appliedFeedbackPosition;
      if (appliedPosition) {
        part.position.sub(appliedPosition);
        appliedPosition.set(0, 0, 0);
      }
      const appliedRotation = part.userData.appliedFeedbackRotation;
      if (appliedRotation) {
        part.rotation.x -= appliedRotation.x;
        part.rotation.y -= appliedRotation.y;
        part.rotation.z -= appliedRotation.z;
        appliedRotation.set(0, 0, 0);
      }
    });
  }

  function offsetFeedbackPart(part, position, rotation) {
    if (!part.userData.appliedFeedbackPosition) part.userData.appliedFeedbackPosition = new THREE.Vector3();
    if (!part.userData.appliedFeedbackRotation) part.userData.appliedFeedbackRotation = new THREE.Vector3();
    part.position.add(position);
    part.rotation.x += rotation.x;
    part.rotation.y += rotation.y;
    part.rotation.z += rotation.z;
    part.userData.appliedFeedbackPosition.add(position);
    part.userData.appliedFeedbackRotation.add(rotation);
  }

  function applyEntityCombatFeedback(entity, delta) {
    const attack = entity.userData.attackFeedback;
    if (attack) {
      attack.age += delta;
      const progress = clamp(attack.age / attack.life, 0, 1);
      const kick = Math.exp(-progress * 4.6) * (0.76 + Math.cos(progress * Math.PI * 4) * 0.24);
      const heavy = attack.weaponClass === 'artillery' || attack.weaponClass === 'cannon' || attack.weaponClass === 'shell';
      entity.traverse((part) => {
        if (part.userData.combatSilhouette) {
          offsetFeedbackPart(
            part,
            new THREE.Vector3(0, kick * attack.power * (heavy ? 0.045 : 0.018), -kick * attack.power * (heavy ? 0.16 : 0.035)),
            new THREE.Vector3(0, 0, -kick * attack.power * (heavy ? 0.028 : 0.012)),
          );
        } else if (part.userData.weaponRig) {
          if (part.userData.recoilAxis === 'z') {
            offsetFeedbackPart(part, new THREE.Vector3(0, 0, -kick * attack.power * (heavy ? 0.46 : 0.16)), new THREE.Vector3(-kick * 0.025 * attack.power, 0, 0));
          } else {
            offsetFeedbackPart(part, new THREE.Vector3(0, -kick * attack.power * 0.035, -kick * attack.power * 0.045), new THREE.Vector3(-kick * 0.2 * attack.power, 0, kick * 0.035));
          }
        } else if (part.userData.turretRig && heavy) {
          offsetFeedbackPart(part, new THREE.Vector3(0, 0, -kick * attack.power * 0.11), new THREE.Vector3(-kick * attack.power * 0.035, 0, 0));
        } else if (part.userData.feedbackChassis && heavy) {
          offsetFeedbackPart(part, new THREE.Vector3(0, kick * attack.power * 0.025, -kick * attack.power * 0.07), new THREE.Vector3(kick * attack.power * 0.018, 0, 0));
        }
      });
      if (progress >= 1) entity.userData.attackFeedback = null;
    }
    const hit = entity.userData.hitFeedback;
    if (hit) {
      hit.age += delta;
      const progress = clamp(hit.age / hit.life, 0, 1);
      const envelope = (1 - progress) ** 2;
      const oscillation = Math.sin(progress * Math.PI * 5.5);
      const push = hit.incoming.clone().multiplyScalar(hit.strength * envelope * 0.13);
      const shake = oscillation * hit.strength * envelope;
      let reacted = false;
      entity.traverse((part) => {
        if (part.userData.combatSilhouette || part.userData.bodyRig || part.userData.feedbackChassis || part.userData.turretRig || part.userData.weaponRig) {
          const multiplier = part.userData.bodyRig ? 1 : (part.userData.weaponRig ? 0.48 : 0.7);
          offsetFeedbackPart(
            part,
            new THREE.Vector3(push.x * multiplier, Math.abs(shake) * 0.025, push.z * multiplier),
            new THREE.Vector3(-hit.incoming.z * shake * 0.08, hit.incoming.x * shake * 0.035, hit.incoming.x * shake * 0.09),
          );
          reacted = true;
        }
      });
      if (!reacted && entity.children[0]) {
        offsetFeedbackPart(entity.children[0], push.multiplyScalar(0.65), new THREE.Vector3(0, 0, shake * 0.025));
      }
      if (progress >= 1) entity.userData.hitFeedback = null;
    }
  }

  function updatePersistentDamage(entity) {
    const damageRoot = entity.userData.damageFeedbackRoot;
    if (!damageRoot) return;
    damageRoot.traverse((part) => {
      if (part.userData.damageSmoke) {
        const cycle = (elapsed * 0.22 + part.userData.phase) % 1;
        part.position.y = part.userData.baseY + cycle * (entity.userData.entityType === 'building' ? 2.1 : 0.92);
        const scale = part.userData.baseScale * (0.74 + cycle * 0.7);
        part.scale.setScalar(scale);
        part.material.opacity = Math.sin(cycle * Math.PI) * (part.material.color.getHex() === 0x363534 ? 0.46 : 0.28);
      } else if (part.userData.damageFire) {
        const pulse = 0.72 + Math.sin(elapsed * 15 + part.userData.phase) * 0.18 + Math.sin(elapsed * 23) * 0.08;
        part.scale.set(0.78 + pulse * 0.25, pulse, 0.78 + pulse * 0.25);
        part.position.y = part.userData.baseY + Math.sin(elapsed * 11 + part.userData.phase) * 0.045;
        part.material.opacity = 0.68 + pulse * 0.2;
      } else if (part.userData.damageLight) {
        part.intensity = 1.3 + Math.sin(elapsed * 17 + entity.id) * 0.45;
      }
    });
  }

  function updateFeedbackEffect(effect, delta) {
    const data = effect.userData;
    if (!effect.parent) {
      feedbackEffects.delete(effect);
      return;
    }
    data.age += delta;
    const progress = clamp(data.age / Math.max(0.001, data.life), 0, 1);
    if (data.feedbackKind === 'muzzle') {
      const fade = (1 - progress) ** 2;
      effect.rotation.y += delta * 23;
      effect.children.forEach((child) => {
        if (child.isLight) child.intensity = (3.5 + data.power * 3.2) * fade;
        else if (child.material) child.material.opacity = fade;
      });
      effect.scale.setScalar(0.72 + Math.sin(progress * Math.PI) * 0.72);
    } else if (data.feedbackKind === 'muzzle-smoke') {
      effect.position.addScaledVector(data.velocity, delta);
      data.velocity.y += delta * 0.14;
      const scale = effect.scale.x * (1 + delta * 1.1);
      effect.scale.setScalar(scale);
      effect.material.opacity = Math.sin(progress * Math.PI) * (data.power > 1.2 ? 0.42 : 0.29);
    } else if (data.feedbackKind === 'hit-flash') {
      const fade = (1 - progress) ** 2;
      effect.children.forEach((child) => {
        if (child.isLight) child.intensity = 2.8 * fade;
        else if (child.material) child.material.opacity = 0.4 * fade;
      });
      effect.scale.setScalar(0.72 + progress * 1.28);
    } else if (data.feedbackKind === 'destruction') {
      const fade = 1 - clamp((progress - 0.8) / 0.2, 0, 1);
      effect.children.forEach((child) => {
        const layer = child.userData.feedbackLayer;
        if (layer === 'wreck-shard') {
          const velocity = child.userData.velocity;
          velocity.y -= 10.5 * delta;
          child.position.addScaledVector(velocity, delta);
          if (child.position.y < data.groundY + 0.04) {
            child.position.y = data.groundY + 0.04;
            velocity.y = Math.abs(velocity.y) * 0.18;
            velocity.x *= 0.7;
            velocity.z *= 0.7;
          }
          child.rotation.x += child.userData.spin.x * delta;
          child.rotation.y += child.userData.spin.y * delta;
          child.rotation.z += child.userData.spin.z * delta;
          child.material.opacity = fade;
        } else if (layer === 'wreck-smoke') {
          const cycle = (data.age * 0.17 + child.userData.phase) % 1;
          child.position.y += delta * (0.18 + data.scaleClass * 0.12);
          child.position.x += Math.sin(elapsed * 0.8 + child.userData.phase) * delta * 0.06;
          const smokeScale = child.userData.baseScale * (1 + cycle * 0.85);
          child.scale.setScalar(smokeScale);
          child.material.opacity = Math.sin(cycle * Math.PI) * 0.38 * fade;
        } else if (layer === 'wreck-fire') {
          const pulse = 0.7 + Math.sin(elapsed * 15 + effect.id) * 0.24;
          child.scale.set(0.82 + pulse * 0.2, pulse, 0.82 + pulse * 0.2);
          child.material.opacity = 0.82 * fade;
        } else if (layer === 'wreck-light') {
          child.intensity = 2.4 * data.scaleClass * fade * (0.75 + Math.sin(elapsed * 17) * 0.2);
        } else if (child.material) {
          child.material.opacity = (layer === 'wreck-scorch' ? 0.7 : 1) * fade;
        }
      });
    }
    if (progress >= 1) disposeFeedbackObject(effect);
  }

  function stampMovementTrail(entity) {
    if (!entity || entity.userData.kind === 'dron' || entity.userData.kind === 'aeronave') return;
    const vehicle = entity.userData.kind === 'tanque' || entity.userData.kind === 'artilleria' || entity.userData.kind === 'vehiculo';
    const interval = vehicle ? 1.45 : 0.9;
    const last = entity.userData.lastTrailPoint;
    if (!last) {
      entity.userData.lastTrailPoint = new THREE.Vector2(entity.position.x, entity.position.z);
      return;
    }
    if (last.distanceTo(new THREE.Vector2(entity.position.x, entity.position.z)) < interval) return;
    last.set(entity.position.x, entity.position.z);
    const offsets = vehicle ? [-0.82, 0.82] : [entity.userData.trailFoot ? -0.16 : 0.16];
    entity.userData.trailFoot = !entity.userData.trailFoot;
    offsets.forEach((offset) => {
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(vehicle ? 0.42 : 0.2, vehicle ? 1.5 : 0.42),
        new THREE.MeshBasicMaterial({
          color: 0x27241d,
          transparent: true,
          opacity: vehicle ? 0.34 : 0.24,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -6,
        }),
      );
      const sideX = Math.cos(entity.rotation.y) * offset;
      const sideZ = -Math.sin(entity.rotation.y) * offset;
      mark.position.set(entity.position.x + sideX, heightAt(entity.position.x + sideX, entity.position.z + sideZ) + 0.19, entity.position.z + sideZ);
      mark.rotation.set(-Math.PI / 2, 0, entity.rotation.y);
      mark.userData.groundDecal = true;
      movementTrails.add(mark);
      trailMarks.push(mark);
    });
    while (trailMarks.length > 84) {
      const oldest = trailMarks.shift();
      oldest.removeFromParent();
      oldest.geometry.dispose();
      oldest.material.dispose();
    }
  }

  function registerEffect(effect) {
    root.add(effect);
    effects.add(effect);
    while (effects.size > maxEffects) {
      const oldest = effects.values().next().value;
      if (!oldest || oldest === effect) break;
      removeEntity(oldest);
    }
    return effect;
  }

  function addBuilding(buildOptions = {}) {
    const entity = createBuilding(THREE, { era, buildingAtlasTexture, ...buildOptions });
    entity.position.y = heightAt(entity.position.x, entity.position.z) + (buildOptions.position?.[1] ?? 0);
    root.add(entity);
    entities.add(entity);
    return entity;
  }

  function addUnit(unitOptions = {}) {
    const entity = createUnit(THREE, {
      era,
      phase: random() * Math.PI * 2,
      unitAtlasTexture,
      directionalUnitAtlasTexture,
      ...unitOptions,
    });
    const flyHeight = entity.userData.kind === 'dron' || entity.userData.kind === 'aeronave' ? 3.2 : 0;
    entity.position.y = heightAt(entity.position.x, entity.position.z) + flyHeight + (unitOptions.position?.[1] ?? 0);
    entity.userData.baseY = entity.position.y;
    root.add(entity);
    entities.add(entity);
    return entity;
  }

  function addEffect(effectOptions = {}) {
    const color = effectOptions.color ?? 0xffa340;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const effect = new THREE.Group();
    const flash = new THREE.Mesh(new THREE.IcosahedronGeometry(effectOptions.size ?? 0.45, 1), material);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 24), material.clone());
    ring.rotation.x = -Math.PI / 2;
    effect.add(flash, ring);
    const position = effectOptions.position ?? [0, 0, 0];
    effect.position.set(position[0], position[1], position[2]);
    effect.userData.life = effectOptions.life ?? 0.65;
    effect.userData.age = 0;
    effect.userData.effectKind = 'pulse';
    return registerEffect(effect);
  }

  function addProjectile(projectileOptions = {}) {
    return registerEffect(createProjectile(THREE, projectileOptions));
  }

  function addImpact(impactOptions = {}) {
    const effect = createImpact(THREE, impactOptions);
    if (impactOptions.snapToGround !== false && effect.position.y === 0) {
      effect.position.y = heightAt(effect.position.x, effect.position.z) + 0.04;
    }
    return registerEffect(effect);
  }

  function removeEntity(entity) {
    if (!entity) return;
    [...feedbackEffects]
      .filter((effect) => effect.userData.feedbackEntity === entity)
      .forEach(disposeFeedbackObject);
    entities.delete(entity);
    effects.delete(entity);
    entity.removeFromParent();
    entity.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else if (child.material) child.material.dispose();
    });
  }

  function setSelected(entity, selected = true, markerOptions = {}) {
    if (!entity) return null;
    const existing = entity.children.find((child) => child.userData.selectionMarker);
    if (!selected) {
      if (existing) existing.removeFromParent();
      entity.userData.selected = false;
      return null;
    }
    entity.userData.selected = true;
    if (existing) return existing;
    const marker = createSelectionMarker(THREE, markerOptions);
    const inverseScale = 1 / (entity.scale.x || 1);
    marker.scale.setScalar(inverseScale);
    marker.userData.markerBaseScale = inverseScale;
    entity.add(marker);
    return marker;
  }

  function updateEntity(entity, patch = {}) {
    if (!entity) return entity;
    if (patch.position) {
      const [x, suppliedY, z] = patch.position;
      entity.position.x = x;
      entity.position.z = z;
      entity.position.y = suppliedY ?? heightAt(x, z);
      entity.userData.baseY = entity.position.y;
      stampMovementTrail(entity);
    }
    if (patch.rotation != null) entity.rotation.y = patch.rotation;
    if (patch.health != null) entity.userData.health = patch.health;
    if (patch.maxHealth != null) entity.userData.maxHealth = patch.maxHealth;
    if (patch.action != null) entity.userData.action = patch.action;
    if (patch.targetPosition != null) entity.userData.targetPosition = vectorFrom(THREE, patch.targetPosition);
    if (patch.material != null) entity.userData.impactMaterial = patch.material;
    if (patch.cargo !== undefined && entity.userData.cargoVisual) {
      const cargo = entity.userData.cargoVisual;
      const amount = Math.max(0, Number(patch.cargo?.amount) || 0);
      const capacity = Math.max(1, Number(patch.cargo?.capacity) || 1);
      cargo.visible = amount > 0.01;
      cargo.children.forEach((resource) => {
        resource.visible = cargo.visible && resource.userData.cargoResource === patch.cargo?.resource;
      });
      const fullness = clamp(amount / capacity, 0, 1);
      cargo.scale.setScalar(0.76 + fullness * 0.3);
    }
    if (patch.visible != null) entity.visible = patch.visible;
    if (patch.selected != null) setSelected(entity, patch.selected, patch.marker);
    if (patch.health != null && (entity.userData.maxHealth ?? patch.maxHealth) > 0) {
      ensurePersistentDamage(entity, patch.health / Math.max(1, entity.userData.maxHealth ?? patch.maxHealth));
    }
    return entity;
  }

  function setEra(nextEra) {
    era = nearestEra(Number(nextEra));
    eraInfrastructure.setEra(era);
    biomeProps.setEra(era);
    basePathGroups.forEach((group, key) => { group.visible = key === era; });
    baseGroundGroups.forEach((group, key) => { group.visible = key === era; });
    const eraAlbedo = terrainEraMaps.get(era);
    if (eraAlbedo) {
      terrain.material.map = eraAlbedo;
      terrain.material.bumpMap = eraAlbedo;
      terrain.material.vertexColors = false;
      terrain.material.needsUpdate = true;
      terrain.userData.albedoAsset = `terrain-${era}-v1.png`;
    }
    const eraColor = new THREE.Color(ERAS[era].color);
    const visualEra = {
      1800: { terrain: [0.92, 1.08, 0.88], road: 0x504133, shoulder: 0x9a815b, top: 0x355c70, horizon: 0xd6bd90, bottom: 0x74877e, fog: 0x9aaca5, sky: 0xd1e1e1, ground: 0x83745f, sun: 0xffd59b, exposure: 1.18 },
      1900: { terrain: [0.94, 0.95, 0.96], road: 0x3f4140, shoulder: 0x716047, top: 0x3e4d55, horizon: 0xc19b6b, bottom: 0x626c67, fog: 0x8e9994, sky: 0xc9d5d4, ground: 0x776b5c, sun: 0xffcb91, exposure: 1.14 },
      2000: { terrain: [1.0, 1.03, 1.06], road: 0x40484a, shoulder: 0x6d756d, top: 0x294b65, horizon: 0x9eb9bd, bottom: 0x506875, fog: 0x78929a, sky: 0xbfd7df, ground: 0x68757a, sun: 0xe6efff, exposure: 1.16 },
      2100: { terrain: [1.0, 1.04, 1.1], road: 0x4b5367, shoulder: 0x707990, top: 0x151c3a, horizon: 0x6b6b8f, bottom: 0x30384f, fog: 0x566178, sky: 0x9caccc, ground: 0x555d73, sun: 0xcfd7ff, exposure: 1.18 },
    }[era];
    terrain.material.color.setRGB(...visualEra.terrain);
    roadMaterial.color.setHex(visualEra.road);
    shoulderMaterial.color.setHex(visualEra.shoulder);
    crossShoulderMaterial.color.setHex(visualEra.shoulder);
    atmosphere.sky.material.uniforms.topColor.value.setHex(visualEra.top);
    atmosphere.sky.material.uniforms.horizonColor.value.setHex(visualEra.horizon);
    atmosphere.sky.material.uniforms.bottomColor.value.setHex(visualEra.bottom);
    if (scene.fog) scene.fog.color.setHex(visualEra.fog);
    atmosphere.hemisphere.color.setHex(visualEra.sky);
    atmosphere.hemisphere.groundColor.setHex(visualEra.ground);
    atmosphere.sun.color.setHex(visualEra.sun);
    if (renderer) renderer.toneMappingExposure = visualEra.exposure;
    const vegetationProfile = {
      1800: { families: [1, 1, 1, 1, 1], tint: 0xc2c5a8, grass: 1, flowers: 1, wildlife: true },
      1900: { families: [1, 1, 1, 1, 1], tint: 0xb8baa0, grass: 0.9, flowers: 0.72, wildlife: true },
      2000: { families: [0.86, 0.92, 0.9, 0.76, 0.82], tint: 0xa8b8ad, grass: 0.72, flowers: 0.5, wildlife: true },
      2100: { families: [0, 0, 0, 0, 0], tint: 0x8fa6a6, grass: 0.05, flowers: 0, wildlife: false },
    }[era];
    vegetation.foliageMaterial.color.setHex(vegetationProfile.tint);
    vegetation.foliageBillboards.forEach((mesh, family) => {
      mesh.count = Math.max(0, Math.floor(vegetation.familyCounts[family] * vegetationProfile.families[family]));
      mesh.instanceMatrix.needsUpdate = true;
    });
    vegetation.trunks.visible = era < 2100;
    vegetation.rocks.material.color.setHex(era >= 2100 ? 0x8790a0 : 0x6c706c);
    groundLife.grass.count = Math.floor(groundLife.grass.userData.fullCount * vegetationProfile.grass);
    groundLife.flowers.count = Math.floor(groundLife.flowers.userData.fullCount * vegetationProfile.flowers);
    groundLife.grass.material.color.setHex(era >= 2100 ? 0x536a68 : era >= 2000 ? 0x53756a : 0x5f7f43);
    groundLife.legacySupply.visible = era <= 1900;
    groundLife.telegraph.visible = era === 1800;
    historicalRuins.visible = era <= 1900;
    wildlife.root.visible = vegetationProfile.wildlife;
    if (water.material.uniforms?.uShallow) {
      water.material.uniforms.uShallow.value.copy(era >= 2100 ? eraColor.lerp(new THREE.Color(0x2d8f9e), 0.68) : new THREE.Color(0x2d8f9e));
    }
    return era;
  }

  function updateHealthIndicator(entity) {
    const bar = entity.userData.healthBar;
    if (!bar) return;
    const health = Math.max(0, entity.userData.health ?? 0);
    const maxHealth = Math.max(1, entity.userData.maxHealth ?? health ?? 1);
    const ratio = clamp(health / maxHealth, 0, 1);
    const fill = bar.userData.fill;
    const baseWidth = bar.userData.baseWidth;
    fill.scale.x = Math.max(0.001, baseWidth * ratio);
    fill.position.x = -baseWidth * (1 - ratio) * 0.5;
    if (ratio > 0.55) fill.material.color.setHex(0x66d98a);
    else if (ratio > 0.25) fill.material.color.setHex(0xe8bd59);
    else fill.material.color.setHex(0xe6584e);
    const entityScale = Math.max(0.01, entity.scale.y || 1);
    bar.scale.setScalar(1 / entityScale);
    bar.position.y = bar.userData.baseY / entityScale;
    bar.visible = entity.visible !== false && (entity.userData.selected || ratio < 0.995) && health > 0;
  }

  function updateProjectileEffect(effect, delta) {
    const data = effect.userData;
    data.age += delta;
    const progress = clamp(data.age / data.duration, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    effect.position.lerpVectors(data.origin, data.target, eased);
    effect.position.y += Math.sin(progress * Math.PI) * data.arc;
    const velocity = effect.position.clone().sub(data.previous);
    if (velocity.lengthSq() < 0.000001) velocity.copy(data.target).sub(data.origin).normalize().multiplyScalar(0.1);
    const flightDirection = velocity.clone().normalize();
    const core = effect.children.find((child) => child.userData.projectileCore);
    if (core) {
      const axis = data.projectileKind === 'shell'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
      core.quaternion.setFromUnitVectors(axis, flightDirection);
    }
    const trail = data.tracer.geometry.attributes.position;
    velocity.normalize().multiplyScalar(-data.trailLength * (0.55 + progress * 0.45));
    trail.setXYZ(0, 0, 0, 0);
    trail.setXYZ(1, velocity.x, velocity.y, velocity.z);
    trail.needsUpdate = true;
    const trailBody = data.trailBody;
    if (trailBody) {
      const length = velocity.length();
      trailBody.position.copy(velocity).multiplyScalar(0.5);
      trailBody.scale.set(1, length, 1);
      trailBody.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), velocity.clone().normalize());
    }
    data.previous.copy(effect.position);
    const pulse = 0.82 + Math.sin(elapsed * 42 + effect.id) * 0.18;
    effect.children[0]?.scale.setScalar(pulse);
    if (progress >= 1) {
      if (data.impact) addImpact({ position: data.target, ...data.impactOptions, snapToGround: false });
      removeEntity(effect);
    }
  }

  function updateImpactEffect(effect, delta) {
    const data = effect.userData;
    data.age += delta;
    const progress = clamp(data.age / data.life, 0, 1);
    effect.children.forEach((child) => {
      const layer = child.userData.impactLayer;
      if (layer === 'flash' || layer === 'core') {
        const flashProgress = clamp(data.age / (layer === 'core' ? data.coreLife : data.flashLife), 0, 1);
        child.scale.setScalar(data.power * (layer === 'core'
          ? 0.26 + flashProgress * 0.44
          : 0.42 + flashProgress * 0.92));
        child.material.opacity = (layer === 'core' ? 0.96 : 0.8) * (1 - flashProgress) ** 2;
      } else if (layer === 'shockwave') {
        const shockProgress = clamp(data.age / 0.72, 0, 1);
        child.scale.setScalar(1 + shockProgress * 7.5);
        child.material.opacity = (1 - shockProgress) * 0.72;
      } else if (layer === 'sparks') {
        const positions = child.geometry.attributes.position;
        const velocities = child.userData.velocities;
        for (let index = 0; index < positions.count; index += 1) {
          const offset = index * 3;
          velocities[offset + 1] -= 13.5 * delta;
          positions.setXYZ(
            index,
            positions.getX(index) + velocities[offset] * delta,
            Math.max(0.035, positions.getY(index) + velocities[offset + 1] * delta),
            positions.getZ(index) + velocities[offset + 2] * delta,
          );
          velocities[offset] *= 0.985;
          velocities[offset + 2] *= 0.985;
        }
        positions.needsUpdate = true;
        child.material.opacity = Math.max(0, 1 - data.age / 0.92);
      } else if (layer === 'smoke') {
        child.position.addScaledVector(child.userData.velocity, delta);
        child.userData.velocity.x += Math.sin(elapsed * 0.8 + child.id) * delta * 0.08;
        const smokeProgress = clamp((data.age - 0.08) / Math.max(0.3, data.life - 0.08), 0, 1);
        child.material.opacity = Math.sin(smokeProgress * Math.PI) * (data.materialKind === 'agua' ? 0.32 : 0.48);
        const expansion = 1 + delta * (0.6 + data.power * 0.2);
        child.scale.multiplyScalar(expansion);
      } else if (layer === 'debris' || layer === 'casing') {
        const velocity = child.userData.velocity;
        velocity.y -= 11.5 * delta;
        child.position.addScaledVector(velocity, delta);
        if (child.position.y < 0.045) {
          child.position.y = 0.045;
          velocity.y = Math.abs(velocity.y) * (layer === 'casing' ? 0.38 : 0.24);
          velocity.x *= 0.72;
          velocity.z *= 0.72;
        }
        child.rotation.x += child.userData.spin.x * delta;
        child.rotation.y += child.userData.spin.y * delta;
        child.rotation.z += child.userData.spin.z * delta;
        child.material.opacity = 1;
      } else if (layer === 'scar') {
        child.material.opacity = (data.materialKind === 'agua' ? 0.16 : 0.5) * (1 - Math.max(0, progress - 0.68) / 0.32);
      }
    });
    if (progress >= 1) removeEntity(effect);
  }

  function update(deltaSeconds = 1 / 60) {
    const delta = clamp(deltaSeconds, 0, 0.1);
    elapsed += delta;
    if (recentFeedbackEvents.size > 96) {
      recentFeedbackEvents.forEach((expiresAt, key) => {
        if (expiresAt <= elapsed) recentFeedbackEvents.delete(key);
      });
    }
    water.material.uniforms.uTime.value = elapsed;
    wildlife.update(delta, elapsed);
    clouds.children.forEach((cloud) => {
      cloud.position.x += cloud.userData.speed * delta;
      if (cloud.position.x > size * 0.62) cloud.position.x = -size * 0.62;
    });
    root.traverse((object) => {
      if (object.userData.rotor) object.rotation.z += delta * 7.5;
      if (object.userData.radarDish) object.rotation.y += delta * 0.42;
      if (object.userData.landmarkHalo) {
        object.rotation.z += delta * 0.24;
        object.material.emissiveIntensity = 0.44 + Math.sin(elapsed * 1.7 + object.id) * 0.12;
      }
      if (object.userData.float) object.position.y = object.userData.baseY + Math.sin(elapsed * 1.8) * 0.18;
      if (object.userData.windCloth && object.geometry?.attributes?.position) {
        object.rotation.y = Math.sin(elapsed * 2.1 + object.id) * 0.09;
      }
      if (object.userData.smoke) {
        const cycle = (elapsed * 0.17 + object.userData.phase) % 1;
        object.position.y = object.userData.baseY + cycle * 2.8;
        object.position.x += Math.sin(elapsed * 0.45 + object.userData.phase * 8) * delta * 0.035;
        object.scale.setScalar(0.72 + cycle * 0.75);
        object.scale.y *= 0.72;
        object.material.opacity = Math.sin(cycle * Math.PI) * 0.28;
      }
      if (object.userData.ambientDust && object.geometry?.attributes?.position) {
        const positions = object.geometry.attributes.position;
        const origins = object.userData.origins;
        const phases = object.userData.phases;
        for (let index = 0; index < positions.count; index += 1) {
          const offset = index * 3;
          const phase = phases[index];
          positions.setXYZ(
            index,
            origins[offset] + Math.sin(elapsed * 0.23 + phase) * 0.42,
            origins[offset + 1] + Math.sin(elapsed * 0.68 + phase * 1.7) * 0.16,
            origins[offset + 2] + Math.cos(elapsed * 0.19 + phase) * 0.3,
          );
        }
        positions.needsUpdate = true;
      }
      if (object.userData.selectionMarker) {
        object.rotation.y -= delta * 0.72;
        const pulse = 1 + Math.sin(elapsed * 4.2) * 0.045;
        const baseScale = object.userData.markerBaseScale ?? 1;
        object.scale.setScalar(baseScale * pulse);
      }
    });
    if (viewCamera) {
      viewCamera.updateWorldMatrix(true, false);
      biomeProps.billboards.forEach((billboard) => {
        if (billboard.parent?.visible) billboard.quaternion.copy(viewCamera.quaternion);
      });
    }
    entities.forEach((entity) => {
      clearEntityFeedbackOffsets(entity);
      const atlasSilhouette = entity.userData.atlasSilhouette;
      if (atlasSilhouette && viewCamera) {
        entity.updateWorldMatrix(true, false);
        viewCamera.updateWorldMatrix(true, false);
        entity.getWorldQuaternion(atlasParentRotation);
        atlasSilhouette.quaternion.copy(atlasParentRotation.invert().multiply(viewCamera.quaternion));
        atlasCameraRight.setFromMatrixColumn(viewCamera.matrixWorld, 0).setY(0).normalize();
        atlasCameraForward.setFromMatrixColumn(viewCamera.matrixWorld, 2).setY(0).normalize().multiplyScalar(-1);
        atlasFacing.set(Math.sin(entity.rotation.y), 0, Math.cos(entity.rotation.y));
        let direction = atlasSilhouette.userData.directional && atlasFacing.dot(atlasCameraRight) < 0 ? -1 : 1;
        if (atlasSilhouette.userData.directionalAtlas && atlasSilhouette.material.uniforms?.uRect) {
          const relativeAngle = Math.atan2(
            atlasFacing.dot(atlasCameraRight),
            atlasFacing.dot(atlasCameraForward),
          );
          let directionColumn = 3;
          if (relativeAngle > 2.8) directionColumn = 0;
          else if (relativeAngle > 2.4) directionColumn = 1;
          else if (relativeAngle > 0.5) directionColumn = 2;
          else if (relativeAngle < -2.8) directionColumn = 6;
          else if (relativeAngle < -2.4) directionColumn = 5;
          else if (relativeAngle < -0.5) directionColumn = 4;
          const directionalV0 = (3 - atlasSilhouette.userData.directionalAtlasRow) * 0.25;
          atlasSilhouette.material.uniforms.uRect.value.set(
            directionColumn / 7,
            directionalV0,
            (directionColumn + 1) / 7,
            directionalV0 + 0.25,
          );
          direction = 1;
        }
        atlasSilhouette.scale.x = (atlasSilhouette.userData.baseScaleX ?? 1) * direction;
        if (entity.userData.entityType === 'unit') {
          const phase = entity.userData.phase ?? 0;
          const motion = entity.userData.motion ?? 0;
          const gait = elapsed * (6.2 + motion * 4.1) + phase;
          const lean = Math.sin(phase * 1.37) * 0.022 + Math.sin(gait * 0.5) * motion * 0.018;
          atlasSilhouette.quaternion.multiply(atlasTiltRotation.setFromAxisAngle(atlasTiltAxis, lean));
          atlasSilhouette.position.y = (atlasSilhouette.userData.baseY ?? 0)
            + Math.abs(Math.sin(gait)) * 0.048 * motion
            + Math.sin(elapsed * 1.65 + phase) * 0.01 * (1 - motion);
          atlasSilhouette.scale.y = (atlasSilhouette.userData.baseScaleY ?? 1)
            * (1 + Math.sin(gait) * 0.012 * motion);
        }
      }
      updateHealthIndicator(entity);
      if (entity.userData.entityType === 'unit' && (entity.userData.kind === 'dron' || entity.userData.kind === 'aeronave')) {
        entity.position.y = entity.userData.baseY + Math.sin(elapsed * 2.2 + entity.userData.phase) * 0.18;
      }
      if (entity.userData.entityType === 'unit' && entity.userData.unitRole) {
        const dx = entity.position.x - entity.userData.lastWorldX;
        const dz = entity.position.z - entity.userData.lastWorldZ;
        const distance = Math.hypot(dx, dz);
        const targetMotion = clamp(distance / Math.max(0.001, delta * 3.7), 0, 1);
        entity.userData.motion = lerp(
          entity.userData.motion ?? 0,
          targetMotion,
          clamp(delta * (targetMotion > (entity.userData.motion ?? 0) ? 11 : 7), 0, 1),
        );
        entity.userData.lastWorldX = entity.position.x;
        entity.userData.lastWorldZ = entity.position.z;
        const motion = entity.userData.motion;
        const gait = elapsed * (6.2 + motion * 4.1) + entity.userData.phase;
        const action = entity.userData.action ?? 'inactivo';
        const working = action === 'recolectando' || action === 'construyendo';
        const attacking = action === 'atacando';
        const actionPhase = elapsed * (action === 'construyendo' ? 7.2 : 8.8) + entity.userData.phase;
        entity.traverse((part) => {
          if (part.userData.walkLimb) {
            const sidePhase = part.userData.walkLimb > 0 ? 0 : Math.PI;
            const desired = Math.sin(gait + sidePhase) * part.userData.limbAmplitude * motion;
            part.rotation.x = lerp(part.rotation.x, desired, clamp(delta * 14, 0, 1));
          }
          if (part.userData.bodyRig) {
            part.position.y = part.userData.baseY
              + Math.abs(Math.sin(gait)) * 0.045 * motion
              + Math.sin(elapsed * 1.65 + entity.userData.phase) * 0.012 * (1 - motion);
            part.rotation.z = Math.sin(gait * 0.5) * 0.025 * motion;
            part.rotation.x = lerp(
              part.rotation.x,
              working ? 0.12 + Math.max(0, Math.sin(actionPhase)) * 0.12 : (attacking ? -0.08 : 0),
              clamp(delta * 10, 0, 1),
            );
          }
          if (part.userData.headRig) {
            part.rotation.y = Math.sin(elapsed * 0.72 + entity.userData.phase) * 0.11 * (1 - motion * 0.75);
          }
          if (part.userData.horseTail) {
            part.rotation.x = (part.userData.restX ?? -0.68) + Math.sin(gait * 0.5) * (0.08 + motion * 0.13);
            part.rotation.z = Math.sin(elapsed * 2.4 + entity.userData.phase) * 0.12;
          }
          if (part.userData.toolRig) {
            const workSwing = working ? -0.55 + Math.sin(actionPhase) * 0.82 : 0;
            part.rotation.x = lerp(
              part.rotation.x,
              (part.userData.restX ?? 0) - 0.12 + Math.sin(gait) * 0.18 * motion + workSwing,
              clamp(delta * 16, 0, 1),
            );
            part.rotation.z = lerp(
              part.rotation.z,
              (part.userData.restZ ?? -0.28) + (working ? Math.cos(actionPhase) * 0.16 : 0),
              clamp(delta * 12, 0, 1),
            );
          }
          if (part.userData.weaponRig) {
            const recoil = attacking ? Math.max(0, Math.sin(actionPhase * 1.85)) ** 8 * 0.24 : 0;
            part.rotation.x = lerp(
              part.rotation.x,
              (part.userData.restX ?? 0) + Math.sin(gait * 0.5) * 0.04 * motion - recoil,
              clamp(delta * 18, 0, 1),
            );
            part.rotation.z = lerp(
              part.rotation.z,
              (part.userData.restZ ?? -0.16) + (attacking ? 0.19 : 0),
              clamp(delta * 13, 0, 1),
            );
          }
          if (part.userData.stepDust && part.material) {
            const step = Math.max(0, Math.sin(gait * 2 - 0.4));
            part.material.opacity = motion * step * 0.16;
            const scale = 0.56 + step * 0.4;
            part.scale.set(scale, scale * 0.48, 1);
          }
        });
      }
      applyEntityCombatFeedback(entity, delta);
      updatePersistentDamage(entity);
    });
    effects.forEach((effect) => {
      if (effect.userData.effectKind === 'projectile') {
        updateProjectileEffect(effect, delta);
        return;
      }
      if (effect.userData.effectKind === 'impact') {
        updateImpactEffect(effect, delta);
        return;
      }
      effect.userData.age += delta;
      const progress = effect.userData.age / effect.userData.life;
      effect.scale.setScalar(1 + progress * 3.5);
      effect.children.forEach((child) => {
        if (child.material) child.material.opacity = Math.max(0, 1 - progress);
      });
      if (progress >= 1) removeEntity(effect);
    });
    feedbackEffects.forEach((effect) => updateFeedbackEffect(effect, delta));
  }

  function dispose() {
    [...feedbackEffects].forEach(disposeFeedbackObject);
    [...entities, ...effects].forEach(removeEntity);
    root.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else if (child.material) child.material.dispose();
    });
    root.removeFromParent();
    atmosphere.sky.geometry.dispose();
    atmosphere.sky.material.dispose();
    atmosphere.sky.removeFromParent();
    atmosphere.hemisphere.removeFromParent();
    atmosphere.sun.removeFromParent();
  }

  return {
    root,
    terrain,
    water,
    vegetation,
    groundLife,
    biomeProps,
    eraInfrastructure,
    atmosphere,
    clouds,
    wildlife,
    entities,
    effects,
    ERAS,
    get era() { return era; },
    heightAt,
    groundHeightAt: heightAt,
    createBuilding: addBuilding,
    createUnit: addUnit,
    createEffect: addEffect,
    createProjectile: addProjectile,
    createImpact: addImpact,
    playAttackFeedback,
    playHitFeedback,
    createSelectionMarker: (markerOptions) => createSelectionMarker(THREE, markerOptions),
    updateEntity,
    removeEntity,
    setSelected,
    setEra,
    update,
    dispose,
  };
}

export default createWorld;
