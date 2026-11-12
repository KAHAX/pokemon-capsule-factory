import { mobileEdition, mobilePerformance } from './mobile-performance.js';
import { companionOutlines } from './companion-rendering.js';
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { getDisplaySettings } from './debug-settings.js';

// Preserve the existing charcoal outlines with the original continuous material lighting.
export function createSceneToon(scene, camera, depthOfField, renderer) {
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
  if (mobileEdition) {
    outline.uniforms.tDepth.value = depthOfField.renderTargetDepth.texture;
    outline.material.fragmentShader = outline.material.fragmentShader.replace(
      'unpackRGBAToDepth(texture2D(tDepth, uv))', 'texture2D(tDepth, uv).x').replace('edge*.88', 'edge*.38');
  }
  const baseSetSize = outline.setSize.bind(outline);
  outline.setSize = (width, height) => {
    baseSetSize(width, height);
    outline.uniforms.resolution.value.set(width, height);
    outline.uniforms.lineWidth.value = mobileEdition ? renderer.getPixelRatio() * .8 : (mobilePerformance
      ? renderer.getPixelRatio() : Math.min(window.devicePixelRatio || 1, 2)) * 2.0;
  };
  return {
    outline,
    prepare() {},
    begin() {
      const settings = getDisplaySettings();
      outline.enabled = settings.sceneOutline;
      for (const mesh of companionOutlines) mesh.visible = settings.sceneOutline;
      outline.uniforms.focus.value = depthOfField.uniforms.focus.value;
      outline.uniforms.nearClip.value = camera.near;
      outline.uniforms.farClip.value = camera.far;
    },
    // Other viewers can share materials: their existing look stays unchanged.
    end() {},
  };
}
