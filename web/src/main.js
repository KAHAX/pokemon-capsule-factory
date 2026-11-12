import { mobilePerformance } from './mobile-performance.js';
import { extendConveyor } from './extended-conveyor.js';
import { replaceMainSign } from './neon-sign.js';
import { batchChamberBalls } from './chamber-batching.js';
import { batchRigidSiblings } from './static-batching.js';
import { installNextPokemonPanel } from './next-pokemon-panel.js';
import './style.css';
import './ui-refinements.css';
import { installDebugPanel } from './debug-panel.js';
installDebugPanel();
import * as THREE from 'three';
import { createAssetLoader } from './asset-loader.js';
import { createMainScene } from './scene.js';
import { CapsuleMachine } from './machine.js';
import { FocusExperience } from './focus.js';
import { uprightBallQuaternion } from './ball-controls.js';
import { CardStore } from './cards.js';
import { findAllByKey, instantiateBall, loadManifest } from './assets.js';
import { applyBlenderLighting } from './scene-lighting.js';
import { refineSceneMaterials } from './scene-materials.js';
import { BoxInteraction } from './box-interaction.js';
import { CaptureBall } from './capture-ball.js';
import { BackgroundCompanions } from './background-companions.js';
import { PokedexPack } from './pokedex-pack.js';
import { LoadingBall } from './loading-ball.js';
import { installDreamscape } from './dreamscape/index.js';
import { enhancePokedex } from './dreamscape/pokedex-look.js';
import { applyPokedexTextures } from './pokedex-textures.js';
import { installRetroOverlay } from './dreamscape/retro-overlay.js';
import { installSound } from './dreamscape/sound.js';
import { installShowcase } from './dreamscape/showcase.js';

const $ = (selector) => document.querySelector(selector);
const loadingDetail = $('#loading-detail');
const loadingProgress = $('#loading-progress');
const machineStatus = $('#machine-status');
const spinButton = $('#spin-button');
// Start the small ball immediately, before loading the heavier factory assets.
const ballAssetReady = createAssetLoader().loadAsync('/assets/pokeball.glb');
const loadingBall = new LoadingBall($('#loading-ball-stage'), ballAssetReady);
let toastTimer;

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
}

const { scene, camera, renderer, controls, updateCamera, bloom, dreamTime, adaptResolution, prepare: prepareMainScene, needsRender: mainNeedsRender, render: renderMainScene } = createMainScene($('#machine-stage'));
const homeView = {
  position: camera.position.clone(),
  target: controls.target.clone(),
  background: scene.background.clone(),
  controls: {
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
    minAzimuthAngle: controls.minAzimuthAngle,
    maxAzimuthAngle: controls.maxAzimuthAngle,
    minPolarAngle: controls.minPolarAngle,
    maxPolarAngle: controls.maxPolarAngle,
  },
};
let cameraReturn;
const loader = createAssetLoader();
let sceneReady = false;
let chamberBatches;
let machine;
let focus;
let boxInteraction;
let captureBall;
let dreamscape;
const captureBalls = [];
let backgroundCompanions;
let pokedexPack;
let pokedexLook;
let retroOverlay;
let sound;
const miniBalls = new Map();
// Collections belong to this page session; every reload starts a fresh collection.
try { localStorage.removeItem('capsule-works-balls-v1'); } catch { /* Storage may be disabled. */ }

function setMachineStatus(status) {
  if (machineStatus) machineStatus.textContent = status;
}

function updateQueue(count, full, supply) {
  const settled = full && supply?.headReady;
  $('#queue-count').textContent = count;
  [...$('#supply-progress').children].forEach((cell, index) => cell.classList.toggle('filled', index < count));
  $('#supply-progress').setAttribute('aria-valuenow', String(count));
  $('#supply-label').textContent = settled ? '储备已满' : full ? '补位中' : '自动补给中';
  $('.status-dot').classList.toggle('full', settled);
  if (!machine?.busy && !machine?.outputs.length) setMachineStatus(settled ? '顶部已满 5 颗 · 输送带暂停' : full ? '顶部补位中' : '输送带运行中');
}

