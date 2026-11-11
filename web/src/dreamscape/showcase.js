import * as THREE from 'three';
import { createStudioEnvironment } from '../studio-environment.js';

// Observation view upgrades:
//  - one environment for the factory and the overlay, so the ball's reflections never
//    switch when it hands over from the factory to the focus view;
//  - lacquered, clear-coated, metal-accented materials for a realistic close-up;
//  - when the ball opens: a warm light inside, a glowing interior, a soft light column
//    and rising motes, all feeding the overlay's halo pass (no outline, strong bloom).

const BLEND_NO_ALPHA = {
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
};

const FINISH = [
  [/vermilion lacquer|golden yellow|Luxury/i, { clearcoat: 1, clearcoatRoughness: .035, roughness: .26, metalness: .02, envMapIntensity: 1.35 }],
  [/Porcelain lower shell/i, { clearcoat: 1, clearcoatRoughness: .05, roughness: .32, metalness: 0, envMapIntensity: 1.2 }],
  [/Equator charcoal/i, { clearcoat: .6, clearcoatRoughness: .12, roughness: .34, metalness: .45, envMapIntensity: 1.1 }],
  [/Button polished alloy|machined gold/i, { clearcoat: .4, clearcoatRoughness: .05, roughness: .12, metalness: 1, envMapIntensity: 1.7 }],
  [/Matte sealing lip/i, { roughness: .6, envMapIntensity: .8 }],
];

function finishBall(ball) {
  const liners = [];
  ball.traverse(object => {
    if (!object.isMesh) return;
    const apply = material => {
      if (!material || material.userData.showcaseFinish) return material;
      const rule = FINISH.find(([pattern]) => pattern.test(material.name));
      const isLiner = /Inner ceramic liner/i.test(material.name);
      if (!rule && !isLiner) return material;
      // Clone shared template materials so factory balls keep their own look.
      const target = material.userData.showcaseOwned ? material : material.clone();
      target.userData = { ...material.userData, showcaseFinish: true, showcaseOwned: true };
      if (rule) for (const [key, value] of Object.entries(rule[1])) if (key in target) target[key] = value;
      if (isLiner) {
        target.emissive = new THREE.Color('#ffcf93');
        target.emissiveIntensity = 0;
        liners.push(target);
      }
      return target;
    };
    object.material = Array.isArray(object.material) ? object.material.map(apply) : apply(object.material);
  });
  return liners;
}

