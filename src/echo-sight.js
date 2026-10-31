import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const ui = {
  title: $('title-screen'), game: $('game-ui'), pause: $('pause-screen'), ending: $('end-screen'),
  controls: $('controls-modal'), start: $('start-button'), pauseButton: $('pause-button'), resume: $('resume-button'),
  restart: $('restart-button'), playAgain: $('play-again-button'),
  zone: $('zone-name'), depth: $('zone-depth'), objectiveStep: $('objective-step'), objectiveTitle: $('objective-title'),
  objectiveCopy: $('objective-copy'), objectiveProgress: $('objective-progress-bar'), objectiveLocation: $('objective-location'),
  batteryNumber: $('battery-number'), batteryMeter: $('battery-meter'), batteryState: $('battery-state'),
  sanityNumber: $('sanity-number'), sanityMeter: $('sanity-meter'), signalState: $('signal-state'),
  threatCard: $('threat-card'), threatState: $('threat-state'), checkpoint: $('checkpoint-readout'), clock: $('clock-readout'),
  fps: $('fps-readout'), focus: $('focus-label'), prompt: $('interact-prompt'), promptCopy: $('prompt-copy'), toast: $('toast'),
  modeDrain: $('mode-drain'), modeDescription: $('mode-description'), histogram: $('histogram-panel'), sift: $('sift-panel'),
  histogramCanvas: $('histogram-graph'), shadow: $('shadow-slider'), mid: $('mid-slider'), high: $('high-slider'),
  shadowVal: $('shadow-val'), midVal: $('mid-val'), highVal: $('high-val'), calibrationStatus: $('calibration-status'),
  calibrate: $('calibrate-button'), alignment: $('alignment-value'), alignmentMeter: $('alignment-meter'), alignmentHint: $('alignment-hint'),
  reboot: $('reboot-overlay'), rebootCount: $('reboot-count'), rebootBar: $('reboot-progress-bar'),
  debriefTime: $('debrief-time'), debriefCells: $('debrief-cells'), debriefDesync: $('debrief-desync'), endingSummary: $('ending-summary'),
  touchInteract: $('touch-interact'),
};

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071113);
scene.fog = new THREE.FogExp2(0x071113, 0.023);
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.08, 100);
camera.position.set(0, 1.62, 0);
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

scene.add(new THREE.HemisphereLight(0x8eb7ad, 0x101816, 1.12));
const keyLight = new THREE.DirectionalLight(0x8db5a4, 1.65);
keyLight.position.set(-6, 11, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -20; keyLight.shadow.camera.right = 20;
keyLight.shadow.camera.top = 20; keyLight.shadow.camera.bottom = -55;
scene.add(keyLight);

const mats = new Map();
function material(color, roughness = .76, metalness = .1, emissive = 0x000000, intensity = 0) {
  const key = [color, roughness, metalness, emissive, intensity].join('|');
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: intensity }));
  return mats.get(key);
}
const M = {
  wall: material(0x26312d, .73, .34), wallDark: material(0x111b1a, .8, .25), trim: material(0x4b5d53, .42, .56),
  floor: material(0x182321, .46, .42), floorDark: material(0x0b1414, .52, .25), ceiling: material(0x192522, .71, .32),
  mint: material(0x93ffad, .3, .25, 0x4eff77, 2.2), cyan: material(0x78dcde, .3, .32, 0x37aab4, 1.5),
  amber: material(0xffbb71, .35, .2, 0xd94f1d, 1.5), red: material(0xd94f5a, .32, .2, 0x991e39, 2),
  black: material(0x060b0b, .34, .56), glass: new THREE.MeshPhysicalMaterial({ color: 0x6e9c8e, roughness: .15, metalness: .45, transparent: true, opacity: .48 }),
  terminal: material(0x183630, .32, .55, 0x0d6c49, .8),
};
const world = new THREE.Group();
scene.add(world);
const colliders = [];
const animated = [];
const interactables = [];
const markers = [];
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();
const player = { x: 0, z: .35, yaw: 0, pitch: 0, crouched: false, checkpoint: { x: 0, z: .35, name: 'ENTRY BAY' } };
const state = {
  started: false, paused: false, finished: false, stage: 0, mode: 0,
  battery: 100, sanity: 100, cells: new Set(), desyncs: 0,
  elapsed: 0, noise: 0, crouched: false, sprinting: false,
  toastUntil: 0, lastDamage: 0, rebootUntil: 0, rebootStart: 0,
  threatActive: false, threat: { x: 0, z: -34, wobble: 0 }, alignment: 0,
  calibrationDone: false, siftDone: false, lastStep: 0, lastFoot: 0, pointerLocked: false,
};
const keys = new Set();
let touchLook = null;
let lastToast = '';
let fpsFrames = 0, fpsElapsed = 0, currentFps = 60;
let audio = null;

function addMesh(geometry, mat, x, y, z, parent = world) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function addBox(x, y, z, sx, sy, sz, mat, options = {}) {
  const mesh = addMesh(new THREE.BoxGeometry(sx, sy, sz), mat, x, y, z, options.parent || world);
  if (options.collide) colliders.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 });
  if (options.emissive) animated.push({ kind: 'glow', obj: mesh, base: options.base || 1, phase: Math.random() * 6.28 });
  return mesh;
}
function addCylinder(x, y, z, radius, height, mat, parent = world, radial = 12) {
  return addMesh(new THREE.CylinderGeometry(radius, radius, height, radial), mat, x, y, z, parent);
}
function addPointLight(color, intensity, distance, x, y, z) {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.position.set(x, y, z);
  scene.add(light);
  return light;
}
function addWall(x, z, sx, sz, mat = M.wall) {
  addBox(x, 2.15, z, sx, 4.3, sz, mat, { collide: true });
  addBox(x, 4.29, z, sx + .04, .14, sz + .04, M.trim);
}
function seeded(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
function makeSign(text, color = '#b9ff81') {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#07110f'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#54715e'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, 496, 112);
  ctx.font = '500 30px monospace'; ctx.fillStyle = color; ctx.fillText('AEGIS  /  ' + text, 28, 77);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture, transparent: false, toneMapped: false });
}
function addWallSign(x, z, text, side) {
  const sign = addMesh(new THREE.PlaneGeometry(2.25, .56), makeSign(text), x, 3.2, z);
  sign.rotation.y = side === 'west' ? Math.PI / 2 : -Math.PI / 2;
}
function addRoomDoor(x, z, side, label) {
  const signMat = M.amber;
  for (const direction of [-1, 1]) {
    const post = addBox(x, 2, z + direction * 1.45, .18, 4, .18, M.trim);
    const strip = addBox(x + (side === 'west' ? .11 : -.11), 2.25, z + direction * 1.45, .035, 2.6, .025, M.mint, { emissive: true, base: .65 });
    strip.material = signMat;
  }
  addBox(x, 3.92, z, .18, .16, 3.05, M.trim);
  addWallSign(x + (side === 'west' ? .12 : -.12), z, label, side);
}
function addHoloText(text, x, y, z, color = '#b9ff81') {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 512, 96);
  ctx.font = '600 28px monospace'; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.fillText(text, 12, 60);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = addMesh(new THREE.PlaneGeometry(3.2, .6), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }), x, y, z);
  return mesh;
}

