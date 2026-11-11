// Capsule Works HD — "Midnight Atelier" look.
// A non-destructive render layer: no original module is edited. It hooks the
// shared three.js EffectComposer and, on the main machine scene only, adds:
//   · an ink-blue studio (reflections + seamless backdrop, no horizon line)
//   · a warm key spotlight pool on the set, fading into darkness
//   · cool rim light for silhouettes, crystal glass with lit Fresnel edges
//   · soft shadows, ambient occlusion (GTAO), drifting dust in the key beam
//   · a cinematic grade: contrast curve, split-tone, vignette, film grain
// Tune live from the console:  __capsuleHD.set({ exposure: 1.1, dust: 0.6 })

export function installRealism(deps, options = {}) {
  const { THREE, EffectComposer, GTAOPass, ShaderPass } = deps;
  const cfg = Object.assign({
    // palette
    ink: '#0f131b',          // floor fade, fog and backdrop horizon (one colour = seamless)
    inkTop: '#06080c',       // backdrop zenith
    keyColor: '#ffe2b8',
    rimColor: '#8fb4ff',
    // light balance
    exposure: 1.08,
    hemi: 0.35,
    keyShadow: 1.9,
    otherDirectional: 0.7,
    rectArea: 1.3,
    backWash: 0.3,           // the apricot cyclorama / rear factory washes
    spot: 260,
    rim: 3.4,
    rimWarm: 1.2,
    // floor light pool (world units)
    poolCenter: [-0.3, -1.6],
    poolInner: 6.0,
    poolOuter: 13.5,
    // atmosphere
    fogNear: 26,
    fogFar: 70,
    dust: 1.0,               // 0 disables the motes
    beam: 0.045,             // 0 disables the volumetric cone
    // post
    ao: true,
    aoIntensity: 0.9,
    aoRadius: 0.55,
    grade: true,
    contrast: 0.24,
    saturation: 1.06,
    splitTone: 1.0,
    vignette: 0.5,
    grain: 0.022,
    // materials
    envIntensityMetal: 1.45,
    envIntensityDielectric: 1.2,
    envIntensityGlass: 1.6,
    clearcoat: 0.55,
  }, options);

  const state = {
    cfg, composer: null, renderer: null, scene: null, camera: null,
    gtao: null, grade: null, backdrop: null, env: null, floor: null,
    dust: null, beam: null, spot: null, rim: null, rimWarm: null, frame: 0,
  };
  const treatedMaterials = new WeakSet();
  const treatedLights = new WeakSet();
  const glassMaterials = new Set();
  const glassName = /glass|acrylic|borosilicate|透明|玻璃|feeder tube/i;
  const groundName = /background|ground|apricot|fleece|floor|vanilla|butter|cyclorama/i;
  const isGlass = (m) => m.transmission > 0 || (m.transparent && glassName.test(m.name));
  const startTime = performance.now();

  // ------------------------------------------------------------------
  // Studio environment: ink room, one big warm key, cool strip lights,
  // and tall windows behind the camera that draw crisp streaks on glass.
  // ------------------------------------------------------------------
  function createEnvironment(renderer) {
    const studio = new THREE.Scene();
    studio.add(new THREE.Mesh(
      new THREE.SphereGeometry(40, 48, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#1a2030'), side: THREE.BackSide })
    ));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(38, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#3a332c') }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -6;
    studio.add(floor);
    const panels = [
      // [position, size, power, colour]
      [[-8, 24, 8], [16, 10], 12, '#fff0d8'],   // top key softbox
      [[20, 10, -4], [2, 18], 9, '#a9c6ff'],    // cool strip, right
      [[-20, 9, -6], [2, 16], 6, '#b7ccff'],    // cool strip, left
      [[0, 22, -16], [20, 2], 7, '#cfdcff'],    // rear top line
      [[16, 12, 22], [5, 18], 7, '#ffffff'],    // tall window behind camera: glass streak
      [[-16, 14, 18], [8, 12], 6, '#fff4e6'],   // front-left softbox
      [[2, 4, 24], [16, 4], 2.2, '#ffe0bc'],    // low bounce card
    ];
    for (const [position, size, power, colour] of panels) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(...size),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(power), side: THREE.DoubleSide })
      );
      mesh.position.fromArray(position);
      mesh.lookAt(0, 4, 0);
      studio.add(mesh);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const texture = pmrem.fromScene(studio, 0.012).texture;
    studio.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    pmrem.dispose();
    return texture;
  }

  // Backdrop dome: exactly the floor/fog ink at the horizon, deepening upward.
  function createBackdrop() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(cfg.inkTop) }, horizon: { value: new THREE.Color(cfg.ink) } },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
        void main() {
          vec3 col = mix(horizon, top, smoothstep(0.0, 0.9, clamp(vDir.y, -1.0, 1.0)));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 24), material);
    mesh.name = 'HD backdrop';
    mesh.renderOrder = -1000;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    mesh.onBeforeRender = (r, s, camera) => mesh.position.copy(camera.position);
    return mesh;
  }

  // ------------------------------------------------------------------
  // Material shaders
  // ------------------------------------------------------------------
  const FLOOR_KEY = 'hd-floor-pool-v4';
  const floorUniforms = {
    hdInk: { value: new THREE.Color(cfg.ink) },
    hdPool: { value: new THREE.Vector4(cfg.poolCenter[0], cfg.poolCenter[1], cfg.poolInner, cfg.poolOuter) },
  };
  function applyFloorPool(material) {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, floorUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 hdWorldPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nhdWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 hdWorldPos; uniform vec3 hdInk; uniform vec4 hdPool;')
        .replace('#include <opaque_fragment>', /* glsl */`
          float hdD = length((hdWorldPos.xz - hdPool.xy) * vec2(1.0, 1.05));
          float pool = 1.0 - smoothstep(hdPool.z, hdPool.w, hdD);
          pool = pool * pool * (3.0 - 2.0 * pool);
          float wall = smoothstep(0.5, 6.0, hdWorldPos.y);
          float k = clamp(pool * (1.0 - wall), 0.0, 1.0);
          vec3 dim = outgoingLight * mix(0.06, 0.82, k);
          outgoingLight = mix(hdInk, dim, smoothstep(0.0, 0.7, k));
          #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => FLOOR_KEY;
    material.needsUpdate = true;
  }

  // Crystal glass on a dark set: faint haze plus a lit Fresnel edge,
  // cool from above and warm from below, so the globe never reads as a void.
  const GLASS_KEY = 'hd-glass-crystal-v1';
  function applyCrystalGlass(material) {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */`
        float gF = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
        float gEdge = pow(1.0 - gF, 3.0);
        vec3 gUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        float gTop = smoothstep(-0.2, 0.9, dot(normalize(normal), gUp));
        outgoingLight += vec3(0.020, 0.024, 0.032);
        outgoingLight += mix(vec3(1.0, 0.86, 0.66), vec3(0.72, 0.84, 1.0), gTop) * gEdge * 0.85;
        diffuseColor.a = max(diffuseColor.a, gEdge * 0.65);
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => GLASS_KEY;
    material.needsUpdate = true;
  }

  function treatMaterial(material, maxAniso) {
    if (!material || treatedMaterials.has(material)) return;
    treatedMaterials.add(material);
    if (!material.isMeshStandardMaterial) return;
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
      const tex = material[key];
      if (tex && tex.anisotropy < maxAniso) { tex.anisotropy = maxAniso; tex.needsUpdate = true; }
    }
    const base = material.userData.hdBaseEnv ?? material.envMapIntensity;
    material.userData.hdBaseEnv = base;
    if (isGlass(material)) {
      material.envMapIntensity = base * cfg.envIntensityGlass;
      material.roughness = Math.min(material.roughness, 0.04);
      if (material.isMeshPhysicalMaterial) {
        material.ior = 1.5;
        material.specularIntensity = 1;
        glassMaterials.add(material);
        applyCrystalGlass(material);
      }
      return;
    }
    if (groundName.test(material.name)) { material.envMapIntensity = base * 0.85; return; }
    const metal = material.metalness >= 0.6;
    material.envMapIntensity = base * (metal ? cfg.envIntensityMetal : cfg.envIntensityDielectric);
    if (metal) { material.roughness = Math.max(0.12, material.roughness * 0.85); return; }
    // Glossy dielectrics (lacquer, enamel, moulded plastic) get a clear top coat.
    if (material.roughness < 0.5 && !material.map) {
      if (material.isMeshPhysicalMaterial) {
        const before = material.clearcoat;
        material.clearcoat = Math.max(before, cfg.clearcoat);
        material.clearcoatRoughness = Math.min(material.clearcoatRoughness || 0.08, 0.08);
        if (before === 0) material.needsUpdate = true;
      } else {
        material.roughness = Math.max(0.14, material.roughness * 0.82);
      }
    }
  }

  // ------------------------------------------------------------------
  // Lights
  // ------------------------------------------------------------------
  function inFocusRig(object) {
    for (let o = object.parent; o; o = o.parent) if (/Focus studio/i.test(o.name)) return true;
    return false;
  }

  function rebalanceLight(light) {
    treatedLights.add(light);
    if (inFocusRig(light)) return;            // the close-up viewer keeps its own lighting
    light.userData.hdBase = light.intensity;
    if (light.isHemisphereLight) light.intensity *= cfg.hemi;
    else if (light.isDirectionalLight) {
      if (light.castShadow) {
        light.intensity *= cfg.keyShadow;
        light.shadow.mapSize.set(4096, 4096);
        light.shadow.map?.dispose();
        light.shadow.map = null;
      } else light.intensity *= cfg.otherDirectional;
    } else if (light.isRectAreaLight) {
      light.intensity *= /apricot|rear factory|cyclorama/i.test(light.name) ? cfg.backWash : cfg.rectArea;
    }
  }

  function addStudioLights(scene) {
    const own = (light) => { treatedLights.add(light); light.userData.hdOwn = true; return light; };
    state.spot = own(new THREE.SpotLight(cfg.keyColor, cfg.spot, 60, 0.42, 0.85, 1.6));
    state.spot.position.set(-3, 24, 8);
    state.spot.target.position.set(0, 2, 0);
    state.rim = own(new THREE.DirectionalLight(cfg.rimColor, cfg.rim));
    state.rim.position.set(9, 10, -12);
    state.rimWarm = own(new THREE.DirectionalLight('#ffd3a0', cfg.rimWarm));
    state.rimWarm.position.set(-12, 8, -10);
    scene.add(state.spot, state.spot.target, state.rim, state.rimWarm);
  }

  // ------------------------------------------------------------------
  // Atmosphere: dust motes drifting through the key beam + a faint cone.
  // ------------------------------------------------------------------
  function createDust(renderer) {
    const count = 520;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(Math.random()) * 11;
      const a = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(a) * r - 1;
      positions[i * 3 + 1] = Math.random() * 16 + 0.5;
      positions[i * 3 + 2] = Math.sin(a) * r * 0.8;
      seeds[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uAmount: { value: cfg.dust } },
      vertexShader: /* glsl */`
        attribute float seed; uniform float uTime; uniform float uPR; varying float vA;
        void main() {
          vec3 p = position; float t = uTime * (0.05 + seed * 0.06);
          p.y = mod(p.y + t * 1.6, 16.0) + 0.5;
          p.x += sin(t * 2.0 + seed * 40.0) * 0.7;
          p.z += cos(t * 1.7 + seed * 23.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float beam = 1.0 - smoothstep(2.0, 9.0, length(p.xz - vec2(-1.0 + (16.0 - p.y) * 0.12, 0.6 + (16.0 - p.y) * 0.18)));
          float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + seed * 1.3) + seed * 60.0);
          vA = (0.10 + 0.9 * beam) * twinkle * smoothstep(0.5, 2.0, p.y) * (1.0 - smoothstep(13.0, 16.0, p.y));
          gl_PointSize = (1.2 + seed * 2.6) * uPR * (22.0 / -mv.z);
        }`,
      fragmentShader: /* glsl */`
        uniform float uAmount; varying float vA;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(vec3(1.0, 0.88, 0.7) * a * vA * 0.9 * uAmount, 1.0);
        }`,
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'HD dust';
    points.frustumCulled = false;
    points.renderOrder = 10;
    points.raycast = () => {};
    points.onBeforeRender = () => { material.uniforms.uTime.value = (performance.now() - startTime) / 1000; };
    return points;
  }

  function createBeam() {
    const geometry = new THREE.CylinderGeometry(0.4, 6.5, 26, 64, 1, true);
    geometry.translate(0, -13, 0);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uCol: { value: new THREE.Color('#ffd9a8') }, uK: { value: cfg.beam } },
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vV; varying float vH;
        void main() {
          vH = -position.y / 26.0;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uCol; uniform float uK; varying vec3 vN; varying vec3 vV; varying float vH;
        void main() {
          float soft = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
          float fade = smoothstep(0.0, 0.12, vH) * (1.0 - smoothstep(0.55, 0.95, vH));
          gl_FragColor = vec4(uCol * soft * fade * uK, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'HD key beam';
    mesh.raycast = () => {};
    mesh.position.set(-3, 24, 8);
    mesh.lookAt(0, 2, 0);
    mesh.rotateX(-Math.PI / 2);
    return mesh;
  }

  // ------------------------------------------------------------------
  // Final grade
  // ------------------------------------------------------------------
  function createGradePass() {
    return new ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
        uContrast: { value: cfg.contrast }, uSaturation: { value: cfg.saturation },
        uSplit: { value: cfg.splitTone }, uVignette: { value: cfg.vignette }, uGrain: { value: cfg.grain },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
        uniform float uContrast; uniform float uSaturation; uniform float uSplit; uniform float uVignette; uniform float uGrain;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec4 src = texture2D(tDiffuse, vUv);
          vec3 c = src.rgb;
          c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSaturation);
          // split-tone: cool ink shadows, warm highlights
          c += uSplit * (vec3(-0.006, 0.002, 0.020) * pow(1.0 - l, 2.0) + vec3(0.018, 0.008, -0.012) * l * l);
          vec2 d = vUv - 0.5; d.x *= uRes.x / uRes.y;
          c *= mix(1.0 - uVignette, 1.0, smoothstep(0.98, 0.22, length(d)));
          c += (hash(vUv * uRes + fract(uTime) * 97.0) - 0.5) * uGrain;
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
        }`,
    });
  }

  // ------------------------------------------------------------------
  // Scene pass (runs once, then periodically for streamed-in content)
  // ------------------------------------------------------------------
  function treatScene() {
    const { scene, renderer } = state;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const lightsReady = !document.getElementById('loading');   // the game finishes its own lighting first
    scene.traverse(object => {
      if (object.isMesh && object !== state.backdrop && object !== state.beam) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const m of materials) treatMaterial(m, maxAniso);
        if (!state.floor && /fleece/i.test(materials[0]?.name || '')) state.floor = object;
        if (!object.material?.transparent && !object.userData.hdShadowSet) {
          object.userData.hdShadowSet = true;
          object.receiveShadow = true;
        }
      }
      if (lightsReady && object.isLight && !treatedLights.has(object)) rebalanceLight(object);
    });
  }

  function isMainComposer(composer) {
    return !!composer.renderer?.domElement?.closest?.('#machine-stage');
  }

  function attach(composer) {
    const renderPass = composer.passes.find(p => p.scene && p.camera);
    if (!renderPass) return;
    const { scene, camera } = renderPass;
    const renderer = composer.renderer;
    Object.assign(state, { composer, renderer, scene, camera });

    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.needsUpdate = true;
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(Math.min(dpr * (window.innerWidth < 800 ? 1 : 1.15), window.innerWidth < 800 ? 1.5 : 2));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(renderer.domElement.clientWidth || window.innerWidth, renderer.domElement.clientHeight || window.innerHeight);

    state.env = createEnvironment(renderer);
    state.backdrop = createBackdrop();
    scene.add(state.backdrop);
    addStudioLights(scene);
    if (cfg.dust > 0) { state.dust = createDust(renderer); scene.add(state.dust); }
    if (cfg.beam > 0) { state.beam = createBeam(); scene.add(state.beam); }

    const w = composer._width * composer._pixelRatio;
    const h = composer._height * composer._pixelRatio;
    if (cfg.ao && GTAOPass) {
      const gtao = new GTAOPass(scene, camera, w, h);
      gtao.blendIntensity = cfg.aoIntensity;
      gtao.updateGtaoMaterial({ radius: cfg.aoRadius, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1.0 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      // Glass, the backdrop and atmosphere never occlude.
      const baseOverride = gtao.overrideVisibility.bind(gtao);
      gtao.overrideVisibility = function () {
        baseOverride();
        scene.traverse(o => {
          if (o === state.backdrop || o === state.beam) { o.visible = false; return; }
          if (o.isMesh && o.material && [].concat(o.material).some(m => m.transparent || m.transmission > 0)) o.visible = false;
        });
      };
      composer.insertPass(gtao, composer.passes.indexOf(renderPass) + 1);
      gtao.setSize(w, h);
      state.gtao = gtao;
    }
    if (cfg.grade && ShaderPass) {
      state.grade = createGradePass();
      state.grade.uniforms.uRes.value.set(w, h);
      composer.addPass(state.grade);
    }
    const originalSetSize = composer.setSize.bind(composer);
    composer.setSize = (width, height) => {
      originalSetSize(width, height);
      state.grade?.uniforms.uRes.value.set(width * composer._pixelRatio, height * composer._pixelRatio);
      if (state.dust) state.dust.material.uniforms.uPR.value = renderer.getPixelRatio();
    };
    treatScene();
    scene.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => m && (m.needsUpdate = true)); });
  }

  function everyFrame() {
    const { scene, renderer } = state;
    if (!scene) return;
    state.frame++;
    if (scene.environment !== state.env) scene.environment = state.env;
    if (scene.fog) { scene.fog.color.set(cfg.ink); scene.fog.near = cfg.fogNear; scene.fog.far = cfg.fogFar; }
    if (scene.background?.isColor) scene.background.set(cfg.inkTop);
    renderer.toneMappingExposure = cfg.exposure;
    if (state.grade) state.grade.uniforms.uTime.value = performance.now() / 1000;
    // The game loads its factory after the first frame and refines some materials
    // itself, so rescan often during start-up and keep our shaders asserted.
    if (state.frame % (state.frame < 600 ? 10 : 45) === 0) treatScene();
    const floorMaterial = state.floor?.material;
    if (floorMaterial && floorMaterial.customProgramCacheKey?.() !== FLOOR_KEY) applyFloorPool(floorMaterial);
    for (const material of glassMaterials) {
      if (material.customProgramCacheKey?.() !== GLASS_KEY) applyCrystalGlass(material);
    }
  }

  const proto = EffectComposer.prototype;
  if (!proto.__hdPatched) {
    proto.__hdPatched = true;
    const originalRender = proto.render;
    proto.render = function (delta) {
      if (!this.__hdChecked) {
        this.__hdChecked = true;
        if (isMainComposer(this)) attach(this);
      }
      if (this === state.composer) everyFrame();
      return originalRender.call(this, delta);
    };
  }

  // Live tuning
  state.set = (patch) => {
    Object.assign(cfg, patch);
    if (state.grade) {
      const u = state.grade.uniforms;
      u.uContrast.value = cfg.contrast; u.uSaturation.value = cfg.saturation; u.uSplit.value = cfg.splitTone;
      u.uVignette.value = cfg.vignette; u.uGrain.value = cfg.grain;
    }
    if (state.gtao) { state.gtao.blendIntensity = cfg.aoIntensity; state.gtao.updateGtaoMaterial({ radius: cfg.aoRadius }); }
    if (state.backdrop) {
      const u = state.backdrop.material.uniforms;
      u.top.value.set(cfg.inkTop); u.horizon.value.set(cfg.ink);
    }
    if (state.spot) { state.spot.intensity = cfg.spot; state.spot.color.set(cfg.keyColor); }
    if (state.rim) { state.rim.intensity = cfg.rim; state.rim.color.set(cfg.rimColor); }
    if (state.rimWarm) state.rimWarm.intensity = cfg.rimWarm;
    if (state.dust) state.dust.material.uniforms.uAmount.value = cfg.dust;
    if (state.beam) state.beam.material.uniforms.uK.value = cfg.beam;
    floorUniforms.hdInk.value.set(cfg.ink);
    floorUniforms.hdPool.value.set(cfg.poolCenter[0], cfg.poolCenter[1], cfg.poolInner, cfg.poolOuter);
  };
  window.__capsuleHD = state;
  return state;
}