function addMiniBall(record) {
  const key = record.uid || `saved-${record.pokemonId}`;
  if (miniBalls.has(key)) return;
  miniBalls.set(key, { ...record });
  const button = document.createElement('button');
  button.className = 'mini-ball';
  button.classList.toggle('shiny', record.resultIcon === 1 || Boolean(focus?.library.entry(record.pokemonId)?.shiny));
  button.dataset.ballKey = key;
  button.title = `打开精灵球 · ${record.name || '宝可梦'}`;
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', () => focus.open(miniBalls.get(key)));
  $('#mini-collection').appendChild(button);
}

const store = new CardStore({
  onSelect: (card, prepared) => focus.openSavedCard(card, prepared),
  onOpen: () => {
    if (!focus?.active && !focusFlight) pokedexPack?.openViewer();
  },
});

// Embedded preview tabs may suspend RAF while loading. Yield without making
// scene initialization depend on a compositor frame that may never arrive.
const yieldLoadingFrame = () => new Promise(resolve => setTimeout(resolve, 16));

async function initialize() {
  let completed = 0;
  const setProgress = (value, detail = '') => {
    loadingProgress.style.width = `${value}%`;
    loadingDetail.textContent = detail || `NOW LOADING... ${value}%`;
    loadingProgress.parentElement.setAttribute('aria-valuenow', String(value));
  };
  const progress = (label) => {

    loadingDetail.setAttribute('aria-label', `NOW LOADING... ${label}`);

  };
  const [machineAsset, ballAsset, manifest, additions, handbag, boxAsset, props, outputAnimation, chamberAnimation, supplyRoute, lighting, replacedParts, cart, pokedexAsset, neonSign] = await Promise.all([
    loader.loadAsync('/assets/machine.glb').then((asset) => { progress('扭蛋机与输送轨道已就绪'); return asset; }),
    ballAssetReady.then((asset) => { progress('红白精灵球与开合结构已就绪'); return asset; }),
    loadManifest().then((data) => { progress('55 只宝可梦图鉴已就绪'); return data; }),
    loader.loadAsync('/assets/scene-v5-additions.glb'),
    loader.loadAsync('/assets/handbag-v5.glb'),
    loader.loadAsync('/assets/box-v5.glb'),
    loader.loadAsync('/assets/display_props.glb').catch(() => null),
    loader.loadAsync('/assets/output-sequence.glb').then((asset) => { progress('三次出货碰撞动画已就绪'); return asset; }),
    loader.loadAsync('/assets/chamber-one-shot.glb').then((asset) => { progress('舱内完整物理动画已就绪'); return asset; }),
    fetch('/assets/supply-route.json').then((response) => {
      if (!response.ok) throw new Error('送料路线加载失败');
      return response.json();
    }),
    fetch('/assets/v5-lighting.json').then((response) => {
      if (!response.ok) throw new Error('场景灯光加载失败');
      return response.json();
    }),
    fetch('/assets/v5-replaced-parts.json').then((response) => response.json()),
    loader.loadAsync('/assets/cart-v5.glb'),
    loader.loadAsync('/assets/pokedex.glb?v=lcd-20261105').then((asset) => { progress('宝可梦图鉴与开合机构已就绪'); return asset; }),
    loader.loadAsync('/assets/pokemon-neon-sign.glb'),
  ].map(promise => promise.then(value => { setProgress(Math.round(++completed / 15 * 80)); return value; })));
  if (props) {
    props.scene.traverse((object) => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    scene.add(props.scene);
  }
  // Keep the bag, its cards and the three adjacent balls together as a vignette.
  const bagDisplayOffset = new THREE.Vector3(.6, 0, -.25);
  const floorBallPoses = [
    { position: [-4.274418354, 0.581178904, 4.587689877], quaternion: [-0.113260396, 0.171534017, 0.426957816, 0.88059932] },
    { position: [-5.5889678, 0.581178904, 4.949921131], quaternion: [0.212253377, 0.034684919, 0.014309811, 0.976494074] },
  ];
  floorBallPoses.forEach((pose, index) => {
    const ball = instantiateBall(ballAsset, 0.405);
    ball.position.fromArray(pose.position).add(bagDisplayOffset);
    ball.quaternion.fromArray(pose.quaternion);
    scene.add(ball);
    const capture = new CaptureBall(ball, camera, index === 0 ? 'Bag front capture ball' : 'Floor capture ball');
    captureBalls.push(capture);
    if (index === 0) captureBall = capture;
  });
  ['standardbasescenecopy001', 'standardbasescenecopy093'].forEach((name) => {
    findAllByKey(additions.scene, name).forEach((object) => object.removeFromParent());
  });
  additions.scene.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = !object.material?.transparent;
      object.receiveShadow = true;
    }
  });
  cart.scene.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = !object.material?.transparent;
      object.receiveShadow = true;
    }
  });
  scene.add(additions.scene, cart.scene);
  // The other balls resting on the floor share the same capture-shake interaction.
  ['Pokeball_luxury__scene_copy001', 'Pokeball_ultra__scene_copy001', 'Pokeball_luxury__scene_copy002'].forEach((name) => {
    const ball = scene.getObjectByName(name);
    if (ball && name === 'Pokeball_luxury__scene_copy001') {
      ball.updateWorldMatrix(true, false);
      const moved = ball.getWorldPosition(new THREE.Vector3()).add(bagDisplayOffset);
      ball.position.copy(ball.parent.worldToLocal(moved));
    }
    if (ball) captureBalls.push(new CaptureBall(ball, camera, name));
  });
  installNextPokemonPanel(manifest);
  const bagMaterials = new Set([
    '01 | Ochre woven canvas', '02 | Worn canvas seam tape', '03 | Brown canvas body',
    '04 | Dark saddle leather', '05 | Polished leather edges', '06 | Pebbled shoulder strap',
    '11 | Aged gunmetal hardware', '12 | Polished buckle edges', 'V2 · Shallow molded seam',
  ]);
  const oldBagParts = [];
  machineAsset.scene.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => bagMaterials.has(material.name))) oldBagParts.push(object);
  });
  oldBagParts.forEach((object) => object.removeFromParent());
  handbag.scene.traverse((object) => {
    if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
  });
  // The handbag file also contains a separate remote terminal fragment.
  // Move only the original bag assembly (including its attached cards/tag).
  const bagAssembly = handbag.scene.children.find(object => object.name === 'Empty');
  if (bagAssembly) bagAssembly.position.add(bagDisplayOffset);
  scene.add(handbag.scene);
  await yieldLoadingFrame();
  applyBlenderLighting(scene, renderer, lighting);
  homeView.background.copy(scene.background);
  bloom.threshold = lighting.bloom.threshold;
  bloom.strength = lighting.bloom.strength * 0.18;

  await yieldLoadingFrame();
  machine = new CapsuleMachine({
    scene,
    model: machineAsset,
    ballTemplate: ballAsset,
    outputAnimation,
    chamberAnimation,
    supplyRoute,
    replacedParts,
    onQueue: updateQueue,
    onStatus: setMachineStatus,
    onOutputReady: () => toast('精灵球已滚入出口托盘'),
    onOutputCollected: () => {},
  });
  extendConveyor(scene, machine);
  replaceMainSign(scene, neonSign, renderer);
  boxInteraction = new BoxInteraction(scene, boxAsset);
  await yieldLoadingFrame();
  refineSceneMaterials(scene, renderer);
  await yieldLoadingFrame();
  dreamscape = installDreamscape({ scene, renderer, camera, controls, bloom, time: dreamTime, machine });
  homeView.background.copy(scene.background);
  backgroundCompanions = new BackgroundCompanions(scene, { machine, camera });
  machine.onSpinInteraction = () => backgroundCompanions?.mew?.startle();
  const debugButton = $('#supply-debug');
  const setSupplyDebug = (visible) => {
    machine.supply.setDebug(visible);
    debugButton.setAttribute('aria-pressed', String(visible));
  };
  setSupplyDebug(new URLSearchParams(window.location.search).has('supplyDebug'));
  debugButton.addEventListener('click', () => setSupplyDebug(debugButton.getAttribute('aria-pressed') !== 'true'));
  await yieldLoadingFrame();
  focus = new FocusExperience({
    container: $('#focus-stage'),
    ballTemplate: ballAsset,
    manifest,
    store,
    onMinimize: addMiniBall,
    onReturnFlight: startReturnFlight,
    onCardReturnStart: startCardReturn,
    onExit: restoreMainView,
    toast,
  });
  focus.useMainScene({ scene, camera, renderer, controls });
  installShowcase(focus, dreamTime);
  await yieldLoadingFrame();
  pokedexPack = new PokedexPack({
    asset: pokedexAsset,
    store,
    library: focus.library,
    button: $('#pack-button'),
    onSelect: (card, prepared) => focus.openSavedCard(card, prepared),
    onViewChange: setPokedexView,
  });
  pokedexLook = enhancePokedex(pokedexPack);
  await applyPokedexTextures(pokedexPack);
  retroOverlay = installRetroOverlay();
  sound = installSound({ machine, focus, pokedex: pokedexPack, captureBalls, boxInteraction,
    shinyFX: dreamscape?.shinyFX, camera, companions: () => backgroundCompanions,
    isSceneActive: () => !focus?.active && !focusFlight && !pokedexPack?.viewer && !$('#pack-dialog').open,
  });
  machine.onPrizeSelected = record => focus.prepareRecord(record);
  // Compile before revealing the factory instead of stalling the first visible frame
  // each time another animated character/material arrives.
  chamberBatches = batchChamberBalls(machine.chamber);
  chamberBatches.update();
  machine.chamber.renderBatches = chamberBatches.batches;
  batchRigidSiblings(boxInteraction.root, boxAsset.animations);
  setProgress(80, '正在准备场景宝可梦… 0 / 12');
  await backgroundCompanions.load({
    onProgress: (completed, total) => setProgress(80 + Math.round(completed / total * 12),
      `正在准备场景宝可梦… ${completed} / ${total}`),
  });
  backgroundCompanions.update(0);
  setProgress(93, '正在准备宝可梦材质与光影…');
  await yieldLoadingFrame();
  await prepareMainScene();
  setProgress(97, '正在准备精灵球…');
  await focus.warmupBall();
  setProgress(98, '正在生成完整场景…');
  await yieldLoadingFrame();
  // Upload character textures/bones and warm the shadow, reflection and post-FX
  // passes under the loading screen, before the first interactive frame.
  renderMainScene();
  await yieldLoadingFrame();
  renderMainScene();
  sceneReady = true;
  bindMachinePointer();
  loadingProgress.style.width = '100%';
  loadingProgress.parentElement.setAttribute('aria-valuenow', '100');
  setTimeout(() => {
    $('#loading').classList.add('done');
    setTimeout(() => { loadingBall.dispose(); $('#loading')?.remove(); }, 800);
  }, 350);
  window.__capsuleWorks = {
    get queue() { return machine.queue.length; },
    get incoming() { return machine.incoming.length; },
    get conveyorBalls() { return machine.track.length; },
    get globeBalls() { return machine.globe.length; },
    get pokedex() { return pokedexPack; },
    get companions() { return backgroundCompanions; },
    get sound() { return sound; },
    get outputs() { return machine.outputs.length; },
    get mode() { return focus.mode; },
    get cards() { return store.cards.length; },
    machine,
    focus,
    // Debug: draw one frame on demand (works even when the window is not painting).
    snapshot(width = 480, quality = .6) {
      renderMainScene();
      const source = renderer.domElement;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.round(width * source.height / source.width);
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    },
  };
}