// The Aegis facility is a compact, navigable campaign: four research bays branch from a gated spine.
function buildFacility() {
  addBox(0, -.3, -22.7, 8.5, .6, 48.5, M.floor);
  addBox(0, 4.45, -22.7, 8.5, .5, 48.5, M.ceiling);
  addBox(0, -.3, 1.15, 8.5, .6, 3.1, M.floor);
  addBox(0, 4.45, 1.15, 8.5, .5, 3.1, M.ceiling);

  const leftGaps = [-10.8, -31.7], rightGaps = [-21.3, -36.4];
  for (const [x, gaps, side] of [[-4.2, leftGaps, 'west'], [4.2, rightGaps, 'east']]) {
    let cursor = 2.7;
    for (const center of gaps) {
      const high = center + 1.55;
      const low = center - 1.55;
      const length = cursor - high;
      if (length > .12) addWall(x, (cursor + high) / 2, .38, length);
      cursor = low;
    }
    const length = cursor - (-46.7);
    if (length > .12) addWall(x, (cursor - 46.7) / 2, .38, length);
  }
  // Four quiet bays, with a single marked aperture leading in from the central corridor.
  const bays = [
    { side: 'west', cx: -8.35, z: -10.8, label: 'RESONANCE / 01' },
    { side: 'east', cx: 8.35, z: -21.3, label: 'OPTICS / 02' },
    { side: 'west', cx: -8.35, z: -31.7, label: 'CRYO VAULT / A' },
    { side: 'east', cx: 8.35, z: -36.4, label: 'CRYO VAULT / B' },
  ];
  for (const bay of bays) {
    const sign = bay.side === 'west' ? -1 : 1;
    const inner = sign * 4.2, outer = sign * 12.5;
    const north = bay.z + 4.15, south = bay.z - 4.15;
    addBox((inner + outer) / 2, -.3, bay.z, 8.3, .6, 8.3, M.floor);
    addBox((inner + outer) / 2, 4.45, bay.z, 8.3, .5, 8.3, M.ceiling);
    addWall(outer, bay.z, .4, 8.7, M.wallDark);
    addWall((inner + outer) / 2, north, 8.3, .4, M.wallDark);
    addWall((inner + outer) / 2, south, 8.3, .4, M.wallDark);
    const doorZ = bay.z;
    // The long corridor wall has an opening aligned with this aperture; add its frame and signage.
    addRoomDoor(inner, doorZ, bay.side, bay.label);
    addPointLight(0x72dbb4, 1.1, 8, (inner + outer) / 2, 3.45, bay.z);
    const floorInset = addBox((inner + outer) / 2, .012, bay.z, 5.8, .025, 5.8, M.floorDark);
    floorInset.receiveShadow = true;
    for (let i = 0; i < 5; i++) {
      addBox((inner + outer) / 2, .035, bay.z - 2.5 + i * 1.25, 4.8, .035, .025, i === 0 ? M.amber : M.trim);
    }
  }
  // Spine ribs, floor guidance and repeating ceiling luminaires give depth without hiding landmarks.
  for (let z = 1; z >= -44; z -= 2.6) {
    addBox(-4.04, 2.13, z, .12, 4.26, .16, M.trim);
    addBox(4.04, 2.13, z, .12, 4.26, .16, M.trim);
    addBox(0, 4.13, z, 1.1, .1, .68, z < -25 ? M.amber : M.cyan, { emissive: true, base: .7 });
    addBox(-3.68, .025, z, .08, .035, .9, M.mint, { emissive: true, base: .65 });
    addBox(3.68, .025, z, .08, .035, .9, M.mint, { emissive: true, base: .65 });
  }
  for (let i = 0; i < 12; i++) {
    const z = -1.5 - i * 3.65;
    addBox(-3.68, 3.82, z, .055, .045, 2.3, M.trim);
    addBox(3.68, 3.82, z, .055, .045, 2.3, M.trim);
  }
  // Numbered bulkheads physically seal the spine until their associated objective is complete.
  for (const gate of [{ z: -16.3, stage: 1, label: 'BULKHEAD A' }, { z: -27.2, stage: 2, label: 'BULKHEAD B' }, { z: -42.2, stage: 3, label: 'EXTRACTION SPINE' }]) {
    gate.mesh = new THREE.Group(); world.add(gate.mesh);
    const door = addBox(0, 2.05, gate.z, 7.75, 3.95, .2, M.wallDark, { parent: gate.mesh });
    for (let x = -3.55; x <= 3.56; x += .34) addBox(x, 2.05, gate.z - .125, .045, 3.72, .05, M.trim, { parent: gate.mesh });
    addBox(0, .14, gate.z, 7.8, .16, .48, M.trim, { parent: gate.mesh });
    addBox(0, 3.9, gate.z, 7.8, .2, .48, M.trim, { parent: gate.mesh });
    gate.mesh.userData.door = door;
    gate.closed = true;
    gate.collider = { minX: -3.9, maxX: 3.9, minZ: gate.z - .32, maxZ: gate.z + .32 };
    gate.label = gate.label;
    gate.stage = gate.stage;
    state.gates ||= [];
    state.gates.push(gate);
    colliders.push(gate.collider);
    gate.sign = addHoloText(gate.label + '  /  SEALED', -1.6, 3.42, gate.z - .19, '#ffbf81');
    addPointLight(0xff865b, .8, 8, 0, 3.3, gate.z - 1.1);
  }
  // Perimeter and terminus.
  addWall(-12.5, -24, .4, 45, M.wallDark);
  addWall(12.5, -24, .4, 45, M.wallDark);
  addWall(-2.85, -47, 2.9, .4, M.wallDark);
  addWall(2.85, -47, 2.9, .4, M.wallDark);
  // The central opening in the terminus is an extraction hatch, not a dead end.
  const hatch = new THREE.Group(); world.add(hatch);
  addBox(0, 2.25, -46.9, 2.65, 4.3, .28, M.wallDark, { parent: hatch });
  addBox(-1.45, 2.12, -46.72, .18, 4.15, .36, M.trim);
  addBox(1.45, 2.12, -46.72, .18, 4.15, .36, M.trim);
  addBox(0, 4.18, -46.72, 3.05, .18, .36, M.trim);
  addBox(0, .13, -46.72, 3.05, .18, .38, M.trim);
  for (const x of [-1.28, 1.28]) addBox(x, 2.2, -46.48, .035, 3.65, .04, M.amber, { emissive: true, base: .8 });
  state.exitDoor = { mesh: hatch, x: 0, z: -46.3, opened: false, collider: { minX: -1.34, maxX: 1.34, minZ: -47.08, maxZ: -46.72 } };
  colliders.push(state.exitDoor.collider);
  addWallSign(-3.98, -42.4, 'EXTRACTION  /  LEVEL 04', 'west');

  // Service details, conduit, warning lamps and restrained procedural grit.
  for (let i = 0; i < 110; i++) {
    const x = (seeded(i + 10) - .5) * 7.2, z = 1 - seeded(i + 120) * 46;
    const radius = .018 + seeded(i + 52) * .025;
    const screw = addCylinder(x, .006, z, radius, .012, i % 8 === 0 ? M.amber : M.trim, world, 8);
    screw.rotation.x = Math.PI / 2;
  }
  for (const z of [-5.8, -16.4, -27.2, -42.2]) {
    addBox(-3.82, 3.42, z, .09, .48, .16, M.amber, { emissive: true, base: 1 });
    addBox(3.82, 3.42, z, .09, .48, .16, M.amber, { emissive: true, base: 1 });
  }
  // First-person environmental marker rings and the campaign objective props.
  createConsole(-8.25, -10.8);
  createCipher(-8.5 + 16.85, -21.3);
  createCell('cell-a', -7.2, -30.3);
  createCell('cell-b', -10.3, -33.2);
  createCell('cell-c', 7.2, -35.2);
  createCell('cell-d', 10.3, -38.1);
  createExtractionMarker(0, -44.85);
  createThreat();
  // Entry vignette in the physical world.
  for (let i = 0; i < 6; i++) {
    const z = 1.8 - i * .36;
    addBox(0, 3.94, z, 1.4 + i * .32, .08, .14, i % 2 ? M.trim : M.cyan, { emissive: true, base: .55 });
  }
}

