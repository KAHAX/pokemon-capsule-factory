import { MobileBeautyPass, createMobileFocusPass } from './mobile-rendering.js';
import { mobileEdition, mobilePerformance, MobileResolutionBudget } from './mobile-performance.js';
import { scenePixelRatio } from './render-budget.js';
import { companionOutlines } from './companion-rendering.js';
import { createSceneToon } from './scene-toon.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStudioEnvironment } from './studio-environment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { createGradePass } from './dreamscape/grade-pass.js';
import { GodRaysPass } from './dreamscape/god-rays.js';

export function createMainScene(container) {
  const mobileBudget = new MobileResolutionBudget();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#6f5c50');
  scene.fog = new THREE.Fog('#6f5c50', 80, 180);
  // MSAA lives on the composer's target. The canvas only receives a fullscreen
  // triangle, so a second multisampled canvas spends memory without smoothing edges.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(scenePixelRatio(container.clientWidth, container.clientHeight, window.devicePixelRatio || 1, mobilePerformance ? mobileBudget.ratio : null));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  scene.environment = createStudioEnvironment(renderer, { hero: true });

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000); // include the distant Rayquaza patrol
  camera.position.set(15.96, 13.22, 25.48);
  const baseTarget = new THREE.Vector3(0, 6.5, 0);
  if (mobileEdition) camera.position.sub(baseTarget).multiplyScalar(.9).add(baseTarget);
  camera.lookAt(baseTarget);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(baseTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 20;
  controls.maxDistance = 37;
  const azimuth = controls.getAzimuthalAngle();
  const polar = controls.getPolarAngle();
  controls.minAzimuthAngle = azimuth - Math.PI / 6;
  controls.maxAzimuthAngle = azimuth + Math.PI / 36;
  controls.minPolarAngle = Math.max(0.2, polar - Math.PI / 36);
  controls.maxPolarAngle = Math.min(Math.PI - 0.2, polar + Math.PI / 6);
  controls.update();

  const hemi = new THREE.HemisphereLight('#ffe6bd', '#241b25', 1.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#ffd09a', 3.5);
  key.position.set(-7, 16, 11);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -13;
  key.shadow.camera.right = 13;
  key.shadow.camera.top = 16;
  key.shadow.camera.bottom = -10;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 55;
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#ffb363', 2.3);
  rim.position.set(6, 13, -10);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#b7d5e8', 1.05);
  fill.position.set(-10, 7, 1);
  scene.add(fill);
  const front = new THREE.PointLight('#ffe3b3', 55, 25, 2);
  front.position.set(0, 5, 9);
  scene.add(front);

  // Canvas antialiasing does not cover offscreen postprocessing targets.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  target.samples = !mobilePerformance && renderer.capabilities.isWebGL2 && window.innerWidth >= 800
    ? Math.min(4, renderer.capabilities.maxSamples) : 0;
  const composer = new EffectComposer(renderer, target);
  const beauty = mobileEdition ? new MobileBeautyPass(scene, camera) : new RenderPass(scene, camera);
  composer.addPass(beauty);
  // Light shafts read the open-sky mask (alpha) straight from the beauty pass.
  const godRays = new GodRaysPass(null, camera);
  composer.addPass(godRays);
  scene.userData.dreamGodRays = godRays;
  const depthOfField = mobileEdition ? createMobileFocusPass(beauty, camera) : new BokehPass(scene, camera, { focus: 25.5, aperture: 0.00065, maxblur: 0.006 });
  // Keep the hero focus band and foreground softness; strengthen only the distant factory.
  if (!mobileEdition) depthOfField.materialBokeh.fragmentShader = depthOfField.materialBokeh.fragmentShader.replace(
    'float factor = ( focus + viewZ );',
    'float delta = focus + viewZ; float behind = max(-delta - 5.0, 0.0); float front = max(delta - 6.0, 0.0); float factor = front * (0.00008 / 0.00065) - behind * smoothstep(0.0, 3.0, behind);'
  );
  composer.addPass(depthOfField);
  // Sky, light shafts and motes are pure light: keep them out of the depth used by DOF and outlines.
  const renderDepthOfField = depthOfField.render.bind(depthOfField);
  if (!mobileEdition) depthOfField.render = (...args) => {
    const hidden = [];
    for (const object of scene.userData.dreamNoDepth || []) {
      if (object.visible) { object.visible = false; hidden.push(object); }
    }
    for (const mesh of companionOutlines) if (mesh.visible) { mesh.visible = false; hidden.push(mesh); }
    // The beauty pass already rendered the current animated shadows. A depth-only
    // pass must reuse them, not redraw both 4K/2K shadow maps a second time.
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    try { renderDepthOfField(...args); } finally {
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      hidden.forEach(object => { object.visible = true; });
    }
  };
  const stylization = createSceneToon(scene, camera, depthOfField, renderer);
  composer.addPass(stylization.outline);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.4, 1.0);
  composer.addPass(bloom);
  const grade = createGradePass();
  composer.addPass(grade);
  scene.userData.dreamGrade = grade;
  composer.addPass(new OutputPass());
  const dreamTime = { value: 0 };

  const hover = new THREE.Vector2();
  const hoverTarget = new THREE.Vector2();
  window.addEventListener('pointermove', (event) => {
    if (mobileEdition) return;
    if (event.buttons) {
      hoverTarget.set(0, 0);
      return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    hoverTarget.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  });
  renderer.domElement.addEventListener('pointerleave', () => hoverTarget.set(0, 0));
  controls.addEventListener('start', () => hoverTarget.set(0, 0));

  // Mouse parallax: the camera itself drifts around the orbit and the aim follows,
  // so the whole set sways with the pointer. The offset is removed before OrbitControls
  // updates, so it never accumulates into the user's own orbit.
  const swayOffset = new THREE.Vector3();
  const swayRight = new THREE.Vector3();
  const swayUp = new THREE.Vector3();
  function updateCamera(dt) {
    hover.lerp(hoverTarget, 1 - Math.exp(-dt * 2.6));
    camera.position.sub(swayOffset);
    controls.target.set(baseTarget.x + hover.x * 0.9, baseTarget.y + hover.y * 0.6, baseTarget.z);
    controls.update(dt);
    swayRight.setFromMatrixColumn(camera.matrixWorld, 0);
    swayUp.setFromMatrixColumn(camera.matrixWorld, 1);
    swayOffset.copy(swayRight).multiplyScalar(hover.x * 2.4).addScaledVector(swayUp, hover.y * 1.3);
    camera.position.add(swayOffset);
    camera.lookAt(controls.target);
    // Screen-space light projections must use this frame's final hover pose.
    camera.updateMatrixWorld(true);
  }
  // Forget the current sway (used when another animation takes over the camera).
  updateCamera.clearSway = () => swayOffset.set(0, 0, 0);

  let resizePending = true;
  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    const pixelRatio = scenePixelRatio(width, height, dpr, mobilePerformance ? mobileBudget.ratio : null);
    if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
    camera.aspect = width / height;
    // Preserve the desktop view and keep the same horizontal room on narrow screens.
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) / Math.min(1, camera.aspect)));
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    resizePending = true;
  }
  window.addEventListener('resize', resize);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  const focusPoint = new THREE.Vector3();
  let lastShadowUpdate = -Infinity;
  if (mobilePerformance) renderer.shadowMap.autoUpdate = false;
  return { scene, camera, renderer, controls, updateCamera, bloom, dreamTime,
    adaptResolution: dt => { if (mobilePerformance && mobileBudget.sample(dt)) resize(); },
    prepare: async () => { stylization.prepare(); await renderer.compileAsync(scene, camera); }, needsRender: () => resizePending, render: () => {
    resizePending = false;
    if (mobilePerformance && (mobileEdition ? lastShadowUpdate === -Infinity : performance.now() - lastShadowUpdate >= 50)) {
      renderer.shadowMap.needsUpdate = true;
      lastShadowUpdate = performance.now();
    }
    scene.userData.mainRenderFrame = (scene.userData.mainRenderFrame || 0) + 1;
    dreamTime.value = performance.now() / 1000;
    grade.uniforms.dsTime.value = dreamTime.value;
    grade.uniforms.pixelRatio.value = renderer.getPixelRatio();
    if (scene.userData.dreamLightDirection) {
      godRays.enabled = true;
      godRays.lightDirection.copy(scene.userData.dreamLightDirection);
      camera.updateMatrixWorld(true);
      godRays.update();
    } else godRays.enabled = false;
    depthOfField.uniforms.focus.value = -focusPoint.set(0, 5.0, 0).applyMatrix4(camera.matrixWorldInverse).z;
    stylization.begin();
    try { composer.render(); } finally { stylization.end(); }
  } };
}
