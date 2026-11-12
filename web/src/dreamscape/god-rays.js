import * as THREE from 'three';
import { mobileEdition } from '../mobile-performance.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Screen-space crepuscular rays (Tyndall effect). Open sky in the depth buffer is the
 * light source; machinery, signs and pipes occlude it, so light streams between them.
 * Rays are marched at half resolution and added back before bloom.
 */
export class GodRaysPass extends Pass {
  constructor(depthTexture, camera) {
    super();
    this.camera = camera;
    this.lightDirection = new THREE.Vector3(0, 1, 0);
    this.raysTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.raysMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: depthTexture },
        lightUv: { value: new THREE.Vector2(.5, 1.2) }, aspect: { value: 1 },
        density: { value: .92 }, decay: { value: mobileEdition ? Math.pow(.968,56/24) : .968 }, onScreen: { value: 1 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tDiffuse, tDepth;
        uniform vec2 lightUv;
        uniform float aspect, density, decay, onScreen;
        varying vec2 vUv;
        const int SAMPLES = ${mobileEdition ? 24 : 56};
        vec3 source(vec2 uv) {
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
                    vec2 d = (uv - lightUv) * vec2(aspect, 1.0);
          float falloff = exp(-dot(d, d) * .8);
          vec4 t = texture2D(tDiffuse, uv);
          vec3 c = t.rgb;
          float sky = 1.0 - step(.5, t.a);
          // Open sky emits; very bright neon contributes a little scatter of its own.
          return sky * falloff * (vec3(.70, .80, 1.0) + c * 2.0) + max(c - 1.6, 0.0) * .05;
        }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec2 delta = (vUv - lightUv) * density / float(SAMPLES);
          vec2 coord = vUv - delta * hash(gl_FragCoord.xy);
          float weight = 1.0;
          vec3 sum = vec3(0.0);
          for (int i = 0; i < SAMPLES; i++) {
            sum += source(coord) * weight;
            weight *= decay;
            coord -= delta;
          }
          gl_FragColor = vec4(sum / float(SAMPLES) * 3.0 * onScreen, 1.0);
        }`,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tRays: { value: null }, intensity: { value: .17 }, tint: { value: new THREE.Color('#c9d6ff') } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse, tRays;
        uniform float intensity;
        uniform vec3 tint;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          vec3 rays = texture2D(tRays, vUv).rgb * tint * intensity;
          // Haze lifts the dark air more than the lit surfaces (screen-like add).
          gl_FragColor = vec4(c + rays * (1.0 - min(c, vec3(1.0)) * .5), 1.0);
        }`,
    });
    this.quad = new FullScreenQuad(this.raysMaterial);
    this.projected = new THREE.Vector3();
  }

  update() {
    const camera = this.camera;
    camera.updateMatrixWorld(true);
    this.projected.copy(camera.position).addScaledVector(this.lightDirection, 100).project(camera);
    const facing = new THREE.Vector3();
    camera.getWorldDirection(facing);
    const ahead = THREE.MathUtils.smoothstep(facing.dot(this.lightDirection), -.28, -.08);
    this.raysMaterial.uniforms.lightUv.value.set(this.projected.x * .5 + .5, this.projected.y * .5 + .5);
    this.raysMaterial.uniforms.onScreen.value = ahead;
  }

  setSize(width, height) {
    this.raysTarget.setSize(Math.max(1, width >> (mobileEdition ? 2 : 1)), Math.max(1, height >> (mobileEdition ? 2 : 1)));
    this.raysMaterial.uniforms.aspect.value = width / Math.max(1, height);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.raysMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material = this.raysMaterial;
    renderer.setRenderTarget(this.raysTarget);
    this.quad.render(renderer);
    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tRays.value = this.raysTarget.texture;
    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.raysTarget.dispose();
    this.raysMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.dispose();
  }
}