function makeMarker(x, z, kind, label, id) {
  const group = new THREE.Group(); group.position.set(x, 0, z); world.add(group);
  const ring = addMesh(new THREE.TorusGeometry(.68, .025, 8, 48), M.mint, 0, .08, 0, group);
  ring.rotation.x = Math.PI / 2;
  const core = addMesh(new THREE.OctahedronGeometry(.22, 1), M.cyan, 0, .72, 0, group);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x9bffbf, transparent: true, opacity: .16, depthWrite: false });
  const beam = addMesh(new THREE.CylinderGeometry(.05, .37, 1.8, 16, 1, true), beamMat, 0, 1.5, 0, group);
  const halo = addMesh(new THREE.TorusGeometry(.42, .018, 6, 32), M.mint, 0, .72, 0, group); halo.rotation.x = Math.PI / 2;
  const obj = { id, kind, label, x, z, group, ring, core, beam, halo, collected: false, phase: Math.random() * 6.28 };
  markers.push(obj); animated.push({ kind: 'marker', obj });
  return obj;
}
function createConsole(x, z) {
  const pedestal = new THREE.Group(); pedestal.position.set(x, 0, z); world.add(pedestal);
  addBox(0, .54, 0, 1.38, 1.08, .78, M.wallDark, { parent: pedestal });
  addBox(0, 1.12, -.02, 1.28, .08, .7, M.trim, { parent: pedestal });
  const screen = addBox(0, 1.46, -.24, 1.04, .53, .035, M.terminal, { parent: pedestal });
  screen.rotation.x = -.13;
  for (let i = 0; i < 5; i++) addBox(-.39 + i * .19, 1.47, -.266, .03, .23 + (i % 2) * .12, .012, i % 2 ? M.cyan : M.mint, { parent: pedestal, emissive: true, base: .75 });
  addBox(0, .09, .47, 1.6, .07, .045, M.amber, { parent: pedestal, emissive: true, base: .9 });
  const marker = makeMarker(x, z - 1.25, 'console', 'RESONANCE CONSOLE', 'console');
  interactables.push(marker);
  addHoloText('RESONANCE / PRIMARY', x - 1.5, 2.28, z - .28, '#b9ff81');
  addPointLight(0x67e3a1, 2, 7, x, 2.3, z);
}
function createCipher(x, z) {
  const model = new THREE.Group(); model.position.set(x, 0, z); world.add(model);
  addBox(0, .76, 0, 2.0, 1.52, .86, M.wallDark, { parent: model });
  addBox(0, 1.59, -.1, 1.82, .08, .7, M.trim, { parent: model });
  const screen = addBox(0, 2.02, -.37, 1.55, .76, .055, M.terminal, { parent: model }); screen.rotation.x = -.14;
  for (let i = 0; i < 3; i++) {
    const dial = addMesh(new THREE.TorusGeometry(.19, .025, 8, 32), i === 1 ? M.cyan : M.mint, -.49 + i * .49, 2.03, -.415, model);
    dial.rotation.x = -.14;
    const center = addCylinder(-.49 + i * .49, 2.03, -.42, .04, .02, M.amber, model, 12);
    center.rotation.x = Math.PI / 2;
  }
  const marker = makeMarker(x, z - 1.55, 'cipher', 'HISTOGRAM CALIBRATION ARRAY', 'cipher');
  interactables.push(marker);
  addHoloText('CIPHER ARRAY / 38 - 62 - 46', x - 2.2, 2.8, z - .45, '#84e4e6');
  addPointLight(0x78dcde, 2, 8, x, 2.9, z);
}
function createCell(id, x, z) {
  const group = new THREE.Group(); group.position.set(x, .95, z); world.add(group);
  const core = addMesh(new THREE.CylinderGeometry(.16, .2, .75, 8), M.cyan, 0, 0, 0, group);
  core.rotation.z = Math.PI / 2;
  const endA = addMesh(new THREE.SphereGeometry(.18, 12, 10), M.mint, -.37, 0, 0, group);
  const endB = addMesh(new THREE.SphereGeometry(.18, 12, 10), M.mint, .37, 0, 0, group);
  const cage = addMesh(new THREE.TorusGeometry(.42, .025, 8, 36), M.trim, 0, 0, 0, group); cage.rotation.y = Math.PI / 2;
  const light = new THREE.PointLight(0x78f7cc, 1.1, 4); light.position.set(x, 1, z); scene.add(light);
  const marker = makeMarker(x, z - .8, 'cell', 'CRYO-CELL', id);
  marker.prop = group; marker.glow = light; marker.collected = false; marker.parts = [core, endA, endB, cage];
  interactables.push(marker);
}
function createExtractionMarker(x, z) {
  const group = new THREE.Group(); group.position.set(x, 0, z); world.add(group);
  addBox(0, .18, 0, 2.8, .22, 1.4, M.wallDark, { parent: group });
  const ring = addMesh(new THREE.TorusGeometry(1.08, .055, 12, 64), M.cyan, 0, 1.56, -.1, group);
  ring.rotation.x = Math.PI / 2;
  addMesh(new THREE.TorusGeometry(.78, .025, 8, 48), M.mint, 0, 1.56, -.08, group).rotation.x = Math.PI / 2;
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * Math.PI * 2;
    addBox(Math.cos(angle) * 1.34, .12, Math.sin(angle) * .67, .11, .18, .11, i % 2 ? M.trim : M.cyan, { parent: group, emissive: i % 2 === 0, base: .7 });
  }
  const marker = makeMarker(x, z, 'extraction', 'EXTRACTION HATCH', 'extraction');
  interactables.push(marker);
  addHoloText('AEGIS / EXTRACTION', -1.4, 3.3, z - .2, '#8fe4e3');
  addPointLight(0x75ded6, 2, 9, 0, 2.8, z);
}
function createThreat() {
  const g = new THREE.Group(); g.position.set(0, 0, -34); scene.add(g);
  const dark = new THREE.MeshStandardMaterial({ color: 0x090e12, roughness: .3, metalness: .22, emissive: 0x151b23, emissiveIntensity: .55 });
  const body = addMesh(new THREE.CapsuleGeometry(.37, 1.1, 5, 8), dark, 0, 1.08, 0, g); body.rotation.x = -.12;
  const head = addMesh(new THREE.SphereGeometry(.3, 16, 12), dark, 0, 1.92, -.06, g); head.scale.set(.82, 1.12, .86);
  for (const side of [-1, 1]) {
    const arm = addMesh(new THREE.CapsuleGeometry(.12, .7, 4, 6), dark, side * .42, 1.15, -.02, g); arm.rotation.z = side * -.18;
    const eye = addBox(side * .105, 1.98, -.32, .085, .025, .025, M.red, { parent: g, emissive: true, base: 1 });
    eye.material = M.red;
  }
  const haze = addMesh(new THREE.SphereGeometry(.78, 14, 10), new THREE.MeshBasicMaterial({ color: 0x7e9fa2, transparent: true, opacity: .065, depthWrite: false }), 0, 1.25, 0, g);
  state.threat.group = g; state.threat.haze = haze;
  const lamp = addPointLight(0xff5267, .55, 6, 0, 1.9, -34);
  state.threat.light = lamp;
  g.visible = false;
}

