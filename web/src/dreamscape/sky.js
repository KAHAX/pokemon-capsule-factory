import * as THREE from 'three';

// Shared GLSL noise for the sky, ground and haze.
export const NOISE_GLSL = /* glsl */`
  float dsHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float dsHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float dsNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dsHash(i), dsHash(i + vec2(1, 0)), u.x), mix(dsHash(i + vec2(0, 1)), dsHash(i + vec2(1, 1)), u.x), u.y);
  }
  float dsNoise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = mix(mix(dsHash3(i), dsHash3(i + vec3(1,0,0)), u.x), mix(dsHash3(i + vec3(0,1,0)), dsHash3(i + vec3(1,1,0)), u.x), u.y);
    float b = mix(mix(dsHash3(i + vec3(0,0,1)), dsHash3(i + vec3(1,0,1)), u.x), mix(dsHash3(i + vec3(0,1,1)), dsHash3(i + vec3(1,1,1)), u.x), u.y);
    return mix(a, b, u.z);
  }
  float dsFbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * dsNoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return v;
  }
  float dsFbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * dsNoise3(p); p = p * 2.07 + vec3(11.3, 5.7, 3.1); a *= 0.5; }
    return v;
  }
`;

/**
 * World → galactic frame. The galactic core sits just above the horizon,
 * offset to the right of the hero view, with the band rising across the sky.
 */
export function createGalaxyFrame({ viewDirection, azimuthOffset = 0.42, elevation = 0.07, tilt = 0.62 }) {
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(viewDirection.x, 0, viewDirection.z).normalize();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const core = forward.clone().multiplyScalar(Math.cos(azimuthOffset))
    .addScaledVector(right, Math.sin(azimuthOffset))
    .multiplyScalar(Math.cos(elevation)).addScaledVector(up, Math.sin(elevation)).normalize();
  const horizontal = new THREE.Vector3().crossVectors(up, core).normalize();
  const vertical = new THREE.Vector3().crossVectors(core, horizontal).normalize();
  const tangent = horizontal.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(vertical, Math.sin(tilt)).normalize();
  const normal = new THREE.Vector3().crossVectors(core, tangent).normalize();
  const matrix = new THREE.Matrix3().set(
    core.x, core.y, core.z,
    normal.x, normal.y, normal.z,
    tangent.x, tangent.y, tangent.z,
  );
  return { matrix, core, normal, tangent };
}

export function createGalaxySky({ texture, frame, fogColor, time }) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      skyMap: { value: texture },
      galaxyFrame: { value: frame.matrix },
      horizonColor: { value: fogColor },
      dsTime: time,
      galaxyGain: { value: .8 },
    },
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D skyMap;
      uniform mat3 galaxyFrame;
      uniform vec3 horizonColor;
      uniform float dsTime, galaxyGain;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 dir = normalize(vDir);
        vec3 g = galaxyFrame * dir;
        float lon = atan(g.z, g.x);
        float lat = asin(clamp(g.y, -1.0, 1.0));
        vec2 uv = vec2(0.5 - lon / 6.2831853, 0.5 + lat / 3.14159265);
        vec3 photo = textureLod(skyMap, uv, 0.0).rgb;
        float lum = dot(photo, vec3(.2126, .7152, .0722));

        // Stylised galaxy: real dust lanes and star clouds, recoloured to a dream palette.
        float band = exp(-lat * lat / 0.018);
        float wideBand = exp(-lat * lat / 0.09);
        float coreGlow = exp(-(lon * lon) / 0.22 - lat * lat / 0.02);
        vec3 palette = mix(vec3(.10, .18, .55), vec3(.62, .30, .85), smoothstep(.05, .35, lum));
        palette = mix(palette, vec3(1.0, .72, .55), smoothstep(.30, .75, lum));
        vec3 galaxy = mix(photo * vec3(.75, .85, 1.25), palette * lum * 2.2, .55) * 1.65;
        galaxy *= .55 + .9 * wideBand;

        // Soft nebula clouds drifting along the band.
        float neb = dsFbm3(g * 3.2 + vec3(0.0, 0.0, dsTime * .004));
        float neb2 = dsFbm3(g * 7.0 - vec3(dsTime * .003, 0.0, 0.0));
        vec3 nebula = mix(vec3(.05, .55, .75), vec3(.85, .22, .70), smoothstep(.35, .7, neb2));
        galaxy += nebula * pow(neb, 2.6) * wideBand * .34;
        galaxy += vec3(1.0, .78, .62) * coreGlow * .30;

        // Deep zenith → luminous teal horizon, matching the scene fog exactly.
        float h = dir.y;
        vec3 zenith = vec3(.006, .010, .032);
        vec3 mid = vec3(.015, .028, .070);
        vec3 sky = mix(mid, zenith, smoothstep(.05, .7, h));
        // The horizon value equals the fog colour, so the far ground melts into the sky.
        // Flat derivative at the horizon: no crease when the view crosses eye level.
        float aboveHorizon = max(h, 0.0);
        float horizonGlow = exp(-4.0 * aboveHorizon * aboveHorizon / (aboveHorizon + .045));
        sky = mix(sky, horizonColor, horizonGlow);
        sky += horizonColor * .25 * exp(-pow((h - .08) / .10, 2.0)) * smoothstep(0.0, .08, h);
        vec3 color = sky + galaxy * galaxyGain * smoothstep(.0, .22, h);

        // Thin aurora-like veil low on the horizon for a dreamy edge.
        float veil = dsFbm(vec2(atan(dir.z, dir.x) * 3.0 + dsTime * .01, h * 6.0));
        // The old step(0,h) switched this veil on instantly, leaving a horizontal
        // stripe even behind the mist. Fade the radiance, not just the geometry.
        color += vec3(.10, .45, .55) * pow(veil, 3.0) * exp(-aboveHorizon * 14.0) * .22 * smoothstep(0.0, .085, h);
        // Alpha 0 marks open sky for the light-shaft pass (opaque material: no blending).
        gl_FragColor = vec4(color, 0.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 32), material);
  sky.name = 'Dreamscape / galaxy sky dome';
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    camera.getWorldPosition(sky.position);
    sky.updateMatrixWorld();
  };
  return sky;
}