let focusFlight;

function startFocusFlight(source) {
  if (machine.outputs[machine.outputs.length - 1] !== source) return;
  const record = source.userData.focusRecord ||= {
    uid: globalThis.crypto?.randomUUID?.() || `ball-${Date.now()}`,
    resultIcon: source.userData.resultIcon,
    pokemonId: source.userData.pokemonId,
  };
  focus.prepareRecord(record);
  // Keep the already-visible rare aura alive across the renderer handoff.
  const existingGlow = machine.rareGlows.get(source);
  if (existingGlow) machine.rareGlows.delete(source);
  const ball = machine.detachOutput(source);
  if (!ball) return;
  backgroundFade = null;
  focus.prepareLighting();
  if (existingGlow) {
    focus.observationGlow?.dispose();
    focus.observationGlow = existingGlow;
    focus.observationGlowBall = ball;
  }
  ball.traverse((object) => object.layers.set(1));
  focus.previewActive = true;
  $('#focus-layer').classList.add('active', 'ball-in-flight');
  $('#focus-stage').style.display = 'block';
  const direction = camera.getWorldDirection(new THREE.Vector3());
  controls.enabled = false;
  focusFlight = {
    mode: 'forward',
    ball,
    elapsed: 0,
    duration: 1.1,
    startPosition: ball.position.clone(),
    targetPosition: camera.position.clone().add(direction.multiplyScalar(4.0)),
    startScale: ball.scale.x,
    targetScale: 0.944,
    startQuaternion: ball.quaternion.clone(),
    targetQuaternion: uprightBallQuaternion(camera),
    record,
  };
}

