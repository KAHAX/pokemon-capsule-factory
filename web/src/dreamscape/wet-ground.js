import * as THREE from 'three';
import { mobileEdition } from '../mobile-performance.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { NOISE_GLSL } from './sky.js';

/**
 * Rain-soaked stone ground: planar mirror reflections, crisp puddles with slow ripples,
 * blurred streaky reflections on the damp stone, faint glints and a luminous stage ring.
 */
export function createWetGround({ renderer, camera, time, center, groundY, size = 400 }) {
  const quality = mobileEdition ? .3 : window.innerWidth < 800 ? .35 : .5;
  const reflector = new Reflector(new THREE.PlaneGeometry(size, size), {
    textureWidth: 512, textureHeight: 512, clipBias: .003,
    multisample: mobileEdition || window.innerWidth < 800 ? 0 : 4,
  });
  const renderTarget = reflector.getRenderTarget();
  const textureMatrix = reflector.material.uniforms.textureMatrix.value;
  reflector.material.dispose();

  const uniforms = {
    dsReflectMap: { value: renderTarget.texture },
    dsReflectMatrix: { value: textureMatrix },
    dsTime: time,
    dsCenter: { value: new THREE.Vector2(center.x, center.y) },
    dsReflectTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
  };
  const material = new THREE.MeshStandardMaterial({ color: '#0b0d14', roughness: .5, metalness: 0, envMapIntensity: 0 });
  material.name = 'Dreamscape wet stone ground';
  material.userData.noToon = true;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'uniform mat4 dsReflectMatrix;\nvarying vec3 dsWorld;\nvarying vec4 dsReflectCoord;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      dsWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      dsReflectCoord = dsReflectMatrix * vec4(transformed, 1.0);`);
    shader.fragmentShader = /* glsl */`
      uniform sampler2D dsReflectMap;
      uniform float dsTime;
      uniform vec2 dsCenter, dsReflectTexel;
      varying vec3 dsWorld;
      varying vec4 dsReflectCoord;
      ${NOISE_GLSL}
      float dsPuddle, dsDamp, dsStone;
      vec2 dsBump, dsRippleN;
      vec3 dsAlbedo;
      vec2 dsRipple(vec2 p) {
        vec2 cell = floor(p);
        float h = dsHash(cell + 3.7);
        vec2 c = cell + .25 + .5 * vec2(dsHash(cell + 1.3), dsHash(cell + 2.9));
        float t = fract(dsTime * .23 + h * 7.0);
        vec2 d = p - c;
        float dist = length(d);
        float front = dist - t * .55;
        float ring = sin(front * 46.0) * exp(-abs(front) * 18.0) * (1.0 - t) * (1.0 - smoothstep(.32, .48, dist));
        return d / max(dist, 1e-3) * ring * step(.45, h);
      }
      void dsGround() {
        vec2 p = dsWorld.xz;
        float large = dsFbm(p * .075 + vec2(3.1, -1.7));
        float detail = dsFbm(p * .38 - 7.0);
        float field = large * .8 + detail * .2;
        float r = length(p - dsCenter);
        // Slightly wetter around the stage so the hero machine always has mirrors nearby.
        field += .05 * exp(-pow((r - 12.5) / 6.0, 2.0));
        dsPuddle = smoothstep(.535, .565, field);
        dsDamp = smoothstep(.42, .54, field);
        // Large flagstones with soft seams.
        vec2 q = p * .42 + vec2(dsNoise(p * .3), dsNoise(p * .3 + 9.0)) * .35;
        vec2 f = abs(fract(q) - .5);
        float seam = smoothstep(.47, .5, max(f.x, f.y));
        dsStone = .72 + .55 * detail;
        dsAlbedo = vec3(.050, .056, .074) * dsStone * (1.0 - seam * .55);
        dsAlbedo *= mix(1.0, .55, dsDamp);
        dsAlbedo = mix(dsAlbedo, vec3(.008, .010, .016), dsPuddle);
        float e = .06;
        float n0 = dsNoise(p * 2.6), nx = dsNoise((p + vec2(e, 0.0)) * 2.6), nz = dsNoise((p + vec2(0.0, e)) * 2.6);
        dsBump = vec2(n0 - nx, n0 - nz) * 1.6 * (1.0 - dsPuddle) + vec2(seam) * .0;
        dsRippleN = dsRipple(p * 1.6) + dsRipple(p * 1.6 + 17.3) * .7;
        dsRippleN += (vec2(dsNoise(p * 1.1 + dsTime * .15), dsNoise(p * 1.1 - dsTime * .12 + 4.0)) - .5) * .18;
        dsRippleN *= dsPuddle;
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        dsGround();
        diffuseColor.rgb = dsAlbedo;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(.68, .40, dsDamp), .06, dsPuddle);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 dsTilt = dsBump * .22 + dsRippleN * .35;
        normal = normalize(normal + (viewMatrix * vec4(dsTilt.x, 0.0, dsTilt.y, 0.0)).xyz);`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 V = normalize(vViewPosition);
          float facing = clamp(dot(normal, V), 0.0, 1.0);
          float fres = .42 + .58 * pow(1.0 - facing, 2.4);
          vec4 rc = dsReflectCoord;
          vec2 warp = dsRippleN * .05 + dsBump * .012;
          vec2 ruv = rc.xy / rc.w + warp;
          vec3 sharp = texture2D(dsReflectMap, ruv).rgb;
          // Wet-asphalt streaks: blur mostly along the vertical screen axis.
          vec3 streak = vec3(0.0);
          float jitter = dsHash(gl_FragCoord.xy) - .5;
          for (int i = 0; i < 8; i++) {
            float o = (float(i) - 3.5 + jitter) / 3.5;
            streak += texture2D(dsReflectMap, ruv + vec2(o * .004, o * .045) * (1.0 - dsDamp * .5)).rgb;
          }
          streak /= 8.0;
          vec3 refl = mix(streak, sharp, dsPuddle);
          float camDist = length(vViewPosition);
          float amount = mix(mix(.10, .32, dsDamp), .96, dsPuddle) * fres * (1.0 - smoothstep(22.0, 60.0, camDist));
          outgoingLight = outgoingLight * (1.0 - amount * .8) + refl * amount;

          // Single laser ring: white-hot core, cyan-violet glow and a wide soft halo.
          vec2 p = dsWorld.xz;
          float r = length(p - dsCenter);
          float ang = atan(p.y - dsCenter.y, p.x - dsCenter.x);
          float dr = abs(r - 12.3);
          float w = fwidth(r);
          float core = 1.0 - smoothstep(.012, .012 + w * 1.5, dr);
          float glow = exp(-dr * dr / .010);
          float halo = exp(-dr * dr / .55);
          float flicker = .92 + .08 * sin(dsTime * 31.0 + ang * 3.0) * sin(dsTime * 7.0);
          float sweep = .75 + .25 * pow(.5 + .5 * sin(ang - dsTime * .9), 6.0);
          vec3 laser = mix(vec3(.25, .78, 1.0), vec3(.70, .45, 1.0), .5 + .5 * sin(ang * 1.5 + dsTime * .25));
          outgoingLight += (vec3(1.0, .97, 1.0) * core * 5.5 + laser * (glow * 1.6 + halo * .09)) * flicker * sweep;
          // The laser also lights the wet stone around it.
          outgoingLight += laser * dsAlbedo * halo * 6.0;

          // Cool low-lying mist glow and sparse twinkling glints on the wet stone.
          float mist = dsFbm(p * .045 + vec2(dsTime * .015, -dsTime * .01));
          outgoingLight += vec3(.020, .045, .070) * smoothstep(.35, .8, mist) * (1.0 - smoothstep(25.0, 90.0, r));
          vec2 sg = p * 7.0;
          vec2 sc = floor(sg);
          float sh = dsHash(sc + 31.0);
          vec2 sp = fract(sg) - .5 - (vec2(dsHash(sc + 5.0), dsHash(sc + 9.0)) - .5) * .6;
          float glint = step(.988, sh) * exp(-dot(sp, sp) * 260.0) * pow(.5 + .5 * sin(dsTime * 1.6 + sh * 70.0), 8.0);
          outgoingLight += vec3(.75, .88, 1.0) * glint * 2.2 * dsDamp * (1.0 - dsPuddle) * (1.0 - smoothstep(14.0, 34.0, length(vViewPosition)));
        }
        #include <opaque_fragment>`)
      .replace('#include <fog_fragment>', '')
      .replace('#include <tonemapping_fragment>', `#include <fog_fragment>
        {
          // Dissolve the ground into the sky's horizon colour by viewing angle, so the far
          // ground and the sky meet without any visible skyline.
          vec3 dsLook = normalize(dsWorld - cameraPosition);
          // Distance term covers the far clip plane edge, the angle term the skyline itself.
          float dsHaze = max(1.0 - smoothstep(0.0, .22, -dsLook.y), smoothstep(34.0, 85.0, length(dsWorld - cameraPosition)));
          dsHaze = dsHaze * dsHaze * (3.0 - 2.0 * dsHaze);
          // The ground also melts into the haze with distance from the stage, reaching the
          // pure horizon colour before the mist wall (radius 72) — so the foot of the mist
          // never shows as an edge, wherever the camera stands.
          float dsOut = smoothstep(26.0, 66.0, length(dsWorld.xz - dsCenter));
          dsHaze = max(dsHaze, dsOut * dsOut * (3.0 - 2.0 * dsOut) * .35 + dsOut * .65);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, dsHaze);
        }
        // Match the sky in linear radiance before exposure/display conversion.
        #include <tonemapping_fragment>`);
  };
  material.customProgramCacheKey = () => 'dreamscape-wet-ground-v6-soft-mist-foot';
  reflector.material = material;
  reflector.userData.uniforms = uniforms;
  reflector.name = 'Dreamscape / wet reflective ground';
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(0, groundY, 0);
  reflector.receiveShadow = true;
  reflector.castShadow = false;
  reflector.renderOrder = -80;

  // Only the hero camera's colour pass refreshes the mirror (not depth/override passes or overlays).
  // Glass transmission is skipped inside the mirror (it would re-render the whole factory),
  // and while the camera is still the mirror refreshes at half rate.
  const mirror = reflector.onBeforeRender;
  const lastView = new THREE.Matrix4();
  let lastReflectionTime = -Infinity;
  let frame = 0, glass = [], nextScan = 0, lastFrame = -1;
  reflector.onBeforeRender = function (r, scene, cam, ...rest) {
    if (cam !== camera || scene.overrideMaterial) return;
    // Transmission and beauty can both visit this floor with the same camera.
    // One reflection image is sufficient for both visits in a frame.
    const renderFrame = scene.userData.mainRenderFrame;
    if (lastFrame === renderFrame) return;
    lastFrame = renderFrame;
    const width = Math.max(2, Math.round(r.domElement.width * quality));
    const height = Math.max(2, Math.round(r.domElement.height * quality));
    let resized = false;
    if (renderTarget.width !== width || renderTarget.height !== height) {
      renderTarget.setSize(width, height);
      uniforms.dsReflectTexel.value.set(1 / width, 1 / height);
      resized = true;
    }
    // Ignore imperceptible residual OrbitControls/parallax damping.
    const moved = lastView.elements.some((value, i) => Math.abs(value - cam.matrixWorld.elements[i]) > .0001);
    frame++;
    if (mobileEdition) {
      if (!resized && performance.now() - lastReflectionTime < (moved ? 100 : 200)) return;
      lastReflectionTime = performance.now();
    } else if (!moved && !resized && frame % 2) return;
    lastView.copy(cam.matrixWorld);
    const now = performance.now();
    if (now > nextScan) {
      glass = [];
      scene.traverse(o => { if (o.isMesh && [].concat(o.material).some(m => m?.transmission > 0)) glass.push(o); });
      nextScan = now + 2000;
    }
    const hidden = glass.filter(o => o.visible);
    hidden.forEach(o => { o.visible = false; });
    try { mirror.call(this, r, scene, cam, ...rest); }
    finally { hidden.forEach(o => { o.visible = true; }); }
  };
  return reflector;
}
