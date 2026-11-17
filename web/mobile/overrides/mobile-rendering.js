import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Keep the beauty pass's hardware depth in its own target. Postprocessing never
// overwrites it, and the factory is not drawn a second time for depth/DOF.
export class MobileBeautyPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera; this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.material = new THREE.ShaderMaterial({
      uniforms: { image: { value: this.target.texture } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: 'uniform sampler2D image; varying vec2 vUv; void main(){gl_FragColor=texture2D(image,vUv);}',
    });
    this.quad = new FullScreenQuad(this.material);
  }
  setSize(w,h) { this.target.setSize(Math.max(1,Math.floor(w)),Math.max(1,Math.floor(h))); }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.target); renderer.clear(); renderer.render(this.scene,this.camera);
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer); this.quad.render(renderer);
  }
  dispose() { this.target.dispose(); this.material.dispose(); this.quad.dispose(); }
}

export function createMobileFocusPass(beauty, camera) {
  const pass = new ShaderPass({
    uniforms: { tDiffuse:{value:null}, tDepth:{value:beauty.target.depthTexture},
      focus:{value:25.5}, nearClip:{value:camera.near}, farClip:{value:camera.far}, resolution:{value:new THREE.Vector2(1,1)} },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `#include <packing>
      uniform sampler2D tDiffuse,tDepth;
      uniform float focus,nearClip,farClip; uniform vec2 resolution; varying vec2 vUv;
      void main(){
        float z=-perspectiveDepthToViewZ(texture2D(tDepth,vUv).x,nearClip,farClip);
        float radius=smoothstep(5.,22.,z-focus)*1.6;
        vec2 d=vec2(radius)/resolution;
        vec4 c=texture2D(tDiffuse,vUv)*4.;
        c+=texture2D(tDiffuse,vUv+vec2(d.x,0.))+texture2D(tDiffuse,vUv-vec2(d.x,0.));
        c+=texture2D(tDiffuse,vUv+vec2(0.,d.y))+texture2D(tDiffuse,vUv-vec2(0.,d.y));
        c+=texture2D(tDiffuse,vUv+d)+texture2D(tDiffuse,vUv-d);
        c+=texture2D(tDiffuse,vUv+vec2(d.x,-d.y))+texture2D(tDiffuse,vUv+vec2(-d.x,d.y));
        gl_FragColor=c/12.;
      }`,
  });
  pass.renderTargetDepth = { texture: beauty.target.depthTexture };
  // ShaderPass clones uniforms. Depth attachments must remain the exact texture
  // owned by the framebuffer, including after rotation/resolution changes.
  pass.uniforms.tDepth.value = beauty.target.depthTexture;
  pass.setSize = (w,h) => pass.uniforms.resolution.value.set(w,h);
  return pass;
}

// Transparent Fresnel glass retains highlights and printed ink, without rendering
// the entire factory to a second full-resolution transmission buffer.
export function useMobileGlass(scene) {
  const seen = new Set();
  scene.traverse(object => {
    if (!object.isMesh) return;
    for (const material of [].concat(object.material)) {
      if (!material?.transmission || seen.has(material)) continue;
      seen.add(material);
      // The reservoir must stay transmissive at every render scale. Blending a
      // lit white surface over the capsules creates a milky shell on slow frames.
      if (/Optical clear borosilicate/i.test(material.name)) continue;
      material.userData.mobileGlass = true;
      material.transmission = 0; material.transparent = true;
      material.opacity = 1; material.depthWrite = false;
      const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
      material.onBeforeCompile = function(shader,renderer) {
        previous.call(this,shader,renderer);
        // Insert after the existing frost/printing code, immediately before output.
        const ink = shader.fragmentShader.includes('float dsInk') || shader.fragmentShader.includes('dsFrost, dsInk') ? 'max(dsInk * .96, mobileAlpha)' : 'mobileAlpha';
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
          float mobileFacing=abs(dot(normalize(normal),normalize(vViewPosition)));
          float rim = pow(1.0-mobileFacing, 2.4);
          vec3 reflected = reflect(-normalize(vViewPosition), normalize(normal));
          float strip = smoothstep(.91,.985,dot(reflected,normalize(vec3(-.52,.63,.57))));
          float mobileAlpha=.075+.36*rim+.16*strip;
          outgoingLight += vec3(.36,.55,.72)*rim + vec3(.9,.95,1.)*.65*strip;
          diffuseColor.a=${ink};
          #include <opaque_fragment>`);
      };
      material.customProgramCacheKey = () => key + '/mobile-fresnel-v1';
      material.needsUpdate = true;
    }
  });
}