function startReturnFlight(ball, record) {
  addMiniBall(record);
  document.body.classList.add('ball-returning');
  ball.traverse((object) => object.layers.set(1));
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const right = new THREE.Vector3().crossVectors(direction, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, direction).normalize();
  const startPosition = ball.position.clone();
  const distance = 4.0;
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
  const halfWidth = halfHeight * camera.aspect;
  const key = record.uid || `saved-${record.pokemonId}`;
  const icon = [...$('#mini-collection').children].find(button => button.dataset.ballKey === key);
  const rect = icon.getBoundingClientRect();
  const viewport = renderer.domElement.getBoundingClientRect();
  const ndcX = ((rect.left + rect.width / 2 - viewport.left) / viewport.width) * 2 - 1;
  const ndcY = 1 - ((rect.top + rect.height / 2 - viewport.top) / viewport.height) * 2;
  const targetPosition = camera.position.clone()
    .add(direction.multiplyScalar(distance))
    .add(right.multiplyScalar(halfWidth * ndcX))
    .add(up.multiplyScalar(halfHeight * ndcY));
  const controlPosition = startPosition.clone().lerp(targetPosition, 0.45);
  controlPosition.y += 0.65;
  controls.enabled = false;
  backgroundFade = null;
  focusFlight = {
    mode: 'return',
    ball,
    record,
    elapsed: 0,
    duration: 0.65,
    startPosition,
    targetPosition,
    controlPosition,
    startScale: ball.scale.x,
    targetScale: 0,
    startQuaternion: ball.quaternion.clone(),
    targetQuaternion: uprightBallQuaternion(camera),
  };
}

