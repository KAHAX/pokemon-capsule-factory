import { prepareVineDisplay } from './vine-display.js';
import { BallPanControls } from './ball-pan-controls.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStudioEnvironment } from './studio-environment.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { instantiateBall, findByKey, easeOutCubic } from './assets.js';
import { HoloCard } from './holo-card.js';
import { CapsuleAura } from './capsule-aura.js';
import { ButtonPulse, BUTTON_PULSE_DURATION } from './button-pulse.js';
import { prepareSuicuneDisplay } from './suicune-display.js';
import { addRareGlow } from './prize-effects.js';
import { measureModelBounds, measureBodyFrame } from './card-framing.js';
import { BallDragControls } from './ball-controls.js';
import { applyCollectionEffects, cloneStyledMaterial, CollectionRenderer } from './collection-effects.js';

// Expressive, readable poses for the card portrait (in order of preference).
const ACTION_POSES = [/glad01/, /roar01/, /rangeattack01\.gfbanm/, /battlewait01_loop/, /attack01/, /notice01/];
function pickActionClips(animations = []) {
  const picked = [];
  for (const pattern of ACTION_POSES) {
    if (/loop/.test(pattern.source)) continue;
    const clip = animations.find(item => pattern.test(item.name) && !/loop/i.test(item.name));
    if (clip && !picked.includes(clip)) picked.push(clip);
  }
  return picked.slice(0, 4);
}

export class PokemonLibrary {
  constructor(manifest) {
    this.entries = manifest;
    this.cache = new Map();
    this.framingCache = new Map();
    this.loader = new GLTFLoader();
  }