function createInterior(shiny) {
  const root = new THREE.Group();
  root.name = 'Showcase interior light';
  const uniforms = {
    open: { value: 0 }, emissionPass: { value: 0 }, time: { value: 0 },
    warm: { value: new THREE.Color(shiny ? '#ffd56b' : '#ffe9c8') },
    cool: { value: new THREE.Color(shiny ? '#ff9fe0' : '#9fe4ff') },
  };
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...BLEND_NO_ALPHA,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float open, emissionPass, time; uniform vec3 warm, cool; varying vec2 vUv;
      void main() {
        if (open < .002) discard;
        float r = length(vUv - .5) * 2.0;
        float core = exp(-r * r * 6.0), body = exp(-r * r * 1.6) * (1.0 - smoothstep(.85, 1.0, r));
        float shimmer = .9 + .1 * sin(time * 3.0 + r * 9.0);
        vec3 c = mix(cool, warm, core) * (core * 2.6 + body * .9) * shimmer;
        gl_FragColor = vec4(c * open * (emissionPass > .5 ? 2.6 : 1.4), 0.0);
      }`,
  });
  glowMaterial.userData.emissionPass = uniforms.emissionPass;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(.9, 64), glowMaterial);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = .03;
  root.add(disc);

  const columnMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...BLEND_NO_ALPHA,
    vertexShader: `varying vec3 vN, vV; varying float vH;
      void main(){ vH = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float open, emissionPass, time; uniform vec3 warm, cool; varying vec3 vN, vV; varying float vH;
      void main() {
        if (open < .002) discard;
        // Edge-lit veil: bright at the column's silhouette, clear in the middle where the Pokémon stands.
        float facing = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float h = clamp(vH / 2.6, 0.0, 1.0);
        float fade = smoothstep(0.0, .08, h) * pow(1.0 - h, 1.6);
        float rays = .65 + .35 * sin(atan(vN.x, vN.z) * 9.0 + time * .6) * sin(h * 7.0 - time * 2.0);
        vec3 c = mix(warm, cool, h * .7) * facing * fade * rays;
        gl_FragColor = vec4(c * open * (emissionPass > .5 ? 1.6 : .45), 0.0);
      }`,
  });
  columnMaterial.userData.emissionPass = uniforms.emissionPass;
  const columnGeometry = new THREE.CylinderGeometry(1.25, .62, 2.6, 48, 12, true);
  columnGeometry.translate(0, 1.3, 0);
  const column = new THREE.Mesh(columnGeometry, columnMaterial);
  root.add(column);

  const count = 90, seeds = [];
  for (let i = 0; i < count; i++) seeds.push(Math.random() * Math.PI * 2, Math.random(), Math.random(), Math.random());
  const motesGeometry = new THREE.BufferGeometry();
  motesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  motesGeometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 4));
  const motes = new THREE.Points(motesGeometry, new THREE.ShaderMaterial({
    uniforms: { ...uniforms, viewHeight: { value: 1000 } }, transparent: true, depthWrite: false, ...BLEND_NO_ALPHA,
    vertexShader: `attribute vec4 seed; uniform float time, open, viewHeight; varying float vA; varying float vT;
      void main() {
        float t = fract(seed.y + time * (.18 + seed.z * .2));
        float a = seed.x + time * (.4 + seed.w);
        float r = mix(.15, .75 + seed.z * .6, t);
        vec3 p = vec3(cos(a) * r, t * 2.4, sin(a) * r);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = open * sin(t * 3.14159) * (.6 + .4 * sin(time * 8.0 + seed.x * 20.0));
        vT = seed.w;
        gl_PointSize = (.03 + .05 * seed.z) * projectionMatrix[1][1] * viewHeight * .5 / -mv.z;
      }`,
    fragmentShader: `uniform vec3 warm, cool; uniform float emissionPass; varying float vA; varying float vT;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.0;
        float a = exp(-d * d * 7.0) * vA;
        if (a < .003) discard;
        gl_FragColor = vec4(mix(warm, cool, vT) * a * (emissionPass > .5 ? 4.0 : 2.0), 0.0);
      }`,
  }));
  motes.frustumCulled = false;
  const size = new THREE.Vector2();
  motes.onBeforeRender = renderer => { motes.material.uniforms.viewHeight.value = renderer.getDrawingBufferSize(size).y; };
  root.add(motes);

  root.traverse(object => { object.layers.set(1); object.raycast = () => {}; });
  return { root, uniforms, shiny };
}

function openTarget(focus) {
  const t = focus.modeTime || 0;
  switch (focus.mode) {
    case 'opening': return THREE.MathUtils.smoothstep(t, .15, .75);
    case 'revealed': return 1;
    case 'card-opening': return t >= 3.55 && t < 4.3 ? .8 : 0;
    default: return 0;
  }
}

export function installShowcase(focus, time) {
  if (!focus || focus.userData?.showcase) return;
  focus.userData = { ...(focus.userData || {}), showcase: true };
  // Same night-studio reflections as the factory: no switch at the hand-off.
  if (focus.overlayRenderer) {
    focus.overlayEnvironment ||= createStudioEnvironment(focus.overlayRenderer, { hero: true });
    focus.overlayRenderer.toneMappingExposure = .72;
  }
  focus.prepareBallAppearance = finishBall;
  let interior = null, liners = [], openness = 0, light = 0;
  // Persistent overlay-only lights (layer 1): adding lights later would force every
  // focus-view shader to recompile at the moment the ball opens.
  const innerLight = new THREE.PointLight('#ffe6c4', 0, 7, 1.6);
  const rimLight = new THREE.PointLight('#9fdcff', 0, 6, 1.8);
  innerLight.name = 'Showcase inner light';
  rimLight.name = 'Showcase rim light';
  innerLight.layers.set(1);
  rimLight.layers.set(1);
  focus.scene.add(innerLight, rimLight);
  const anchor = new THREE.Vector3();
  const openIn = focus.openInMainScene.bind(focus);
  focus.openInMainScene = (...args) => {
    const result = openIn(...args);
    interior?.root.removeFromParent();
    finishBall(focus.ball);
    liners = [];
    focus.ball.traverse(object => {
      if (!object.isMesh) return;
      for (const material of [].concat(object.material)) {
        if (/Inner ceramic liner/i.test(material?.name || '')) {
          if (!material.emissive || material.emissive.getHex() === 0) material.emissive = new THREE.Color('#ffcf93');
          material.emissiveIntensity = 0;
          liners.push(material);
        }
      }
    });
    interior = createInterior(focus.pokemonEntry?.shiny === true);
    focus.ball.add(interior.root);
    openness = 0;
    return result;
  };
  // Apply the realistic finish from the first frame of the flight, not at the hand-off.
  const flightPreview = focus.renderFlightPreview.bind(focus);
  focus.renderFlightPreview = (ball, ...rest) => {
    if (ball && !ball.userData.showcaseFinished) { finishBall(ball); ball.userData.showcaseFinished = true; }
    return flightPreview(ball, ...rest);
  };
  // After the ball opens, glide the display so the Pokémon's body centre becomes the
  // visual centre (zooming out a little for tall Pokémon); glide back when it closes.
  const focusState = { shift: 0, anchor: new THREE.Vector3(), anchored: false, zoomed: false };
  const bodyCentre = new THREE.Vector3();
  const updateFocusGlide = dt => {
    const group = focus.group, pokemon = focus.pokemon;
    const revealing = pokemon && ['opening', 'revealed'].includes(focus.mode);
    if (!group) { focusState.shift = 0; focusState.anchored = false; return; }
    if (revealing && !focusState.anchored) {
      group.getWorldPosition(focusState.anchor);
      focusState.anchored = true;
      if (!focusState.zoomed) {
        const tall = (pokemon.userData.bodyHeight || 1) * (pokemon.userData.displayScale || 1);
        focus.zoomTarget = Math.min(focus.zoomTarget || 1, THREE.MathUtils.clamp(1.12 - tall * .14, .8, 1));
        focusState.zoomed = true;
      }
    }
    let target = 0;
    if (revealing) {
      pokemon.localToWorld(bodyCentre.set(0, (pokemon.userData.bodyHeight || 1) * .5, 0));
      const camera = focus.camera;
      if (camera?.isPerspectiveCamera) {
        // Screen-space error of the body centre (aim slightly above centre for headroom).
        const distance = camera.position.distanceTo(bodyCentre);
        const ndcY = bodyCentre.clone().project(camera).y - .04;
        const worldPerNdc = Math.tan(THREE.MathUtils.degToRad(camera.fov) * .5) * distance;
        target = THREE.MathUtils.clamp(focusState.shift - ndcY * worldPerNdc, -2.5, 2.5);
      } else {
        target = focusState.anchor.y - (bodyCentre.y - focusState.shift);
      }
    } else if (!['opening', 'revealed'].includes(focus.mode)) {
      focusState.anchored = false;
      focusState.zoomed = false;
    }
    const next = THREE.MathUtils.damp(focusState.shift, target, 2.4, Math.min(dt, .05));
    group.position.y += next - focusState.shift;
    focusState.shift = next;
  };
  const update = focus.update.bind(focus);
  focus.update = dt => {
    update(dt);
    if (!focus.card && !focus.flight && !focus.minimizeState && focus.mode !== 'card-opening') updateFocusGlide(dt);
    else { focusState.shift = 0; focusState.anchored = false; focusState.zoomed = false; }
    if (!interior || !focus.ball || interior.root.parent !== focus.ball) {
      innerLight.intensity = rimLight.intensity = 0;
      return;
    }
    openness = THREE.MathUtils.damp(openness, openTarget(focus), 4.5, Math.min(dt, .05));
    light = THREE.MathUtils.damp(light, openness, 6, Math.min(dt, .05));
    interior.uniforms.open.value = openness;
    interior.uniforms.time.value = time.value;
    focus.ball.localToWorld(anchor.set(0, .35, 0));
    innerLight.position.copy(anchor);
    focus.ball.localToWorld(anchor.set(.3, 1.2, 1.5));
    rimLight.position.copy(anchor);
    innerLight.color.set(interior.shiny ? '#ffd88a' : '#ffe6c4');
    rimLight.color.set(interior.shiny ? '#ff9fdc' : '#9fdcff');
    innerLight.intensity = light * 6;
    rimLight.intensity = light * 7;
    for (const liner of liners) liner.emissiveIntensity = openness * .22;
  };
}