function updateFocusFlight(dt) {
  if (!focusFlight) return;
  const flight = focusFlight;
  flight.elapsed += dt;
  const t = Math.min(flight.elapsed / flight.duration, 1);
  const eased = THREE.MathUtils.smoothstep(t, 0, 1);
  if (flight.mode === 'return') {
    const inverse = 1 - eased;
    flight.ball.position.copy(flight.startPosition).multiplyScalar(inverse * inverse)
      .addScaledVector(flight.controlPosition, 2 * inverse * eased)
      .addScaledVector(flight.targetPosition, eased * eased);
    $('#machine-stage').style.filter = `blur(${12 * (1 - eased)}px)`;
  } else {
    flight.ball.position.lerpVectors(flight.startPosition, flight.targetPosition, eased);
    flight.ball.position.y += Math.sin(t * Math.PI) * 0.5;
    $('#machine-stage').style.filter = `blur(${12 * eased}px)`;
  }
  flight.outlineStrength = flight.mode === 'return' ? 1 - eased : eased;
  flight.ball.scale.setScalar(THREE.MathUtils.lerp(flight.startScale, flight.targetScale, eased));
  flight.ball.quaternion.slerpQuaternions(flight.startQuaternion, flight.targetQuaternion, eased);
  $('#focus-layer').style.backdropFilter = '';
  if (t >= 1) {
    const { ball, record, mode } = flight;
    focusFlight = null;
    $('#focus-layer').classList.remove('ball-in-flight');
    if (mode === 'return') {
      ball.removeFromParent();
      focus.finishMinimize(record);
    } else {
      focus.openInMainScene(record, ball);
    }
  }
}