buildFacility();

const lenses = [
  'Unaided spectrum · no battery drain',
  'Edge lens · traces the route and exposes hidden signals',
  'Histogram lens · tune the cipher array to 38 / 62 / 46',
  'HOG tracking · locate the Null-Stalker through interference',
  'SIFT mapping · align the fracture at the extraction ring',
];
const lensModes = [...document.querySelectorAll('.mode-button')];
function setMode(mode, announce = true) {
  mode = clamp(mode, 0, 4);
  if (mode && state.battery <= 0) { showToast('VISOR CHARGE DEPLETED · RECHARGE IN NATURAL MODE'); return; }
  const previous = state.mode; state.mode = mode;
  lensModes.forEach((button, index) => button.classList.toggle('active', index === mode));
  ui.modeDescription.textContent = lenses[mode];
  ui.modeDrain.textContent = mode === 0 ? 'LIVE' : `${['', 'EDGE', 'HISTO', 'TRACK', 'MAP'][mode]} / ${state.battery.toFixed(0)}%`;
  ui.histogram.classList.toggle('hidden', mode !== 2);
  ui.sift.classList.toggle('hidden', mode !== 4 || state.stage < 3);
  $('overlay-canvas').style.opacity = mode === 1 ? '.88' : mode === 3 ? '.92' : mode === 4 ? '.72' : '0';
  if (mode !== previous && announce) { playTone(mode === 0 ? 210 : 490, .065, .035); }
}

const overlay = $('overlay-canvas');
const overlayCtx = overlay.getContext('2d');
function resizeOverlay() { overlay.width = Math.floor(innerWidth * Math.min(devicePixelRatio || 1, 1.5)); overlay.height = Math.floor(innerHeight * Math.min(devicePixelRatio || 1, 1.5)); }
resizeOverlay();
function drawVisionOverlay() {
  const w = overlay.width, h = overlay.height;
  overlayCtx.clearRect(0, 0, w, h);
  if (!state.started || state.paused) return;
  const scale = Math.min(devicePixelRatio || 1, 1.5);
  const cx = w / 2, cy = h / 2;
  if (state.mode === 1) {
    const pulse = .5 + .5 * Math.sin(state.elapsed * 2.4);
    overlayCtx.strokeStyle = `rgba(161,255,190,${.28 + pulse * .22})`;
    overlayCtx.lineWidth = 1.2 * scale;
    overlayCtx.beginPath(); overlayCtx.arc(cx, cy, (22 + pulse * 4) * scale, 0, Math.PI * 2); overlayCtx.stroke();
    overlayCtx.strokeStyle = 'rgba(164,255,198,.12)';
    for (let i = 1; i <= 3; i++) { overlayCtx.beginPath(); overlayCtx.arc(cx, cy, i * 36 * scale, 0, Math.PI * 2); overlayCtx.stroke(); }
    const target = activeTarget();
    if (target) {
      const dist = Math.hypot(target.x - player.x, target.z - player.z);
      overlayCtx.fillStyle = 'rgba(177,255,199,.7)'; overlayCtx.font = `${8 * scale}px monospace`;
      overlayCtx.fillText(`${target.label}  /  ${dist.toFixed(0)} M`, 22 * scale, h - 30 * scale);
    }
  } else if (state.mode === 3 && state.threatActive) {
    const dx = state.threat.x - player.x, dz = state.threat.z - player.z;
    const bearing = Math.atan2(-dx, -dz) - player.yaw;
    const distance = Math.hypot(dx, dz);
    const x = cx + clamp(Math.sin(bearing), -1, 1) * w * .39;
    const y = cy - clamp(Math.cos(bearing), -1, 1) * h * .18;
    overlayCtx.save(); overlayCtx.translate(x, y); overlayCtx.rotate(bearing);
    overlayCtx.fillStyle = `rgba(255,92,105,${.56 + .32 * Math.sin(state.elapsed * 7)})`;
    overlayCtx.beginPath(); overlayCtx.moveTo(0, -15 * scale); overlayCtx.lineTo(-8 * scale, 5 * scale); overlayCtx.lineTo(8 * scale, 5 * scale); overlayCtx.closePath(); overlayCtx.fill(); overlayCtx.restore();
    overlayCtx.fillStyle = 'rgba(255,153,156,.88)'; overlayCtx.font = `${8 * scale}px monospace`;
    overlayCtx.fillText(`ANOMALY  ${distance.toFixed(0)} M`, x + 12 * scale, y + 4 * scale);
  } else if (state.mode === 4 && state.stage >= 3) {
    overlayCtx.strokeStyle = `rgba(122,224,228,${.24 + .1 * Math.sin(state.elapsed * 1.4)})`;
    overlayCtx.lineWidth = scale;
    for (let i = -4; i <= 4; i++) {
      overlayCtx.beginPath(); overlayCtx.moveTo(cx + i * 42 * scale, cy - 110 * scale); overlayCtx.lineTo(cx + i * 42 * scale, cy + 110 * scale); overlayCtx.stroke();
    }
    overlayCtx.beginPath(); overlayCtx.moveTo(cx - 180 * scale, cy); overlayCtx.lineTo(cx + 180 * scale, cy); overlayCtx.stroke();
  }
}

