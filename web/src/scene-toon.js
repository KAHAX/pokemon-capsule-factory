import { companionOutlines } from './companion-rendering.js';
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { getDisplaySettings } from './debug-settings.js';

// Band lighting, not texture colours. Keep transmission, emission and glossy reflections intact.
export function createSceneToon(scene, camera, depthOfField) {
  const toon = { value: 0 };
  const lightDirection = { value: new THREE.Vector3() };
  const worldKey = new THREE.Vector3(-0.45, 0.8, 0.5).normalize();
  const treated = new WeakSet();
  let nextScan = 0;
  function scan() {
    scene.traverse(object => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material?.isMeshStandardMaterial || treated.has(material)) continue;
        treated.add(material);
        // Poké Balls stay physically shaded everywhere, so they look the same in the
        // factory and in the observation overlay (no style switch at the hand-off).
        if (material.userData.noToon || material.transmission > 0 || material.transparent
          || /FLEECE|glass|screen|lacquer|Porcelain|Equator charcoal|ceramic liner|sealing lip|Button polished|golden yellow|Luxury|machined gold/i.test(material.name)) continue;
        const compile = material.onBeforeCompile;
        const key = material.customProgramCacheKey();
        material.onBeforeCompile = function(shader, renderer) {
          compile.call(this, shader, renderer);
          shader.uniforms.sceneToonAmount = toon;
          shader.uniforms.sceneToonDirection = lightDirection;
          shader.fragmentShader = 'uniform float sceneToonAmount; uniform vec3 sceneToonDirection;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_fragment>', `
            if (sceneToonAmount > 0.0) {
              // Four broad cel tones follow the key light; use actual lighting for occlusion.
              float ndl = dot(normal, sceneToonDirection);
              float aa = clamp(fwidth(ndl)*1.2, 0.008, 0.025);
              float celShade = 0.27
                + 0.31*smoothstep(0.05-aa,0.05+aa,ndl)
                + 0.50*smoothstep(0.45-aa,0.45+aa,ndl)
                + 0.50*smoothstep(0.82-aa,0.82+aa,ndl);
              vec3 illumination = totalDiffuse / max(material.diffuseColor,vec3(0.035));
              float energy = dot(illumination,vec3(.2126,.7152,.0722));
              float shadeMask = mix(.46,1.0,smoothstep(.10,.42,energy));
              // Metals have no diffuse lighting: give them coloured cel surfaces as well.
              shadeMask = mix(shadeMask,1.0,metalnessFactor);
              vec3 celDiffuse = diffuseColor.rgb * celShade * shadeMask;
              float spec = dot(totalSpecular,vec3(.2126,.7152,.0722));
              float specAA = clamp(fwidth(spec),.01,.08);
              float specBand = .22*smoothstep(.22-specAA,.22+specAA,spec)
                + .65*smoothstep(.85-specAA,.85+specAA,spec);
              vec3 specTint = mix(vec3(1.0),diffuseColor.rgb,metalnessFactor*.65);
              // Reduce photographic gradients so the cel bands remain visible under studio lights.
              totalDiffuse = mix(totalDiffuse,celDiffuse,sceneToonAmount);
              totalSpecular = mix(totalSpecular,totalSpecular*.10+specTint*specBand,sceneToonAmount);

            }
            #include <transmission_fragment>
          `);
        };
        material.customProgramCacheKey = () => key + '/scene-cel-light-v2-strong';
        material.needsUpdate = true;
      }
    });
  }
  const outline = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: depthOfField.renderTargetDepth.texture },
      resolution: { value: new THREE.Vector2(1, 1) }, lineWidth: { value: 2.0 },
      nearClip: { value: camera.near }, farClip: { value: camera.far }, focus: { value: 25 },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      #include <packing>
      uniform sampler2D tDiffuse, tDepth;
      uniform vec2 resolution;
      uniform float nearClip, farClip, focus, lineWidth;
      varying vec2 vUv;
      float depthAt(vec2 uv) {
        return -perspectiveDepthToViewZ(unpackRGBAToDepth(texture2D(tDepth, uv)), nearClip, farClip);
      }
      float luma(vec3 c) { return log2(1.0 + dot(c, vec3(.2126,.7152,.0722))); }
      void main() {
        vec4 source = texture2D(tDiffuse, vUv);
        vec2 px = lineWidth / resolution;
        float z = depthAt(vUv);
        float l = depthAt(vUv-vec2(px.x,0.0)), r = depthAt(vUv+vec2(px.x,0.0));
        float b = depthAt(vUv-vec2(0.0,px.y)), t = depthAt(vUv+vec2(0.0,px.y));
        // Second differences ignore smooth slopes on the floor and glass globe.
        float crease = max(abs(l+r-2.0*z),abs(b+t-2.0*z)) / max(z,1.0);
        float edge = smoothstep(.003, .018, crease);
        float center = luma(source.rgb);
        float colorCrease = max(abs(luma(texture2D(tDiffuse,vUv-vec2(px.x,0.0)).rgb)
          + luma(texture2D(tDiffuse,vUv+vec2(px.x,0.0)).rgb)-2.0*center),
          abs(luma(texture2D(tDiffuse,vUv-vec2(0.0,px.y)).rgb)
          + luma(texture2D(tDiffuse,vUv+vec2(0.0,px.y)).rgb)-2.0*center));
        edge = max(edge, smoothstep(.22,.6,colorCrease)*.55);
        float softness = 1.0-smoothstep(4.5,16.0,max(z-focus,0.0));
        vec3 ink = vec3(.033,.038,.045);
        // Never brighten dark surfaces or paint over the emissive cores.
        float highlights = 1.0-smoothstep(2.0,5.0,center);
        gl_FragColor = vec4(mix(source.rgb,min(source.rgb,ink),edge*.88*softness*highlights),source.a);
      }
    `,
  });
  const baseSetSize = outline.setSize.bind(outline);
  outline.setSize = (width, height) => {
    baseSetSize(width, height);
    outline.uniforms.resolution.value.set(width, height);
    outline.uniforms.lineWidth.value = Math.min(window.devicePixelRatio || 1, 2) * 2.0;
  };
  return {
    outline,
    prepare: scan,
    begin() {
      const settings = getDisplaySettings();
      if (performance.now() >= nextScan) { scan(); nextScan = performance.now()+1000; }
      lightDirection.value.copy(worldKey).transformDirection(camera.matrixWorldInverse);
      toon.value = settings.sceneToon ? 1 : 0;
      outline.enabled = settings.sceneOutline;
      for (const mesh of companionOutlines) mesh.visible = settings.sceneOutline;
      outline.uniforms.focus.value = depthOfField.uniforms.focus.value;
      outline.uniforms.nearClip.value = camera.near;
      outline.uniforms.farClip.value = camera.far;
    },
    // Other viewers can share materials: their existing look stays unchanged.
    end() { toon.value = 0; },
  };
}