let backgroundFade;

function restoreMainView() {
  focus.ball?.traverse((object) => object.layers.set(0));
  $('#focus-stage').style.display = 'none';
  cameraReturn = null;
  if (focus.cameraChangedForCard) {
    updateCamera.clearSway?.();
    camera.position.copy(homeView.position);
    controls.target.copy(homeView.target);
    Object.assign(controls, homeView.controls);
    controls.update();
    focus.cameraChangedForCard = false;
  }
  controls.enabled = true;
  scene.background = homeView.background;
  backgroundFade = null;
  $('#machine-stage').style.filter = '';
  $('#machine-stage').classList.remove('blurred');
}

function setPokedexView(active) {
  controls.enabled = !active && !focus?.active;
  if (active) {
    $('#machine-stage').classList.add('blurred');
    $('#machine-stage').style.filter = 'blur(12px)';
  } else {
    $('#machine-stage').style.filter = '';
    if (!focus?.active) $('#machine-stage').classList.remove('blurred');
  }
}

function startCardReturn() {
  backgroundFade = null;
  controls.enabled = false;
  pokedexPack?.receiveCard();
  $('#machine-stage').style.filter = '';
  $('#machine-stage').classList.remove('blurred');
}

function updateBackgroundFade(dt) {
  if (!backgroundFade) return;
  backgroundFade.elapsed += dt;
  const t = Math.min(backgroundFade.elapsed / 0.9, 1);
  const eased = THREE.MathUtils.smoothstep(t, 0, 1);
  $('#machine-stage').style.filter = `blur(${12 * (1 - eased)}px)`;
  if (t >= 1) {
    $('#machine-stage').style.filter = '';
    backgroundFade = null;
  }
}

function updateCameraReturn(dt) {
  if (!cameraReturn) return;
  cameraReturn.elapsed += dt;
  const t = Math.min(cameraReturn.elapsed / 0.9, 1);
  const eased = THREE.MathUtils.smoothstep(t, 0, 1);
  camera.position.lerpVectors(cameraReturn.startPosition, homeView.position, eased);
  controls.target.lerpVectors(cameraReturn.startTarget, homeView.target, eased);
  controls.update();
  if (t >= 1) {
    Object.assign(controls, homeView.controls);
    controls.enabled = true;
    cameraReturn = null;
  }
}

function bindMachinePointer() {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let start = null;
  function hit(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const capture = captureBalls.map((ball) => ball.raycast(raycaster)).filter(Boolean).sort((a, b) => a.distance - b.distance)[0];
    return machine.raycast(raycaster) || boxInteraction?.raycast(raycaster) || capture;
  }
  renderer.domElement.addEventListener('pointerdown', (event) => { start = { x: event.clientX, y: event.clientY }; });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!start || focus?.active || focusFlight || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const result = hit(event);
    if (result?.action === 'spin') machine.spin();
    if (result?.action === 'collect') startFocusFlight(result.ball);
    if (result?.action === 'box') boxInteraction?.play();
    if (result?.action === 'capture-ball') result.target.play();
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (focus?.active || !machine) return;
    renderer.domElement.style.cursor = hit(event) ? 'pointer' : 'default';
  });
}

