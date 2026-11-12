import * as THREE from 'three';
import { NOISE_GLSL } from './sky.js';

/** A soft volumetric light shaft (additive cone), with drifting dust streaks inside. */
export function createLightShaft({ from, to, radiusTop = .25, radiusBottom = 4.6, color = '#ffe2b8', intensity = .16, time }) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 48, 24, true);
  geometry.translate(0, -length / 2, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { dsTime: time, shaftColor: { value: new THREE.Color(color) }, intensity: { value: intensity }, shaftLength: { value: length } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vNormalV, vViewV, vLocal;
      void main() {
        vLocal = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float dsTime, intensity, shaftLength;
      uniform vec3 shaftColor;
      varying vec3 vNormalV, vViewV, vLocal;
      ${NOISE_GLSL}
      void main() {
        float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
        float body = pow(facing, 2.2);
        float along = clamp(-vLocal.y / shaftLength, 0.0, 1.0);
        float fade = smoothstep(0.0, .18, along) * (1.0 - smoothstep(.72, 1.0, along));
        float angle = atan(vLocal.z, vLocal.x);
        float streaks = .55 + .45 * dsNoise(vec2(angle * 5.0, along * 3.0 - dsTime * .12));
        float dust = dsFbm(vec2(angle * 2.0 + dsTime * .03, along * 6.0 - dsTime * .2));
        float a = body * fade * streaks * (.65 + .7 * dust) * intensity;
        gl_FragColor = vec4(shaftColor * a, 1.0);
      }`,
  });
  const shaft = new THREE.Mesh(geometry, material);
  shaft.position.copy(from);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.normalize());
  shaft.name = 'Dreamscape / volumetric light shaft';
  shaft.renderOrder = 30;
  shaft.frustumCulled = false;
  return shaft;
}

/** Glowing motes and fireflies drifting through the factory, gently pulsing. */
export function createFireflies({ center, time, count = 340 }) {
  let seed = 991;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const positions = [], data = [], colors = [];
  const warm = new THREE.Color('#ffd28a'), cool = new THREE.Color('#8ff3ff'), rose = new THREE.Color('#ffb0e6');
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 3.5 + Math.pow(random(), .8) * 30;
    const height = random() < .45 ? random() * 2.2 : random() * 13;
    positions.push(center.x + Math.cos(angle) * radius, -.4 + height, center.y + Math.sin(angle) * radius);
    data.push(random() * 100, .6 + random() * 1.4, Math.pow(random(), 4));
    const pick = random();
    const color = (pick < .62 ? warm : pick < .88 ? cool : rose).clone().multiplyScalar(3.2 + random() * 3.5);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('motion', new THREE.Float32BufferAttribute(data, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { dsTime: time, pixelRatio: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, fog: false,
    vertexShader: /* glsl */`
      attribute vec3 motion;
      uniform float dsTime, pixelRatio;
      varying vec3 vColor; varying float vBokeh;
      void main() {
        float ph = motion.x, sp = motion.y;
        vec3 p = position;
        p.x += sin(dsTime * .23 * sp + ph) * .9 + sin(dsTime * .61 * sp + ph * 2.1) * .3;
        p.y += sin(dsTime * .31 * sp + ph * 1.7) * .55;
        p.z += cos(dsTime * .19 * sp + ph * .7) * .9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float pulse = pow(.5 + .5 * sin(dsTime * (1.1 + sp) + ph * 3.0), 3.0);
        float depth = -mv.z;
        // Out-of-focus motes become larger, fainter bokeh discs.
        vBokeh = smoothstep(14.0, 4.0, depth) + smoothstep(32.0, 55.0, depth) * .6;
        vColor = color * (.25 + pulse * .9) * mix(1.0, .45, vBokeh);
        gl_PointSize = clamp((1.6 + motion.z * 5.0 + vBokeh * 9.0) * pixelRatio * 26.0 / depth, 1.0, 40.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vBokeh;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.0;
        float core = exp(-d * d * 10.0);
        float disc = (1.0 - smoothstep(.7, 1.0, d)) * .35;
        float a = mix(core, disc + core * .3, clamp(vBokeh, 0.0, 1.0));
        if (a < .004) discard;
        gl_FragColor = vec4(vColor * a, 1.0);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'Dreamscape / fireflies and dust motes';
  points.frustumCulled = false;
  points.renderOrder = 40;
  points.onBeforeRender = renderer => { material.uniforms.pixelRatio.value = renderer.getPixelRatio(); };
  return points;
}

/** Cool moonlight and sky ambience that frame the warm machine without flattening it. */
export function addMoonlight(scene) {
  const moon = new THREE.DirectionalLight('#8aa6ff', .9);
  moon.name = 'Dreamscape moonlight rim';
  moon.position.set(-24, 30, -34);
  moon.target.position.set(0, 3, 0);
  const sky = new THREE.HemisphereLight('#2b3d7a', '#07060c', .3);
  sky.name = 'Dreamscape galaxy ambience';
  const pool = new THREE.PointLight('#ffb36b', 38, 16, 2);
  pool.name = 'Dreamscape warm outlet pool';
  pool.position.set(.4, 1.6, 6.2);
  scene.add(moon, moon.target, sky, pool);
  return { moon, sky, pool };
}

/** Fine airborne dust: dim specks that flare when they sit in front of the light (forward scattering). */
export function createDust({ center, time, lightDirection, count = 2600 }) {
  let seed = 4421;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const positions = [], data = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 17;
    positions.push(center.x + Math.cos(angle) * radius, -.5 + Math.pow(random(), .8) * 13, center.y + Math.sin(angle) * radius);
    data.push(random() * 100, .3 + random() * .9, random());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('motion', new THREE.Float32BufferAttribute(data, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { dsTime: time, viewHeight: { value: 1000 }, lightDirection: { value: lightDirection } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      attribute vec3 motion;
      uniform float dsTime, viewHeight;
      uniform vec3 lightDirection;
      varying float vGlow;
      void main() {
        float ph = motion.x, sp = motion.y;
        vec3 p = position;
        // Slow convection: rising, swirling, settling.
        p.y += mod(dsTime * .05 * sp + ph, 4.0) - 2.0;
        p.x += sin(dsTime * .17 * sp + ph) * .6 + sin(dsTime * .53 + ph * 3.1) * .08;
        p.z += cos(dsTime * .13 * sp + ph * 1.3) * .6;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vec4 mv = viewMatrix * world;
        gl_Position = projectionMatrix * mv;
        vec3 toward = normalize(world.xyz - cameraPosition);
        float forward = pow(max(dot(toward, lightDirection), 0.0), 5.0);
        float flick = .65 + .35 * sin(dsTime * (1.0 + sp * 2.0) + ph * 7.0);
        float depth = -mv.z;
        vGlow = (.10 + 1.8 * forward) * flick * smoothstep(1.0, 3.0, depth) * (1.0 - smoothstep(26.0, 42.0, depth));
        float size = .018 + .03 * motion.z;
        gl_PointSize = clamp(size * projectionMatrix[1][1] * viewHeight * .5 / depth, 1.0, 6.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.0;
        float a = exp(-d * d * 5.0) * vGlow;
        if (a < .003) discard;
        gl_FragColor = vec4(vec3(1.0, .93, .82) * a, 1.0);
      }`,
  });
  const dust = new THREE.Points(geometry, material);
  dust.name = 'Dreamscape / airborne dust';
  dust.frustumCulled = false;
  dust.renderOrder = 41;
  const size = new THREE.Vector2();
  dust.onBeforeRender = renderer => { material.uniforms.viewHeight.value = renderer.getDrawingBufferSize(size).y; };
  return dust;
}

/**
 * A ring of low-lying mist around the whole scene. It is fully fog-coloured at the
 * ground and fades out above eye level, so wherever the far ground meets the sky the
 * transition is buried in soft, slowly drifting haze — no skyline seam in any direction.
 */
export function createHorizonMist({ center, fogColor, time, radius = 72 }) {
  const geometry = new THREE.CylinderGeometry(radius, radius, 46, 128, 1, true);
  geometry.translate(center.x, 22, center.y);
  const material = new THREE.ShaderMaterial({
    uniforms: { fogColor: { value: fogColor }, dsTime: time },
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 fogColor; uniform float dsTime; varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        float a = atan(vWorld.z, vWorld.x);
        vec2 p = vec2(a * 12.0 + dsTime * .025, vWorld.y * .18);
        float drift = dsFbm(p) * .7 + dsFbm(p * 2.3 - vec2(dsTime * .04, 0.0)) * .3;
        // Solid at the ground, a long soft fade through and above eye level.
        float top = 15.0 + drift * 9.0;
        float alpha = 1.0 - smoothstep(5.0, top, vWorld.y);
        alpha = pow(alpha, 1.35);
        // At its foot the mist is exactly the horizon colour the ground fades to, so the two
        // meet without a line; the drifting brightness only builds up above the ground.
        float lift = smoothstep(-.7, 7.0, vWorld.y);
        vec3 c = fogColor * (1.0 + lift * (.28 * drift + .18 * exp(-pow((vWorld.y - 8.0) / 6.0, 2.0))));
        gl_FragColor = vec4(c, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mist = new THREE.Mesh(geometry, material);
  mist.name = 'Dreamscape / horizon mist ring';
  mist.renderOrder = -60;
  mist.frustumCulled = false;
  return mist;
}