  random(shiny = false) {
    const pool = this.entries.filter((item) => item.shiny === shiny);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  entry(id) {
    return this.entries.find((item) => String(item.id) === String(id));
  }

  async instantiate(id) {
    const entry = this.entry(id);
    if (!entry) throw new Error(`找不到编号 ${id} 的宝可梦`);
    if (!this.cache.has(entry.id)) {
      this.cache.set(entry.id, this.loader.loadAsync(`/assets/${entry.file}`).catch((error) => {
        this.cache.delete(entry.id);
        throw error;
      }));
    }
    const gltf = await this.cache.get(entry.id);
    const source = cloneSkeleton(gltf.scene);
    const materials = new Map();
    source.traverse((object) => {
      if (!object.isMesh) return;
      // Warm-up renders cache SkinnedMesh bounds in the bind pose. Small facial
      // meshes (e.g. Ekans' eyes) then move far outside those bounds in idle poses
      // and disappear when zooming/rotating. The observation/card viewer only
      // shows one character: keep its animated parts drawn without per-frame
      // CPU skinning to rebuild bounds. Factory/background culling is unchanged.
      if (object.isSkinnedMesh) object.frustumCulled = false;
      const cloneMaterial = (material) => {
        if (!materials.has(material)) materials.set(material, cloneStyledMaterial(material));
        return materials.get(material);
      };
      object.material = Array.isArray(object.material) ? object.material.map(cloneMaterial) : cloneMaterial(object.material);
    });
    const wrapper = new THREE.Group();
    wrapper.name = `${entry.name} / display`;
    wrapper.add(source);
    source.rotation.y = -(entry.viewYaw || 0);
    source.updateMatrixWorld(true);
    const repaired = prepareSuicuneDisplay(source, gltf.animations, entry);
    const animations = prepareVineDisplay(source, repaired?.animations || gltf.animations, entry);
    const animation = repaired?.animation || animations.find((clip) => clip.name === entry.animation) || animations[0];
    // Centre and size on the posed body (median / percentiles of skinned vertices), so
    // tails never pull the body off-centre and coiled poses (Rayquaza) are measured as shown.
    let center, size, floor;
    const cachedFrame = this.framingCache.get(entry.id);
    await new Promise(resolve => setTimeout(resolve, 0));
    const body = cachedFrame?.body || (repaired?.bounds ? null : measureBodyFrame(source, animation));
    if (body) {
      center = body.center; size = body.size; floor = body.center.y;
    } else {
      const box = repaired?.bounds || new THREE.Box3().setFromObject(source);
      center = box.getCenter(new THREE.Vector3()); size = box.getSize(new THREE.Vector3()); floor = box.min.y;
    }
    source.position.sub(new THREE.Vector3(center.x, floor, center.z));
    const target = entry.sizeClass === 'large' || entry.size_class === '大体型' ? 1.7 : 1.35;
    const scale = target / Math.max(size.x, size.y, size.z, 0.01);
    wrapper.scale.setScalar(scale);
    wrapper.userData.displayScale = scale;
    wrapper.userData.bodyHeight = body ? size.y / 1.06 : size.y;
    wrapper.userData.updateEffects = await applyCollectionEffects(source, entry);
    // Frame the resting body, not the union of every attack/jump pose: the latter
    // makes the ordinary portrait tiny. Expressive actions may extend past the art window.
    const actions = pickActionClips(animations);
    wrapper.userData.cardAnimation = animation;
    wrapper.userData.cardActions = actions;
    await new Promise(resolve => setTimeout(resolve, 0));
    wrapper.userData.cardBounds = cachedFrame?.cardBounds || measureModelBounds(wrapper, animation, { robust: true });
    if (!cachedFrame) this.framingCache.set(entry.id, { body, cardBounds: wrapper.userData.cardBounds });
    return { model: wrapper, animation, animations, entry };
  }
}

export class FocusExperience {
  constructor({ container, ballTemplate, manifest, store, onMinimize, onReturnFlight, onCardReturnStart, onExit, toast }) {
    this.container = container;
    this.ballTemplate = ballTemplate;
    this.library = new PokemonLibrary(manifest);
    this.preparedPokemon = new Map();
    this.store = store;
    this.onMinimize = onMinimize;
    this.onReturnFlight = onReturnFlight;
    this.onCardReturnStart = onCardReturnStart;
    this.onExit = onExit;
    this.toast = toast;
    this.active = false;
    this.mode = 'inactive';
    this.modeTime = 0;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 800 ? 1.2 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    // Create the overlay environment once; useMainScene reuses this context-owned texture.
    this.scene.environment = null;
    this.scene.add(new THREE.HemisphereLight('#fff0d4', '#33243c', 1.4));
    const key = new THREE.DirectionalLight('#ffd9a4', 4.2);
    key.position.set(-4, 6, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9ddfff', 2.4);
    rim.position.set(4, 3, -5);
    this.scene.add(rim);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.045;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 9;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = Math.PI - 0.35;
    this.bindEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  bindEvents() {
    let start = null;
    this.renderer.domElement.addEventListener('contextmenu', event => {
      if (this.active && this.mode === 'revealed') event.preventDefault();
    });
    this.renderer.domElement.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        start = null;
        if (this.active && this.mode === 'revealed') this.ballPan?.pointerDown(event);
        return;
      }
      start = { x: event.clientX, y: event.clientY };
      if (['closed', 'revealed'].includes(this.mode)) this.ballRotation?.pointerDown(event);
    });
    this.renderer.domElement.addEventListener('pointermove', (event) => {
      if (this.active) {
        if (this.mode === 'revealed') this.ballPan?.pointerMove(event);
        this.ballRotation?.pointerMove(event);
      }
    });
    this.renderer.domElement.addEventListener('pointerup', (event) => {
      this.ballPan?.pointerUp(event);
      if (event.button !== 0) { start = null; return; }
      this.ballRotation?.pointerUp(event);
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
        start = null;
        return;
      }
      start = null;
      if (!['closed', 'revealed'].includes(this.mode)) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      if (this.raycaster.intersectObject(this.ball, true).length) {
        if (this.mode === 'closed') this.openBall();
        else this.playPokemonInteraction();
      }
    });
    this.renderer.domElement.addEventListener('pointercancel', () => { start = null; this.ballRotation?.reset(); this.ballPan?.stop(); });
    this.renderer.domElement.addEventListener('lostpointercapture', () => this.ballPan?.release());
    this.renderer.domElement.addEventListener('wheel', (event) => {
      if (!this.active || !['closed', 'revealed'].includes(this.mode)) return;
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
      this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * Math.exp(-pixels * .0012), .62, 1.3);
    }, { passive: false });
    // The renderer is switched to the main scene once; DOM buttons must not bind twice.
    if (this.uiEventsBound) return;
    this.uiEventsBound = true;
    document.querySelector('#stow-ball').addEventListener('click', () => this.closeBall());
    document.querySelector('#make-card').addEventListener('click', () => this.makeCard());
    document.querySelector('#store-card').addEventListener('click', () => this.storeCard());
    document.querySelector('#focus-close').addEventListener('click', () => {
      if (this.mode === 'revealed') this.closeBall();
      else this.minimize();
    });
  }

  resize() {
    // The main scene owns its camera and renderer. The transparent observation
    // canvas must be resized independently, including while its layer is hidden.
    const viewport = this.isMainScene ? this.renderer.domElement.parentElement : this.container;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (!width || !height) return;
    const renderer = this.overlayRenderer || this.renderer;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, width < 800 ? 1.2 : 1.75);
    if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    if (!this.isMainScene) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  clear() {
    this.ballPan?.reset();
    this.session = (this.session || 0) + 1;
    this.buttonPulse?.dispose();
    this.buttonPulse = null;
    this.observationGlow?.dispose();
    this.observationGlow = null;
    this.observationGlowBall = null;
    this.seamAura?.dispose();
    this.seamAura = null;
    this.card?.dispose();
    this.card = null;
    this.cardReturning = null;
    this.scene.children.filter((object) => object.userData.transient).forEach((object) => object.removeFromParent());
    this.ballMixer = null;
    this.pokemonMixer = null;
    this.interactionAction = null;
    this.lastInteraction = null;
    this.pokemon = null;
    this.pokemonEntry = null;
    this.pendingPokemon = null;
    this.ball = null;
    this.flight = null;
    this.minimizeState = null;
    this.ballRotation?.reset();
  }

  useMainScene({ scene, camera, renderer, controls }) {
    this.overlayRenderer = this.renderer;
    // PMREM render-target textures belong to the WebGL context that created them.
    // Build the identical factory reflections in the overlay's own context; the
    // main renderer's GPU-only texture otherwise samples black during handoff.
    this.overlayEnvironment = createStudioEnvironment(this.overlayRenderer, { hero: true });
    this.overlayRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.overlayRenderer.toneMappingExposure = 2 ** -0.75;
    this.collectionRenderer = new CollectionRenderer(this.overlayRenderer);
    this.effectTime = 0;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.ballRotation = new BallDragControls(this.camera, () => this.group);
    this.ballPan = new BallPanControls(this.camera, () => this.group);
    this.overlayCamera = camera.clone();
    this.overlayCamera.layers.set(1);
    this.raycaster.layers.set(1);
    this.focusLighting = new THREE.Group();
    this.focusLighting.name = 'Focus studio lighting';
    this.focusLighting.visible = false;
    this.focusLighting.add(new THREE.HemisphereLight('#fff7e9', '#a99c91', 1.8));
    [
      { color: '#fff1df', intensity: 3.4, position: [-3.5, 4.0, 2.5] },
      { color: '#e1efff', intensity: 1.9, position: [3.5, 1.4, 3.0] },
      { color: '#ffe1b4', intensity: 2.4, position: [-2.0, 3.0, -2.5] },
    ].forEach((config) => {
      const light = new THREE.DirectionalLight(config.color, config.intensity);
      light.position.fromArray(config.position);
      this.focusLighting.add(light, light.target);
    });
    this.focusLighting.traverse((object) => object.layers.set(1));
    scene.add(this.focusLighting);
    this.factoryLights = [];
    scene.traverse((object) => {
      if (object.isLight && !this.focusLighting.getObjectById(object.id)) {
        object.layers.disable(1); this.factoryLights.push(object);
      }
    });
    this.isMainScene = true;
    this.resizeObserver.observe(renderer.domElement.parentElement);
    this.resize();
    this.bindEvents();
    document.querySelector('#focus-layer').style.pointerEvents = 'none';
    document.querySelector('#focus-stage').style.pointerEvents = 'none';
  }

  async warmupBall() {
    const ball = instantiateBall(this.ballTemplate, 1.18);
    this.prepareBallAppearance?.(ball);
    const aura = new CapsuleAura(ball, true);
    aura.update(1, 1, 0);
    const glow = addRareGlow(ball);
    glow.update(0, 1, 1);
    ball.traverse(object => object.layers.set(1));
    this.prepareLighting();
    this.overlayCamera.copy(this.camera);
    this.overlayCamera.layers.set(1);
    ball.position.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()), 5);
    const warmScene = new THREE.Scene();
    warmScene.environment = this.overlayEnvironment;
    warmScene.fog = this.scene.fog;
    warmScene.add(ball);
    const lights = this.focusLighting.clone(true);
    warmScene.add(lights);
    // Include any observation-only lights installed by the showcase extension.
    this.scene.traverse(object => {
      if (object.isLight && object.layers.test(this.overlayCamera.layers)
        && !this.focusLighting.getObjectById(object.id)) warmScene.add(object.clone());
    });
    try {
      await this.overlayRenderer.compileAsync(warmScene, this.overlayCamera);
      this.collectionRenderer.render(warmScene, this.overlayCamera, ball, { glow: true, outlineStrength: 1 });
      this.overlayRenderer.clear();
    } finally { this.focusLighting.visible = false; }
    // Keep one warm prototype alive so Three retains its compiled FX programs.
    this.warmupPrototype = { ball, aura, glow };
  }

  prepareLighting() {
    if (!this.focusLighting) return;
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    this.focusLighting.position.copy(this.camera.position).addScaledVector(direction, 4.0);
    this.focusLighting.quaternion.copy(this.camera.quaternion);
    this.focusLighting.visible = true;
  }

  prepareRecord(record) {
    const entry = this.library.entry(record.pokemonId) || this.library.random(record.resultIcon === 1);
    record.pokemonId = entry.id;
    record.name = entry.name;
    record.uid ||= globalThis.crypto?.randomUUID?.() || `ball-${Date.now()}`;
    if (!this.preparedPokemon.has(record.uid)) {
      const ready = this.library.instantiate(entry.id).then(async (loaded) => {
        const renderer = this.overlayRenderer;
        if (renderer) {
          // Upload texture data before opening; yield between uploads to keep input responsive.
          const textures = new Set();
          loaded.model.traverse((object) => {
            if (!object.isMesh) return;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
              for (const value of Object.values(material.userData.v5Uniforms || {})) if (value?.value?.isTexture) textures.add(value.value);
            }
          });
          for (const texture of textures) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            renderer.initTexture(texture);
          }
          const warmScene = new THREE.Scene();
          warmScene.environment = this.overlayEnvironment || this.scene.environment;
          warmScene.fog = this.scene.fog;
          this.scene.traverse((object) => {
            if (object.isLight && object.layers.test(this.overlayCamera.layers)) warmScene.add(object.clone());
          });
          loaded.model.traverse((object) => object.layers.set(1));
          warmScene.add(loaded.model);
          await renderer.compileAsync(warmScene, this.overlayCamera);
          // A tiny offscreen draw also uploads vertex buffers before the reveal.
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const savedPosition = loaded.model.position.clone();
          loaded.model.position.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()), 4);
          const target = new THREE.WebGLRenderTarget(8, 8, { stencilBuffer: true });
          const previousTarget = renderer.getRenderTarget();
          try {
            renderer.setRenderTarget(target);
            renderer.render(warmScene, this.overlayCamera);
          } finally {
            renderer.setRenderTarget(previousTarget);
            target.dispose();
            loaded.model.position.copy(savedPosition);
          }
          loaded.model.removeFromParent();
        }
        return loaded;
      }).catch((error) => { this.preparedPokemon.delete(record.uid); throw error; });
      // A flight may be cancelled before opening; do not leave an unhandled rejection.
      ready.catch(() => {});
      this.preparedPokemon.set(record.uid, ready);
    }
    return this.preparedPokemon.get(record.uid);
  }

  openInMainScene(record, ball, instantBlur = false) {
    this.clear();
    this.prepareLighting();
    this.record = { ...record };
    this.prepareRecord(this.record);
    this.pokemonEntry = this.library.entry(this.record.pokemonId);
    this.mode = 'closed';
    this.modeTime = 0;
    this.effectTime = 0;
    this.previewActive = false;
    this.handoff = true;
    this.ball = ball;
    this.ball.scale.setScalar(0.944);
    this.group = ball;
    this.zoom = this.zoomTarget = 1;
    // Match the upper interior to the authored red lacquer without changing the lower bowl.
    const upperLinerColor = new THREE.Color('#d8232e');
    this.ball.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const red = materials.find(material => /Standard vermilion lacquer/.test(material?.name || ''));
      if (red) upperLinerColor.copy(red.color);
    });
    // The concave liner needs soft, diffuse reflection, not the factory's exterior lights.
    this.ball.traverse(object => {
      if (!object.isMesh) return;
      const repair = (material) => {
        if (!/Inner ceramic liner|Porcelain lower shell|Standard vermilion lacquer/.test(material.name)) return material;
        const clone = material.clone(); clone.side = THREE.FrontSide;
        if (/Inner ceramic liner/.test(material.name)) {
          clone.metalness = 0; clone.roughness = .78; clone.envMapIntensity = .18;
          let owner = object;
          while (owner && owner !== this.ball) {
            if (/^standard[_ ]?lid/i.test(owner.name)) { clone.color.copy(upperLinerColor); break; }
            owner = owner.parent;
          }
        }
        return clone;
      };
      object.material = Array.isArray(object.material) ? object.material.map(repair) : repair(object.material);
      object.castShadow = object.receiveShadow = false;
    });
    this.ensureObservationGlow(ball, record);
    this.seamAura = new CapsuleAura(ball, this.pokemonEntry?.shiny === true);
    this.buttonPulse = new ButtonPulse(ball, this.pokemonEntry?.shiny === true);
    this.ballRotation?.align();
    this.ballPan?.reset();
    this.group.userData.transient = true;
    this.group.traverse((object) => object.layers.set(1));
    document.querySelector('#focus-stage').style.display = 'block';
    delete this.ball.userData.action;
    this.controls.enabled = false;
    this.closedTargetY = this.ball.position.y;
    this.viewTargetY = this.closedTargetY;
    this.active = true;
    document.body.classList.add('focus-active');
    document.querySelector('#focus-layer').classList.add('active');
    document.querySelector('#focus-layer').style.pointerEvents = 'none';
    document.querySelector('#focus-layer').style.backdropFilter = '';
    if (instantBlur) document.querySelector('#machine-stage').style.filter = 'blur(12px)';
    this.setTitle('发现一颗精灵球');
    this.setHint('拖拽旋转观察 · 点击精灵球打开');
    this.setButtons(false, false);
  }

  show() {
    this.active = true;
    document.body.classList.add('focus-active');
    document.querySelector('#focus-layer').classList.add('active');
    document.querySelector('#machine-stage').classList.add('blurred');
  }

  open(record, flight) {
    this.clear();
    if (this.isMainScene) {
      const ball = flight?.adoptedMesh || instantiateBall(this.ballTemplate, 1.18);
      if (!flight?.adoptedMesh) {
        const direction = this.camera.getWorldDirection(new THREE.Vector3());
        ball.position.copy(this.camera.position).add(direction.multiplyScalar(4));
        this.scene.add(ball);
      }
      this.openInMainScene(record, ball, true);
      return;
    }
    this.show();
    this.resize();
    this.scene.background = null;
    this.record = { ...record };
    this.prepareRecord(this.record);
    this.mode = 'closed';
    this.modeTime = 0;
    this.handoff = Boolean(flight?.adoptedMesh);
    this.group = new THREE.Group();
    this.group.userData.transient = true;
    this.scene.add(this.group);
    this.ball = this.handoff ? flight.adoptedMesh : instantiateBall(this.ballTemplate, 1.18);
    this.buttonPulse = new ButtonPulse(this.ball, this.library.entry(record.pokemonId)?.shiny === true);
    this.ball.position.set(0, 0, 0);
    this.ball.scale.setScalar(1.18);
    delete this.ball.userData.action;
    this.group.add(this.ball);
    this.group.scale.setScalar(this.handoff ? 1 : 0.75);
    this.camera.position.set(0, 1.65, 6.4);
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 9;
    this.controls.minAzimuthAngle = -Infinity;
    this.controls.maxAzimuthAngle = Infinity;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = Math.PI - 0.35;
    this.controls.update();
    if (!this.handoff && flight?.ndc && Number.isFinite(flight.ndc.x) && Number.isFinite(flight.ndc.y)) {
      this.pointer.set(flight.ndc.x, flight.ndc.y);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const normal = this.camera.getWorldDirection(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.controls.target);
      const start = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (start) {
        this.flight = { start, elapsed: 0, duration: 1.05, arc: 0.65 };
        this.group.position.copy(start);
        this.group.scale.setScalar(0.08);
      }
    }
    this.setTitle('发现一颗精灵球');
    this.setHint('拖拽旋转观察 · 点击精灵球打开');
    this.setButtons(false, false);
  }

  setTitle(text) {
    document.querySelector('#focus-title').textContent = text;
    document.querySelector('.focus-topbar .eyebrow').textContent = 'CAPSULE OBSERVATION';
    document.body.dataset.focusMode = this.mode;
  }

  setEntryTitle(entry) {
    if (!entry) return;
    const number = String(entry.dex ?? entry.id).split('-')[0].padStart(3, '0');
    const name = entry.name.replace(/\s*·\s*闪光$/, '');
    const title = document.querySelector('#focus-title');
    const dex = document.createElement('span');
    dex.className = 'identity-number';
    dex.textContent = `#${number}`;
    const label = document.createElement('span');
    label.className = 'identity-name';
    label.textContent = name;
    title.replaceChildren(dex, label);
    if (entry.shiny) {
      const badge = document.createElement('span');
      badge.className = 'shiny-name';
      badge.textContent = '✦ 闪光';
      title.append(badge);
    }
    document.querySelector('.focus-topbar .eyebrow').textContent =
      `${(entry.english || '').toUpperCase()}${entry.shiny ? ' / SHINY' : ''} · POKÉMON`;
    document.body.dataset.focusMode = this.mode;
  }

  setHint(text) { document.querySelector('#focus-hint').textContent = text; }
  setButtons(card, store) {
    const stow = this.mode === 'revealed' || this.mode === 'closed';
    document.querySelector('#stow-ball').classList.toggle('visible', stow);
    document.querySelector('#stow-ball').style.pointerEvents = stow ? 'auto' : 'none';
    document.querySelector('#focus-close').hidden = true;
    document.querySelector('#make-card').classList.toggle('visible', card);
    document.querySelector('#store-card').classList.toggle('visible', store);
    document.querySelector('#make-card').style.pointerEvents = card ? 'auto' : 'none';
    document.querySelector('#store-card').style.pointerEvents = store ? 'auto' : 'none';
  }

  openBall() {
    if (this.mode !== 'closed') return;
    this.ballRotation?.reset();
    this.mode = 'unlocking';
    this.modeTime = 0;
    this.buttonPulse?.update(0);
    this.setButtons(false, false);
    this.setHint('正在唤醒精灵…');
  }

  async beginOpenBall() {
    if (this.mode !== 'unlocking') return;
    const session = this.session;
    this.buttonPulse?.update(BUTTON_PULSE_DURATION);
    this.mode = 'opening';
    this.modeTime = 0;
    document.querySelector('#focus-close').hidden = true;
    this.setHint('精灵球开启中…');
    const entry = this.library.entry(this.record.pokemonId) || this.library.random(this.record.resultIcon === 1);
    this.record.pokemonId = entry.id;
    this.record.name = entry.name;
    const lid = findByKey(this.ball, 'standardLidPivot');
    const original = this.ballTemplate.animations.find((clip) => clip.name.includes('OpenClose')) || this.ballTemplate.animations[0];
    if (lid && original) {
      this.ballMixer = new THREE.AnimationMixer(this.ball);
      const clip = THREE.AnimationUtils.subclip(original, 'Open', 1, 32, 30);
      const action = this.ballMixer.clipAction(clip, lid);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    }
    document.querySelector('#focus-loading').classList.add('visible');
    try {
      const loaded = await this.prepareRecord(this.record);
      if (session !== this.session || !this.active || !['opening', 'revealed'].includes(this.mode)) return;
      this.pendingPokemon = loaded;
      this.preparedPokemon.delete(this.record.uid);
      this.preparePokemon();
    } catch (error) {
      if (session !== this.session) return;
      console.error(error);
      this.toast('角色加载失败，请关闭后重试');
      document.querySelector('#focus-loading').classList.remove('visible');
    }
  }

  preparePokemon() {
    if (this.pokemon || !this.pendingPokemon) return;
    const { model, animation, animations, entry } = this.pendingPokemon;
    this.pokemonAnimations = animations || [animation].filter(Boolean);
    this.pokemon = model;
    this.revealStartTime = Math.max(0.55, this.modeTime);
    this.pokemonEntry = entry;
    // Keep Suicune's large body relative to the ball, with room for its crest.
    if (String(entry.dex || entry.id) === '245') this.zoomTarget = .82;
    this.revealTargetY = this.closedTargetY + (entry.sizeClass === 'large' || entry.size_class === '大体型' ? 0.8 : 0.62);
    model.position.y = -0.04;
    model.userData.reveal = 0;
    model.scale.setScalar(0.001);
    model.traverse((object) => object.layers.set(1));
    this.group.add(model);
    if (animation) {
      this.pokemonMixer = new THREE.AnimationMixer(model);
      this.idleAction = this.pokemonMixer.clipAction(animation);
      this.idleAction.play();
      this.pokemonMixer.addEventListener('finished', ({ action }) => {
        if (action !== this.interactionAction) return;
        action.fadeOut(.25);
        this.idleAction.reset().fadeIn(.25).play();
        this.interactionAction = null;
      });
    }
    document.querySelector('#focus-loading').classList.remove('visible');
  }

  finishReveal() {
    this.mode = 'revealed';
    this.modeTime = 0;
    this.setEntryTitle(this.pokemonEntry);
    this.setHint('左键旋转 · 右键拖动位置 · 滚轮缩放 · 点击精灵互动');
    this.setButtons(true, false);
  }

  playPokemonInteraction() {
    if (this.mode !== 'revealed' || !this.pokemonMixer || this.interactionAction) return;
    const clips = this.pokemonAnimations || [];
    const candidates = clips.filter(clip => /glad|refresh|defaultidle|notice|roar|buffact|speact|wing|attack/i.test(clip.name) && !/start|end/i.test(clip.name));
    const choices = candidates.filter(clip => clip !== this.lastInteraction);
    const clip = (choices.length ? choices : candidates)[Math.floor(Math.random() * (choices.length || candidates.length))];
    if (!clip) return;
    this.lastInteraction = clip;
    const action = this.pokemonMixer.clipAction(clip);
    this.interactionAction = action;
    action.reset().setLoop(THREE.LoopRepeat, /loop/i.test(clip.name) ? 2 : 1);
    action.clampWhenFinished = true;
    this.idleAction?.fadeOut(.22);
    action.fadeIn(.22).play();
  }

  closeBall() {
    this.ballPan?.stop();
    if (this.mode === 'closed') { this.minimize(); return; }
    if (this.mode !== 'revealed') return;
    this.ballRotation?.reset();
    this.mode = 'closing';
    this.modeTime = 0;
    this.closingTargetY = this.viewTargetY;
    this.setButtons(false, false);
    this.setHint('正在收好精灵球…');
    const lid = findByKey(this.ball, 'standardLidPivot');
    const original = this.ballTemplate.animations.find((clip) => clip.name.includes('OpenClose')) || this.ballTemplate.animations[0];
    if (lid && original) {
      this.ballMixer.stopAllAction();
      const clip = THREE.AnimationUtils.subclip(original, 'Close', 31, 76, 30);
      const action = this.ballMixer.clipAction(clip, lid);
      action.reset().setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    }
  }

  minimize() {
    this.mode = 'minimizing';
    if (!this.group) {
      this.onMinimize(this.record);
      this.exit();
      return;
    }
    this.active = false;
    this.previewActive = true;
    this.container.style.display = 'block';
    this.setButtons(false, false);
    this.onReturnFlight(this.group, this.record);
  }

  finishMinimize(record) {
    this.onMinimize(record);
    this.exit();
    this.toast(`${record.name || '精灵球'} 已收藏到右下角精灵球`);
  }

  playBallSegment(start, end, speed = 1) {
    const lid = findByKey(this.ball, 'standardLidPivot');
    const original = this.ballTemplate.animations.find((clip) => clip.name.includes('OpenClose')) || this.ballTemplate.animations[0];
    if (!lid || !original) return;
    this.ballMixer ||= new THREE.AnimationMixer(this.ball);
    this.ballMixer.stopAllAction();
    const clip = THREE.AnimationUtils.subclip(original, 'CardTransition', start, end, 30);
    const action = this.ballMixer.clipAction(clip, lid);
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.setEffectiveTimeScale(speed);
    action.clampWhenFinished = true;
    action.play();
  }

  makeCard() {
    this.ballPan?.stop();
    if (this.mode !== 'revealed' || !this.pokemon) return;
    this.mode = 'card-opening';
    this.zoomTarget = 1;
    this.modeTime = 0;
    this.cardBallStartY = this.group.position.y;
    this.cardStartPosition = this.group.position.clone();
    this.cardLidOpened = false;
    this.group.visible = true;
    this.ball.visible = true;
    this.controls.enabled = false;
    this.ballRotation?.reset();
    this.playBallSegment(31, 76, 1.8);
    this.setEntryTitle(this.pokemonEntry);
    this.setHint('精灵收回 · 精灵球合拢');
    this.setButtons(false, false);
  }

  activateCard() {
    this.mode = 'card';
    this.modeTime = 0;
    if (this.focusLighting) this.focusLighting.visible = false;
    this.controls.enabled = false;
    document.querySelector('#focus-layer').style.pointerEvents = 'auto';
    document.querySelector('#focus-stage').style.pointerEvents = 'none';
    this.card.setInteractive(true);
    this.setButtons(false, true);
  }

  updateCardEntrance() {
    const time = this.modeTime;
    if (time >= .85 && time < 2.35) this.setHint('精灵球已合拢 · 能量凝聚中…');
    else if (time >= 2.35 && time < 3.55) this.setHint('星光汇聚 · 正在封装卡牌…');
    else if (time >= 3.55) this.setHint('开启收藏卡牌…');
    if (!this.card && this.pokemon) {
      const target = this.pokemon.userData.displayScale;
      const shrink = 1 - THREE.MathUtils.smoothstep(time / 0.68, 0, 1);
      this.pokemon.scale.setScalar(target * Math.max(0.001, shrink));
    }
    if (time >= 3.55 && !this.cardLidOpened) {
      this.cardLidOpened = true;
      this.playBallSegment(1, 32, 1);
    }
    if (time >= 4.05 && !this.card) {
      // Start inside the open lower shell, following the current ball pose.
      const projected = this.ball.localToWorld(new THREE.Vector3(0, -.12, 0)).project(this.camera);
      this.cardStartScreen = {
        x: (projected.x + 1) * 0.5 * window.innerWidth,
        y: (1 - projected.y) * 0.5 * window.innerHeight,
      };
      this.pokemonMixer?.stopAllAction();
      this.card = new HoloCard(document.querySelector('#focus-layer'), this.pokemonEntry, this.pokemon, this.pokemon.userData.cardAnimation || this.pendingPokemon?.animation);
      document.querySelector('#focus-layer').style.pointerEvents = 'auto';
      document.querySelector('#focus-stage').style.pointerEvents = 'none';
    }
    if (this.card) this.card.setEntrance(Math.min(1, (time - 4.05) / 2.4), this.cardStartScreen);
    if (time >= 4.5) {
      const fall = Math.min(1, (time - 4.5) / 0.42);
      this.group.position.y = this.cardBallStartY - 4.2 * fall * fall;
      if (fall >= 1) this.ball.visible = false;
    }
    if (time >= 6.45) {
      this.ball.visible = false;
      this.activateCard();
      this.setEntryTitle(this.pokemonEntry);
      this.setHint('拖拽旋转卡牌 · 视差变化会产生立体空间与闪光');
    }
  }

  async openSavedCard(saved, prepared = null) {
    this.clear();
    const session = this.session;
    this.show();
    this.mode = 'loadingCard';
    this.setEntryTitle(this.library.entry(saved.pokemonId));
    this.setHint('正在取出收藏卡牌…');
    this.setButtons(false, false);
    document.querySelector('#focus-loading').classList.add('visible');
    try {
      const loaded = prepared ? { model: prepared.scene.model, entry: prepared.entry } : await this.library.instantiate(saved.pokemonId);
      if (session !== this.session || !this.active) return;
      this.pokemon = loaded.model;
      this.pokemonEntry = loaded.entry;
      this.record = { uid: saved.sourceUid || saved.key, cardKey: saved.key, pokemonId: saved.pokemonId, name: saved.name, resultIcon: saved.resultIcon };
      this.card = prepared || new HoloCard(document.querySelector('#focus-layer'), loaded.entry, loaded.model, loaded.model.userData.cardAnimation || loaded.animation);
      if (prepared) { document.querySelector('#focus-layer').appendChild(prepared.element); prepared.scene.target.set(0, 0); prepared.scene.current.set(0, 0); prepared.scene.resize(); }
      this.card.setEntrance(1);
      this.activateCard();
      this.setHint('拖拽旋转卡牌 · 这张卡牌已保存在你的卡包中');
    } catch (error) {
      console.error(error);
      this.toast('卡牌角色加载失败');
    } finally {
      document.querySelector('#focus-loading').classList.remove('visible');
    }
  }

  storeCard() {
    if (this.mode !== 'card' || !this.card || !this.pokemonEntry) return;
    this.mode = 'card-returning';
    this.record.uid ||= (globalThis.crypto?.randomUUID?.() || `ball-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const key = this.record.cardKey ||= `capsule-${this.record.uid}`;
    if (!this.store.cards.some(card => card.key === key)) this.store.add({
      key, sourceUid: this.record.uid,
      pokemonId: this.pokemonEntry.id,
      id: this.pokemonEntry.id,
      name: this.pokemonEntry.name,
      resultIcon: this.record.resultIcon,
      image: this.card.capture(),
    });
    this.card.beginReturn();
    this.cardReturning = { elapsed: 0, duration: 0.95 };
    this.mode = 'card-returning';
    this.setButtons(false, false);
    this.setHint('卡牌收纳中…');
    this.onCardReturnStart?.();
  }

  updateCardReturn(dt) {
    const state = this.cardReturning;
    state.elapsed += dt;
    const progress = Math.min(1, state.elapsed / state.duration);
    this.card.setReturn(progress);
    this.overlayRenderer.clear();
    if (progress >= 1) {
      this.cardReturning = null;
      this.onMinimize(this.record);
      this.exit();
      this.toast(`${this.pokemonEntry.name} 卡牌已收纳进卡包`);
    }
  }

  exit() {
    this.ballPan?.reset();
    this.active = false;
    this.mode = 'inactive';
    delete document.body.dataset.focusMode;
    this.observationGlow?.dispose();
    this.observationGlow = null;
    this.observationGlowBall = null;
    if (this.focusLighting) this.focusLighting.visible = false;
    this.seamAura?.dispose();
    this.seamAura = null;
    this.card?.dispose();
    this.card = null;
    this.cardReturning = null;
    document.body.classList.remove('focus-active', 'ball-returning');
    this.overlayRenderer?.clear();
    document.querySelector('#focus-layer').classList.remove('active');
    document.querySelector('#focus-layer').style.pointerEvents = '';
    document.querySelector('#machine-stage').classList.remove('blurred');
    document.querySelector('#focus-layer').style.backdropFilter = '';
    document.querySelector('#focus-loading').classList.remove('visible');
    this.setButtons(false, false);
    this.onExit();
  }

  update(dt) {
    if (!this.active) return;
    this.modeTime += dt;
    this.effectTime += dt;
    if (this.mode === 'unlocking') {
      this.buttonPulse?.update(this.modeTime);
      if (this.modeTime >= BUTTON_PULSE_DURATION) this.beginOpenBall();
    }
    this.observationGlow?.update(dt, 1, 1);
    if (this.cardReturning) {
      this.updateCardReturn(dt);
      return;
    }
    if (this.mode === 'card-opening') this.updateCardEntrance();
    this.ballMixer?.update(dt);
    if (this.group && !this.card && !this.minimizeState && !this.flight) {
      this.zoom = THREE.MathUtils.damp(this.zoom || 1, this.zoomTarget || 1, 12, Math.min(dt,.05));
      this.group.scale.setScalar(.944 * this.zoom);
    }
    if (this.seamAura) {
      let glow = ['closed', 'unlocking'].includes(this.mode) ? 1 : 0;
      let gather = -1;
      if (this.mode === 'closing' && this.modeTime >= 1.4) glow = 1;
      if (this.mode === 'card-opening') {
        if (this.modeTime >= .83 && this.modeTime < 3.55) glow = 1.1;
        if (this.modeTime >= 2.35 && this.modeTime <= 3.55) {
          gather = (this.modeTime - 2.35) / 1.2; glow = 1.4;
        }
      }
      this.seamAura.update(dt, glow, this.effectTime, gather);
    }
    if (!this.card) this.pokemonMixer?.update(dt);
    this.pokemon?.userData.updateEffects?.(this.effectTime);
    if (this.minimizeState) {
      const state = this.minimizeState;
      state.elapsed += Math.min(dt, 1 / 30);
      const t = Math.min(state.elapsed / 1.2, 1);
      const eased = THREE.MathUtils.smoothstep(t, 0, 1);
      const inverse = 1 - eased;
      this.group.position.copy(state.startPosition).multiplyScalar(inverse * inverse)
        .addScaledVector(state.controlPosition, 2 * inverse * eased)
        .addScaledVector(state.targetPosition, eased * eased);
      this.group.scale.setScalar(THREE.MathUtils.lerp(state.startScale, 0.12, eased));
      if (t >= 1) {
        this.group.removeFromParent();
        this.minimizeState = null;
        this.onMinimize(this.record);
        this.exit();
        this.toast(`${this.record.name || '精灵球'} 已收藏到右下角精灵球`);
      }
      return;
    }
    if (this.flight) {
      this.flight.elapsed += dt;
      const t = Math.min(this.flight.elapsed / this.flight.duration, 1);
      const eased = easeOutCubic(t);
      this.group.position.copy(this.flight.start).multiplyScalar(1 - eased);
      this.group.position.y += Math.sin(t * Math.PI) * this.flight.arc;
      this.group.scale.setScalar(0.08 + eased * 0.92);
      if (t >= 1) {
        this.group.position.set(0, 0, 0);
        this.group.scale.setScalar(1);
        this.flight = null;
      }
    } else if (this.mode === 'closed' && !this.handoff) {
      const scale = 0.75 + easeOutCubic(Math.min(this.modeTime / 0.55, 1)) * 0.25;
      this.group.scale.setScalar(scale);
    }
    if (this.mode === 'opening' && this.pokemon) {
      const target = this.pokemon.userData.displayScale;
      const t = Math.max(0, Math.min(1, (this.modeTime - this.revealStartTime) / 0.65));
      const eased = easeOutCubic(t);
      this.pokemon.scale.setScalar(target * eased);
      this.viewTargetY = this.closedTargetY + (this.revealTargetY - this.closedTargetY) * eased;
      if (this.modeTime > 1.15 && t >= 1) this.finishReveal();
    }
    if (this.mode === 'closing') {
      this.viewTargetY = this.closedTargetY + (this.closingTargetY - this.closedTargetY) * (1 - easeOutCubic(Math.min(this.modeTime / 0.65, 1)));
      if (this.pokemon) {
        const target = this.pokemon.userData.displayScale;
        this.pokemon.scale.setScalar(target * Math.max(0.001, 1 - this.modeTime / 0.45));
      }
      if (this.modeTime > 1.65) this.minimize();
    }
    this.ballRotation?.update(dt, ['closed', 'revealed'].includes(this.mode));
    this.ballPan?.update(dt, this.mode === 'revealed');
    if (this.card && this.mode !== 'card-opening') {
      this.overlayRenderer.clear();
      return;
    }
    this.overlayCamera.copy(this.camera);
    this.overlayCamera.layers.set(1);
    const background = this.scene.background;
    const environment = this.scene.environment;
    this.scene.background = null;
    this.scene.environment = this.overlayEnvironment;
    try {
      this.collectionRenderer.render(this.scene, this.overlayCamera, this.group, {
        glow: true, outlineStrength: 1, rainbow: this.pokemonEntry?.shiny === true, time: this.effectTime,
      });
    } finally {
      this.scene.background = background;
      this.scene.environment = environment;
    }
  }

  ensureObservationGlow(ball, record) {
    if (this.observationGlowBall === ball || !this.library.entry(record?.pokemonId)?.shiny) return;
    this.observationGlow?.dispose();
    this.observationGlow = addRareGlow(ball);
    this.observationGlowBall = ball;
    // Newly attached effects must use the same overlay layer as their ball.
    ball.traverse(object => object.layers.set(1));
    this.observationGlow.update(0, 1, 1);
  }

  renderFlightPreview(ball, outlineStrength = 0, record) {
    this.ensureObservationGlow(ball, record);
    const returning = this.mode === 'minimizing';
    this.observationGlow?.update(1 / 60, returning ? outlineStrength : 1, returning ? 1 : outlineStrength);
    if (ball === this.ball) this.seamAura?.update(1 / 60, outlineStrength, this.effectTime);
    this.overlayCamera.copy(this.camera);
    this.overlayCamera.layers.set(1);
    const background = this.scene.background;
    const environment = this.scene.environment;
    this.scene.background = null;
    this.scene.environment = this.overlayEnvironment;
    try {
      this.collectionRenderer.render(this.scene, this.overlayCamera, ball, {
        glow: true, outlineStrength, rainbow: this.library.entry(record?.pokemonId)?.shiny === true, time: this.effectTime || 0,
      });
    } finally {
      this.scene.background = background;
      this.scene.environment = environment;
    }
  }
}