/** Twinkling star field, denser along the galactic band, with a few flared hero stars. */
export function createStarField({ frame, time, count = 4200 }) {
  let seed = 7319;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-6))) * Math.cos(2 * Math.PI * random());
  const inverse = new THREE.Matrix3().copy(frame.matrix).transpose();
  const positions = [], sizes = [], colors = [], phases = [];
  const palette = ['#bcd4ff', '#e6eeff', '#ffe7c4', '#a9c8ff', '#ffd2f0', '#c9fff6'].map(c => new THREE.Color(c));
  const local = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const inBand = random() < .55;
    const lon = random() * Math.PI * 2;
    const lat = inBand ? gaussian() * .16 : Math.asin(random() * 2 - 1);
    local.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).applyMatrix3(inverse);
    if (local.y < -.02) { i--; continue; }
    local.multiplyScalar(120);
    positions.push(local.x, local.y, local.z);
    const magnitude = Math.pow(random(), 9);
    sizes.push(.8 + magnitude * 9);
    const color = palette[Math.floor(random() * palette.length)].clone()
      .multiplyScalar(.35 + random() * .6 + magnitude * 5);
    colors.push(color.r, color.g, color.b);
    phases.push(random() * 100);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('starSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { dsTime: time, pixelRatio: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, fog: false,
    vertexShader: /* glsl */`
      attribute float starSize; attribute float phase;
      uniform float dsTime, pixelRatio;
      varying vec3 vColor; varying float vFlare;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_Position.z = gl_Position.w * .99999;
        float twinkle = .65 + .35 * sin(dsTime * (1.2 + fract(phase) * 2.6) + phase);
        float horizon = smoothstep(.02, .16, normalize(position).y);
        vColor = color * twinkle * horizon;
        vFlare = smoothstep(3.0, 8.0, starSize);
        gl_PointSize = clamp(starSize * pixelRatio * 1.6, 1.0, 34.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vFlare;
      void main() {
        vec2 p = gl_PointCoord - .5;
        float d = length(p) * 2.0;
        float core = exp(-d * d * 18.0);
        float halo = exp(-d * d * 3.5) * .25;
        float flare = (exp(-abs(p.x) * 60.0) + exp(-abs(p.y) * 60.0)) * (1.0 - smoothstep(.2, 1.0, d)) * vFlare * .6;
        float a = core + halo * (.4 + vFlare) + flare;
        if (a < .004) discard;
        gl_FragColor = vec4(vColor * a, 1.0);
      }`,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'Dreamscape / twinkling star field';
  stars.frustumCulled = false;
  stars.renderOrder = -99;
  stars.onBeforeRender = (renderer, _scene, camera) => {
    camera.getWorldPosition(stars.position);
    stars.updateMatrixWorld();
    material.uniforms.pixelRatio.value = renderer.getPixelRatio();
  };
  return stars;
}