function activeTarget() {
  if (!state.started || state.finished) return null;
  if (state.stage === 0) return interactables.find((t) => t.id === 'console');
  if (state.stage === 1) return interactables.find((t) => t.id === 'cipher');
  if (state.stage === 2) return interactables.find((t) => t.kind === 'cell' && !state.cells.has(t.id));
  if (state.stage === 3 && !state.siftDone) return interactables.find((t) => t.id === 'extraction');
  if (state.stage === 3 && state.siftDone) return interactables.find((t) => t.id === 'extraction');
  return null;
}
function distanceTo(target) { return Math.hypot(target.x - player.x, target.z - player.z); }
function currentZone() {
  if (player.z > -5) return 'ENTRY VESTIBULE';
  if (player.z > -16.3) return player.x < -4.3 ? 'RESONANCE BAY' : 'WEST SERVICE SPINE';
  if (player.z > -27.2) return player.x > 4.3 ? 'OPTICS LABORATORY' : 'CALIBRATION SPINE';
  if (player.z > -42.2) return player.x < -4.3 ? 'CRYO VAULT / A' : player.x > 4.3 ? 'CRYO VAULT / B' : 'CRYO TRANSIT';
  return player.z > -46.3 ? 'EXTRACTION SPINE' : 'AEGIS AIRLOCK';
}
function updateMission() {
  const data = [
    ['01 / 04', 'Find the resonance console', 'Use the Edge lens to separate true geometry from the facility’s lie.', 'WEST RESONANCE BAY · 9 M', 9],
    ['02 / 04', 'Reconstruct the cipher', 'Tune the live histogram channels to the reference window: 38 / 62 / 46.', 'EAST OPTICS LAB · 21 M', 27],
    ['03 / 04', 'Recover the cryo-cells', 'Four canisters remain. HOG tracking can locate the thing moving in the dark.', `CRYO VAULTS · ${4 - state.cells.size} REMAINING`, 48 + state.cells.size * 10],
    ['04 / 04', state.siftDone ? 'Reach the extraction hatch' : 'Anchor the fractured signal', state.siftDone ? 'The reference is stable. Reach the hatch and extract before the signal degrades.' : 'Stand in the marked ring. Turn toward the reference wall until both constellations converge.', 'AEGIS AIRLOCK · 47 M', state.siftDone ? 94 : 80],
  ];
  const [step, title, copy, location, progress] = data[Math.min(state.stage, 3)];
  ui.objectiveStep.textContent = step; ui.objectiveTitle.textContent = title; ui.objectiveCopy.textContent = copy;
  ui.objectiveLocation.textContent = location; ui.objectiveProgress.style.width = `${progress}%`;
  ui.zone.textContent = currentZone();
  ui.depth.textContent = `DEPTH ${String(Math.round(Math.max(1, -player.z * 1.18 + 1))).padStart(3, '0')} M`;
}
function showToast(message) {
  if (!ui.toast) return;
  if (lastToast === message && performance.now() < state.toastUntil) return;
  lastToast = message; state.toastUntil = performance.now() + 2500;
  ui.toast.querySelector('span').textContent = message;
  ui.toast.classList.remove('hidden'); ui.toast.classList.add('show');
  window.setTimeout(() => { if (performance.now() >= state.toastUntil) ui.toast.classList.add('hidden'); }, 2700);
}
function playTone(frequency = 440, duration = .09, volume = .045, shape = 'sine') {
  if (!audio || audio.ctx.state !== 'running') return;
  const now = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator(); const gain = audio.ctx.createGain();
  osc.type = shape; osc.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  osc.connect(gain); gain.connect(audio.effects); osc.start(now); osc.stop(now + duration + .02);
}
function startAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    const ctx = new Audio(); const master = ctx.createGain(); master.gain.value = .12; master.connect(ctx.destination);
    const effects = ctx.createGain(); effects.gain.value = .45; effects.connect(master);
    const osc = ctx.createOscillator(); const filter = ctx.createBiquadFilter(); const droneGain = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = 42; filter.type = 'lowpass'; filter.frequency.value = 110; droneGain.gain.value = .14;
    osc.connect(filter); filter.connect(droneGain); droneGain.connect(master); osc.start();
    const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain(); lfo.frequency.value = .08; lfoGain.gain.value = 8; lfo.connect(lfoGain); lfoGain.connect(osc.frequency); lfo.start();
    audio = { ctx, effects, master, osc, droneGain };
    if (ctx.state === 'suspended') ctx.resume();
  } catch { audio = null; }
}
function startGame() {
  if (state.started && !state.paused) return;
  if (state.finished) resetGame();
  state.started = true; state.paused = false;
  ui.title.classList.add('hidden'); ui.pause.classList.add('hidden'); ui.ending.classList.add('hidden'); ui.game.classList.remove('hidden');
  startAudio(); setMode(state.mode, false); updateMission();
  try { $('game').requestPointerLock?.(); } catch { /* Drag-look remains available. */ }
  clock.getDelta();
}
function pauseGame() {
  if (!state.started || state.finished || state.paused) return;
  state.paused = true; ui.pause.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  if (audio) audio.master.gain.setTargetAtTime(.04, audio.ctx.currentTime, .25);
}
function resumeGame() {
  if (!state.started || !state.paused) return;
  state.paused = false; ui.pause.classList.add('hidden');
  if (audio) audio.master.gain.setTargetAtTime(.12, audio.ctx.currentTime, .35);
  try { $('game').requestPointerLock?.(); } catch { /* Ignore denied pointer lock. */ }
}
function resetGame() {
  state.started = false; state.paused = false; state.finished = false; state.stage = 0; state.mode = 0;
  state.battery = 100; state.sanity = 100; state.cells.clear(); state.desyncs = 0; state.elapsed = 0;
  state.noise = 0; state.crouched = false; state.sprinting = false; state.threatActive = false;
  state.calibrationDone = false; state.siftDone = false; state.alignment = 0; state.lastDamage = 0;
  player.x = 0; player.z = .35; player.yaw = 0; player.pitch = 0; player.crouched = false;
  player.checkpoint = { x: 0, z: .35, name: 'ENTRY BAY' };
  state.threat.x = 0; state.threat.z = -34; state.threat.group.visible = false;
  for (const cell of interactables.filter((t) => t.kind === 'cell')) {
    cell.collected = false; cell.group.visible = true; cell.prop.visible = true; cell.glow.visible = true;
    cell.group.position.y = 0; cell.parts?.forEach((part) => { part.visible = true; });
  }
  for (const gate of state.gates) {
    gate.closed = true; gate.mesh.position.y = 0;
    gate.collider.minZ = gate.z - .32; gate.collider.maxZ = gate.z + .32;
    if (!colliders.includes(gate.collider)) colliders.push(gate.collider);
    gate.sign.visible = true;
  }
  if (state.exitDoor) {
    state.exitDoor.opened = false; state.exitDoor.mesh.position.y = 0;
    if (!colliders.includes(state.exitDoor.collider)) colliders.push(state.exitDoor.collider);
  }
  ui.shadow.value = 30; ui.mid.value = 50; ui.high.value = 70; updateSliderLabels();
  setMode(0, false); ui.ending.classList.add('hidden'); ui.title.classList.remove('hidden'); ui.game.classList.add('hidden');
}
function restartCheckpoint() {
  player.x = player.checkpoint.x; player.z = player.checkpoint.z;
  state.sanity = Math.max(65, state.sanity); state.battery = Math.max(45, state.battery);
  state.threat.x = 0; state.threat.z = -34; state.lastDamage = 0;
  state.rebootUntil = 0; ui.reboot.classList.add('hidden');
  state.paused = false; ui.pause.classList.add('hidden'); showToast(`CHECKPOINT RESTORED · ${player.checkpoint.name}`);
  if (document.pointerLockElement) document.exitPointerLock();
  try { $('game').requestPointerLock?.(); } catch { /* Drag-look remains available. */ }
}
function completeStage(stage) {
  state.stage = Math.max(state.stage, stage);
  ui.sift.classList.toggle('hidden', state.mode !== 4 || state.stage < 3);
  const checkpoint = [null, { x: -6.5, z: -10.8, name: 'RESONANCE BAY' }, { x: 6.2, z: -21.3, name: 'OPTICS LABORATORY' }, { x: 0, z: -29.2, name: 'CRYO TRANSIT' }][stage];
  if (checkpoint) { player.checkpoint = checkpoint; ui.checkpoint.textContent = `CHECKPOINT: ${checkpoint.name}`; }
  playTone(620, .16, .07); window.setTimeout(() => playTone(820, .2, .055), 100);
  updateMission();
}
function updateSliderLabels() {
  ui.shadowVal.textContent = ui.shadow.value; ui.midVal.textContent = ui.mid.value; ui.highVal.textContent = ui.high.value;
  drawHistogram();
}
function drawHistogram() {
  const canvas = ui.histogramCanvas; if (!canvas) return;
  const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(3,10,11,.72)'; ctx.fillRect(0, 0, w, h);
  for (let y = 1; y < 5; y++) { ctx.strokeStyle = 'rgba(196,241,224,.08)'; ctx.beginPath(); ctx.moveTo(0, y * h / 5); ctx.lineTo(w, y * h / 5); ctx.stroke(); }
  const channels = [
    { value: Number(ui.shadow.value), color: 'rgba(169,255,185,.82)', target: 38 },
    { value: Number(ui.mid.value), color: 'rgba(104,219,221,.72)', target: 62 },
    { value: Number(ui.high.value), color: 'rgba(255,190,123,.74)', target: 46 },
  ];
  channels.forEach((channel, index) => {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const center = channel.value / 100 * w;
      const target = channel.target / 100 * w;
      const mean = lerp(center, target, .15);
      const spread = 28 + index * 7;
      const signal = Math.exp(-((x - mean) ** 2) / (spread * spread)) * (.64 - index * .08);
      const noise = .018 + .015 * Math.sin(x * .07 + index * 2);
      const y = h - (signal + noise) * h * 1.15;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = channel.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = channel.color; ctx.fillRect(channel.target / 100 * w - 1, 0, 2, h);
  });
}
function calibrateCipher() {
  if (state.stage !== 1) { showToast('CIPHER ARRAY NOT YET ACCESSIBLE'); return; }
  const values = [Number(ui.shadow.value), Number(ui.mid.value), Number(ui.high.value)];
  const target = [38, 62, 46];
  const accurate = values.every((value, i) => Math.abs(value - target[i]) <= 2);
  if (!accurate) {
    ui.calibrationStatus.classList.remove('success');
    ui.calibrationStatus.innerHTML = '<i></i> CHANNELS OUT OF PHASE · ADJUST TO REFERENCE';
    showToast('CALIBRATION REJECTED · MATCH ALL THREE CHANNELS'); playTone(170, .18, .05, 'square');
    return;
  }
  state.calibrationDone = true; ui.calibrationStatus.classList.add('success');
  ui.calibrationStatus.innerHTML = '<i></i> SIGNAL NORMALIZED · BULKHEAD B OPEN';
  showToast('CIPHER RECONSTRUCTED · CRYO VAULTS UNSEALED');
  completeStage(2);
}
function updateCalibrationReadout() {
  const values = [Number(ui.shadow.value), Number(ui.mid.value), Number(ui.high.value)];
  const target = [38, 62, 46];
  const out = values.reduce((sum, value, i) => sum + (Math.abs(value - target[i]) > 2 ? 1 : 0), 0);
  if (state.calibrationDone) return;
  ui.calibrationStatus.classList.toggle('success', out === 0);
  ui.calibrationStatus.innerHTML = `<i></i> ${out === 0 ? 'REFERENCE WINDOW MATCHED' : `${out} CHANNEL${out === 1 ? '' : 'S'} OUT OF RANGE`}`;
}
function alignSignal() {
  if (state.stage !== 3 || state.siftDone) return;
  if (state.mode !== 4) { showToast('ACTIVATE THE SIFT MAPPING LENS FIRST'); return; }
  if (distanceTo({ x: 0, z: -44.85 }) > 3.1) { showToast('MOVE INTO THE MARKED REFERENCE RING'); return; }
  if (state.alignment < 86) { showToast('ALIGNMENT BELOW LOCK THRESHOLD · ADJUST YOUR VIEW'); playTone(180, .14, .04, 'square'); return; }
  state.siftDone = true; ui.alignmentHint.textContent = 'REFERENCE LOCKED · EXTRACTION AVAILABLE';
  colliders.splice(colliders.indexOf(state.exitDoor.collider), 1);
  showToast('SPATIAL FRACTURE ANCHORED · REACH THE HATCH');
  state.exitDoor.opened = true; state.exitDoor.mesh.position.y = 4.35;
  completeStage(3);
}
function extract() {
  if (state.stage < 3 || !state.siftDone) { showToast('EXTRACTION LOCKED · ANCHOR THE SIGNAL FIRST'); return; }
  if (distanceTo({ x: 0, z: -46.3 }) > 3.2) { showToast('MOVE CLOSER TO THE EXTRACTION HATCH'); return; }
  state.finished = true; state.paused = false;
  if (document.pointerLockElement) document.exitPointerLock();
  ui.game.classList.add('hidden'); ui.ending.classList.remove('hidden');
  const seconds = Math.floor(state.elapsed), mins = Math.floor(seconds / 60);
  ui.debriefTime.textContent = `${String(mins).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  ui.debriefCells.textContent = `${state.cells.size} / 4`; ui.debriefDesync.textContent = `${state.desyncs}`;
  ui.endingSummary.textContent = state.desyncs === 0 ? 'No one else made it out. You did. The Aegis signal is silent.' : 'You escaped the Aegis facility with the signal intact. The Null-Stalker is contained—for now.';
  playTone(740, .35, .07); window.setTimeout(() => playTone(990, .45, .05), 200);
}
function interact() {
  if (!state.started || state.paused || state.finished || state.rebootUntil > performance.now()) return;
  const target = activeTarget();
  if (!target || distanceTo(target) > (target.kind === 'cell' ? 2.45 : 2.8)) return;
  if (target.id === 'console') {
    if (state.mode !== 1) { showToast('EDGE LENS REQUIRED · PRESS 2'); return; }
    showToast('RESONANCE MAP RESTORED · THE NULL-STALKER IS AWAKE');
    state.threatActive = true; state.threat.group.visible = true;
    state.threat.x = 0; state.threat.z = -34; completeStage(1);
  } else if (target.id === 'cipher') {
    if (state.mode !== 2) { showToast('HISTOGRAM LENS REQUIRED · PRESS 3'); return; }
    ui.histogram.classList.remove('hidden'); showToast('CIPHER ARRAY LIVE · MATCH THE REFERENCE CHANNELS');
  } else if (target.kind === 'cell') {
    state.cells.add(target.id); target.collected = true; target.group.visible = false; target.prop.visible = false; target.glow.visible = false;
    target.parts?.forEach((part) => { part.visible = false; });
    showToast(`CRYO-CELL RECOVERED · ${state.cells.size} / 4`); playTone(540, .11, .055);
    if (state.cells.size === 4) { completeStage(3); showToast('ALL CRYO-CELLS RECOVERED · EXTRACTION SPINE OPEN'); }
    else updateMission();
  } else if (target.id === 'extraction') {
    if (!state.siftDone) { alignSignal(); return; }
    extract();
  }
}

function isBlocked(x, z, radius = .36) {
  for (const box of colliders) {
    const cx = clamp(x, box.minX, box.maxX), cz = clamp(z, box.minZ, box.maxZ);
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius ** 2) return true;
  }
  return false;
}
function moveCircle(actor, dx, dz, radius = .36) {
  const nx = actor.x + dx;
  if (!isBlocked(nx, actor.z, radius)) actor.x = nx;
  const nz = actor.z + dz;
  if (!isBlocked(actor.x, nz, radius)) actor.z = nz;
}
function nearestUsable() {
  const target = activeTarget();
  if (!target) return null;
  const distance = distanceTo(target);
  if (distance > (target.kind === 'cell' ? 2.7 : 3.25)) return null;
  return { target, distance };
}
function updateInteractionPrompt() {
  const found = nearestUsable();
  if (!found) { ui.prompt.classList.add('hidden'); ui.focus.classList.add('hidden'); $('game').style.cursor = 'none'; return; }
  ui.prompt.classList.remove('hidden'); ui.focus.classList.remove('hidden');
  let action = 'INTERACT';
  if (found.target.id === 'console') action = state.mode === 1 ? 'RESTORE RESONANCE MAP' : 'EDGE LENS REQUIRED · PRESS 2';
  else if (found.target.id === 'cipher') action = state.mode === 2 ? 'OPEN CALIBRATION ARRAY' : 'HISTOGRAM LENS REQUIRED · PRESS 3';
  else if (found.target.kind === 'cell') action = `RECOVER CRYO-CELL · ${state.cells.size + 1} / 4`;
  else if (found.target.id === 'extraction') action = state.siftDone ? 'INITIATE EXTRACTION' : state.alignment >= 86 ? 'LOCK SPATIAL REFERENCE' : 'ALIGN REFERENCE · SIFT';
  ui.promptCopy.textContent = action; ui.focus.textContent = found.target.label;
}
function updateThreat(dt) {
  if (!state.threatActive || !state.threat.group.visible) return;
  const dx = player.x - state.threat.x, dz = player.z - state.threat.z;
  const dist = Math.hypot(dx, dz);
  const speed = state.crouched ? .76 : state.noise > .45 ? 1.75 : 1.14;
  const mx = dx / Math.max(.01, dist) * speed * dt, mz = dz / Math.max(.01, dist) * speed * dt;
  moveCircle(state.threat, mx, mz, .48);
  state.threat.x = clamp(state.threat.x, -3.45, 3.45);
  state.threat.z = clamp(state.threat.z, -45.5, -2.5);
  state.threat.group.position.set(state.threat.x, 0, state.threat.z);
  state.threat.group.rotation.y = Math.atan2(-dx, -dz);
  state.threat.wobble += dt;
  state.threat.group.children[0].position.y = 1.08 + Math.sin(state.threat.wobble * 4.1) * .045;
  state.threat.haze.material.opacity = .045 + Math.sin(state.elapsed * 2.2) * .018;
  state.threat.light.position.set(state.threat.x, 1.9, state.threat.z);
  const danger = dist < 5.2;
  ui.threatCard.classList.toggle('active', danger);
  ui.threatState.textContent = danger ? `CONTACT · ${dist.toFixed(0)} M` : state.threatActive ? 'SIGNAL MOVING' : 'NO RETURN';
  if (dist < 2.25) {
    state.sanity = Math.max(0, state.sanity - (state.crouched ? 6 : 12) * dt);
    if (dist < 1.28 && performance.now() - state.lastDamage > 2200) {
      state.lastDamage = performance.now(); state.sanity = Math.max(0, state.sanity - 24); state.desyncs++;
      showToast('DESYNC EVENT · BREAK LINE OF SIGHT OR CROUCH'); playTone(92, .4, .085, 'sawtooth');
      state.threat.z = clamp(state.threat.z - 5.5, -44, -4);
    }
  } else state.sanity = Math.min(100, state.sanity + 1.5 * dt);
}
function updateAlignment() {
  if (state.stage !== 3 || state.siftDone) { state.alignment = 0; return; }
  const dx = -player.x, dz = -44.85 - player.z;
  const distance = Math.hypot(dx, dz);
  const targetYaw = Math.atan2(-dx, -dz);
  const delta = Math.atan2(Math.sin(targetYaw - player.yaw), Math.cos(targetYaw - player.yaw));
  const positionScore = clamp(1 - Math.max(0, distance - 1.05) / 2.5, 0, 1);
  const viewScore = clamp(1 - Math.abs(delta) / .6, 0, 1);
  state.alignment = Math.round(positionScore * viewScore * 100);
  ui.alignment.textContent = String(state.alignment).padStart(2, '0');
  ui.alignmentMeter.style.width = `${state.alignment}%`;
  ui.alignmentHint.textContent = distance > 3.2 ? 'POSITION: SEEKING' : state.alignment > 85 ? 'REFERENCE: READY TO LOCK' : Math.abs(delta) > .12 ? 'ROTATE TO CONVERGE' : 'MOVE CLOSER TO THE RING';
  const markersEl = $('sift-markers');
  markersEl.style.transform = `translateX(${clamp(delta * 7, -8, 8)}px)`;
}
function respawnDesync(now) {
  if (state.sanity > 0 || state.rebootUntil) return;
  state.desyncs++; state.rebootStart = now; state.rebootUntil = now + 4200;
  state.sanity = 55; player.x = player.checkpoint.x; player.z = player.checkpoint.z;
  state.threat.x = 0; state.threat.z = -34;
  ui.reboot.classList.remove('hidden'); playTone(72, .55, .08, 'sawtooth');
}
function movePlayer(dt) {
  const forward = (keys.has('KeyW') || keys.has('ArrowUp') || keys.has('touch-forward') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') || keys.has('touch-back') ? 1 : 0);
  const strafe = (keys.has('KeyD') || keys.has('ArrowRight') || keys.has('touch-right') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') || keys.has('touch-left') ? 1 : 0);
  const moving = forward !== 0 || strafe !== 0;
  const sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && moving && !state.crouched;
  const speed = state.crouched ? 1.22 : sprint ? 5.15 : 3.05;
  const mag = Math.hypot(forward, strafe) || 1;
  const f = forward / mag, s = strafe / mag;
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const dx = (-sin * f + cos * s) * speed * dt;
  const dz = (-cos * f - sin * s) * speed * dt;
  if (moving) moveCircle(player, dx, dz);
  state.sprinting = sprint;
  const targetNoise = moving ? state.crouched ? .07 : sprint ? .92 : .25 : 0;
  state.noise = lerp(state.noise, targetNoise, Math.min(1, dt * (moving ? 2.8 : 1.2)));
  if (moving && performance.now() - state.lastFoot > (sprint ? 300 : state.crouched ? 780 : 520)) {
    state.lastFoot = performance.now();
    if (!state.crouched && state.threatActive) showThreatAudioPing();
  }
  const bob = moving && !state.crouched ? Math.sin(state.elapsed * (sprint ? 13 : 9)) * (sprint ? .045 : .023) : 0;
  const eyeHeight = state.crouched ? 1.06 : 1.62;
  camera.position.set(player.x, lerp(camera.position.y, eyeHeight + bob, Math.min(1, dt * 8)), player.z);
  camera.rotation.order = 'YXZ'; camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
  if (moving && state.started && !state.paused) {
    const stepFreq = sprint ? 62 : 48;
    if (performance.now() - state.lastStep > (sprint ? 300 : 490)) { playTone(stepFreq + seeded(Math.floor(state.elapsed * 10)) * 9, .045, sprint ? .022 : .012, 'triangle'); state.lastStep = performance.now(); }
  }
}
function showThreatAudioPing() {
  if (state.mode === 3 && state.noise > .75) ui.threatState.textContent = 'SOUND TRACE · CLOSING';
}
function updateVisor(dt) {
  if (state.mode !== 0) {
    state.battery = Math.max(0, state.battery - dt * (state.mode === 3 ? .35 : .4));
    if (state.battery <= 0) { state.battery = 0; setMode(0, false); showToast('VISOR RECHARGING · NATURAL MODE RESTORED'); }
  } else state.battery = Math.min(100, state.battery + dt * .83);
  if (state.battery < 18) { ui.batteryMeter.style.background = '#ff9c73'; ui.batteryState.textContent = 'LOW RESERVE · RETURN TO NATURAL MODE'; }
  else { ui.batteryMeter.style.background = ''; ui.batteryState.textContent = state.mode === 0 ? 'NOMINAL · PASSIVE RECHARGE' : 'ACTIVE OPTICAL ARRAY'; }
  ui.batteryNumber.textContent = `${Math.round(state.battery)}%`; ui.batteryMeter.style.width = `${state.battery}%`;
  ui.sanityNumber.textContent = `${Math.round(state.sanity)}%`; ui.sanityMeter.style.width = `${state.sanity}%`;
  ui.sanityMeter.style.background = state.sanity < 35 ? '#ff806e' : '';
  ui.signalState.textContent = state.sanity < 35 ? 'CRITICAL · REALITY DESYNCHRONIZING' : state.desyncs ? `${state.desyncs} DESYNC${state.desyncs === 1 ? '' : 'S'} RECORDED` : 'NO ACTIVE DESYNC';
}
function updateWorld(dt) {
  for (const gate of state.gates) {
    const open = state.stage >= gate.stage;
    const targetY = open ? 4.35 : 0;
    gate.mesh.position.y = lerp(gate.mesh.position.y, targetY, Math.min(1, dt * 2.3));
    if (open && gate.closed) {
      gate.closed = false; colliders.splice(colliders.indexOf(gate.collider), 1);
      gate.sign.visible = false;
    }
  }
  for (const item of animated) {
    if (item.kind === 'glow') item.obj.material.emissiveIntensity = item.base * (.8 + Math.sin(state.elapsed * 2.3 + item.phase) * .14);
    if (item.kind === 'marker') {
      const target = item.obj;
      const active = activeTarget()?.id === target.id;
      target.group.visible = !target.collected && (active || state.mode === 1 || state.mode === 3 || state.mode === 4);
      target.group.position.y = Math.sin(state.elapsed * 1.7 + target.phase) * .07;
      target.core.rotation.y += dt * 1.1; target.halo.rotation.z += dt * .75;
      const glow = state.mode === 1 || active;
      target.beam.material.opacity = glow ? .2 : .1;
      target.ring.material = glow ? M.mint : M.trim;
    }
  }
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, clock.getDelta());
  const now = performance.now();
  fpsFrames++; fpsElapsed += dt;
  if (fpsElapsed > .5) { currentFps = Math.round(fpsFrames / fpsElapsed); fpsFrames = 0; fpsElapsed = 0; ui.fps.textContent = `${currentFps} HZ`; }
  if (state.started && !state.paused && !state.finished) {
    state.elapsed += dt;
    if (state.rebootUntil && now < state.rebootUntil) {
      const remaining = state.rebootUntil - now;
      ui.rebootCount.textContent = (remaining / 1000).toFixed(1);
      ui.rebootBar.style.width = `${100 - remaining / 4200 * 100}%`;
    } else if (state.rebootUntil) { state.rebootUntil = 0; ui.reboot.classList.add('hidden'); }
    if (!state.rebootUntil) {
      movePlayer(dt); updateThreat(dt); updateAlignment(); updateVisor(dt); respawnDesync(now);
      updateInteractionPrompt();
      ui.clock.textContent = `${String(Math.floor(state.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`;
      updateMission();
    }
  }
  updateWorld(dt); drawVisionOverlay(); renderer.render(scene, camera);
}
requestAnimationFrame(frame);

$('start-button').addEventListener('click', startGame);
ui.pauseButton.addEventListener('click', pauseGame);
ui.resume.addEventListener('click', resumeGame);
ui.restart.addEventListener('click', restartCheckpoint);
ui.playAgain.addEventListener('click', resetGame);
ui.calibrate.addEventListener('click', calibrateCipher);
$('hist-close').addEventListener('click', () => { ui.histogram.classList.add('hidden'); setMode(0); });
for (const slider of [ui.shadow, ui.mid, ui.high]) slider.addEventListener('input', () => { updateSliderLabels(); updateCalibrationReadout(); });
lensModes.forEach((button) => button.addEventListener('click', () => setMode(Number(button.dataset.mode))));
$('controls-open').addEventListener('click', () => ui.controls.classList.remove('hidden'));
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(button.dataset.close).classList.add('hidden')));
ui.touchInteract?.addEventListener('pointerdown', (event) => { event.preventDefault(); interact(); });
document.querySelectorAll('[data-move]').forEach((button) => {
  const key = `touch-${button.dataset.move}`;
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); keys.add(key); });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(eventName, () => keys.delete(key));
});

window.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  keys.add(event.code);
  if (event.code.startsWith('Digit') && Number(event.code.slice(5)) >= 1 && Number(event.code.slice(5)) <= 5) setMode(Number(event.code.slice(5)) - 1);
  if (event.code === 'KeyE' || event.code === 'Space') { event.preventDefault(); if (state.stage === 3 && state.mode === 4 && state.alignment > 86 && !state.siftDone) alignSignal(); else interact(); }
  if (event.code === 'KeyC') { state.crouched = !state.crouched; player.crouched = state.crouched; showToast(state.crouched ? 'CROUCH · FOOTSTEPS SUPPRESSED' : 'STANDING · MOVE QUIETLY'); }
  if (event.code === 'Escape' && !state.paused && state.started && !state.finished) { if (!document.pointerLockElement) pauseGame(); }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); if (state.started && !state.paused && !state.finished) pauseGame(); });
window.addEventListener('pointerlockchange', () => {
  state.pointerLocked = document.pointerLockElement === $('game');
  if (!state.pointerLocked && state.started && !state.paused && !state.finished) pauseGame();
});
window.addEventListener('mousemove', (event) => {
  if (!state.started || state.paused || state.finished) return;
  const sensitivity = .0022;
  if (document.pointerLockElement === $('game')) {
    player.yaw -= event.movementX * sensitivity;
    player.pitch = clamp(player.pitch - event.movementY * sensitivity, -1.22, 1.22);
  } else if (event.buttons === 1 && !event.target.closest('button, input, .lens-panel, .visor-dock')) {
    if (touchLook) { player.yaw -= (event.clientX - touchLook.x) * sensitivity; player.pitch = clamp(player.pitch - (event.clientY - touchLook.y) * sensitivity, -1.22, 1.22); }
    touchLook = { x: event.clientX, y: event.clientY };
  }
});
window.addEventListener('pointerdown', (event) => {
  if (event.target === $('game')) touchLook = { x: event.clientX, y: event.clientY };
});
window.addEventListener('pointerup', () => { touchLook = null; });
$('game').addEventListener('click', () => {
  if (state.started && !state.paused && !state.pointerLocked) { try { $('game').requestPointerLock?.(); } catch { /* Drag-look remains available. */ } }
});
$('game').addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch' && touchLook && state.started && !state.paused) {
    player.yaw -= (event.clientX - touchLook.x) * .004;
    player.pitch = clamp(player.pitch - (event.clientY - touchLook.y) * .004, -1.2, 1.2);
    touchLook = { x: event.clientX, y: event.clientY };
  }
});
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65)); resizeOverlay();
});

for (const slider of [ui.shadow, ui.mid, ui.high]) slider.value = slider.defaultValue;
updateSliderLabels(); updateCalibrationReadout(); setMode(0, false);