spinButton?.addEventListener('click', () => {
  const accepted = machine?.spin();
  if (!accepted) toast('机器当前不可扭动，请稍候或先取走出货球');
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && !focus?.active && !focusFlight && !$('#pack-dialog').open) {
    event.preventDefault();
    machine?.spin();
  }
  if (event.code === 'KeyE' && !focus?.active && !focusFlight && machine?.outputs.length) {
    startFocusFlight(machine.outputs[machine.outputs.length - 1]);
  }
});
const crankHintWorld = new THREE.Vector3(2.08, 2.74, 0.25);
const crankHintProjection = new THREE.Vector3();
function updateCrankHint() {
  const element = $('#crank-hint');
  const visible = !focus?.active && !focusFlight && !pokedexPack?.viewer;
  element.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  crankHintProjection.copy(crankHintWorld).project(camera);
  // Sit clear of the enlarged hand-wheel.
  element.style.left = `${(crankHintProjection.x + 1) * 0.5 * window.innerWidth + 74}px`;
  element.style.top = `${(1 - crankHintProjection.y) * 0.5 * window.innerHeight - 18}px`;
}
const clock = new THREE.Clock();
let manualFrames = false;
let mobileFrameTime = 0;
let companionFrameTime = 0;
function animate() {
  requestAnimationFrame(animate);
  let dt = Math.min(clock.getDelta(), 0.5);
  if (manualFrames || document.hidden) { mobileFrameTime=0; return; }
  if (mobilePerformance) {
    mobileFrameTime += dt;
    if (mobileFrameTime < 1 / 30 - .001) return;
    dt = mobileFrameTime; mobileFrameTime=0;
    if (sceneReady && !focus?.active && !pokedexPack?.viewer) adaptResolution(dt);
  }
  frame(dt);
}
// Debug: step the whole app by a fixed dt (works while the window is not painting).
window.__stepFrames = (dt, enable = true) => { manualFrames = enable; if (dt) frame(dt); };
function frame(dt) {
  if (!sceneReady) return;
  if (cameraReturn) updateCameraReturn(dt);
  else if (!focus?.active && !focusFlight && !(mobilePerformance && pokedexPack?.viewer)) updateCamera(dt);
  updateFocusFlight(dt);
  updateBackgroundFade(dt);
  machine?.update(dt);
  chamberBatches?.update();
  dreamscape?.update(dt);
  sound?.update(dt);
  // Prepare only the next uncollected prize while it is still at the outlet.
  const nextPrize = machine?.outputs[machine.outputs.length - 1];
  if (nextPrize && focus && !nextPrize.userData.focusRecord) {
    nextPrize.userData.focusRecord = {
      uid: globalThis.crypto?.randomUUID?.() || `ball-${Date.now()}`,
      resultIcon: nextPrize.userData.resultIcon,
      pokemonId: nextPrize.userData.pokemonId,
    };
    focus.prepareRecord(nextPrize.userData.focusRecord);
  }
  boxInteraction?.update(dt);
  captureBalls.forEach((ball) => ball.update(dt));
  const frozenFactory = mobilePerformance && pokedexPack?.viewer && !pokedexPack?.transition;
  if (!focus?.active && !focusFlight && !frozenFactory && !document.hidden) {
    companionFrameTime += dt;
    if (!mobilePerformance || companionFrameTime >= .05) {
      backgroundCompanions?.update(companionFrameTime); companionFrameTime=0;
    }
  } else companionFrameTime=0;
  pokedexLook?.update(dt);
  retroOverlay?.set(Boolean(focus?.active || focusFlight || pokedexPack?.viewer));
  pokedexPack?.update(dt);
  focus?.update(dt);
  // Resizing clears the frozen factory canvas too; redraw it once behind a viewer.
  if (mainNeedsRender() || (!frozenFactory && !focus?.active && !$('#pack-dialog').open)) renderMainScene();
  if (focusFlight) focus.renderFlightPreview(focusFlight.ball, focusFlight.outlineStrength, focusFlight.record);
  updateCrankHint();
  if (machine && spinButton) spinButton.disabled = machine.busy || focus?.active || Boolean(focusFlight);
}
animate();

initialize().catch((error) => {
  console.error(error);
  loadingDetail.textContent = `资源加载失败：${error.message}`;
  loadingDetail.style.color = '#ef9f8e';
  const retry = document.createElement('button');
  retry.textContent = '重新加载';
  retry.style.cssText = 'margin-top:12px;padding:8px 18px;border:1px solid #e4c38d;border-radius:6px;background:#302620;color:#fff0d8;cursor:pointer';
  retry.onclick = () => location.reload();
  loadingDetail.after(retry);
});

