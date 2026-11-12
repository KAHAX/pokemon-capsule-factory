import * as THREE from 'three';

// Connected lightning strokes: luminous lilac core with a soft violet corona.
// Instanced quads give a stable visible width, unlike one-pixel WebGL lines.
// `tint` optionally overrides the default violet palette (HDR core / corona colours).
export function createLightningStrokes(positions, styles = new Float32Array(positions.length / 3).fill(1), tint = {}) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,0,0, 1,0,0, -1,1,0, 1,1,0], 3));
  geometry.setIndex([0,1,2,2,1,3]);
  const buffer = new THREE.InstancedInterleavedBuffer(positions, 6).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('arcStart', new THREE.InterleavedBufferAttribute(buffer,3,0));
  geometry.setAttribute('arcEnd', new THREE.InterleavedBufferAttribute(buffer,3,3));
  const styleBuffer = new THREE.InstancedBufferAttribute(styles, 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('arcStyle', styleBuffer);
  geometry.instanceCount = positions.length / 6;
  const material = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, toneMapped:false,
    uniforms:{ resolution:{value:new THREE.Vector2(1,1)}, power:{value:0}, width:{value:5.5},
      coreColor:{value:new THREE.Vector3(...(tint.core||[8,3.8,18]))}, coronaColor:{value:new THREE.Vector3(...(tint.corona||[2.6,.16,8.5]))} },
    vertexShader:`attribute vec3 arcStart,arcEnd; attribute vec2 arcStyle; uniform vec2 resolution; uniform float width;
      varying float across; varying float intensity; void main(){
        vec4 a=projectionMatrix*modelViewMatrix*vec4(arcStart,1.);
        vec4 b=projectionMatrix*modelViewMatrix*vec4(arcEnd,1.);
        vec2 delta=(b.xy/max(b.w,.001)-a.xy/max(a.w,.001))*resolution;
        vec2 normal=vec2(-delta.y,delta.x)/max(length(delta),.001);
        gl_Position=mix(a,b,position.y);
        gl_Position.xy+=normal*position.x*width*arcStyle.y/resolution*gl_Position.w;
        across=position.x; intensity=arcStyle.x;
      }`,
    fragmentShader:`uniform float power; uniform vec3 coreColor, coronaColor; varying float across; varying float intensity; void main(){
      float core=exp(-across*across*70.);
      float corona=exp(-across*across*5.)*(1.-smoothstep(.65,1.,abs(across)));
      vec3 radiance=(coreColor*core+coronaColor*corona)*power*intensity;
      gl_FragColor=vec4(radiance,1.);
    }`,
  });
  material.userData.noToon=true;
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
  mesh.name='Violet lightning / branching HDR strokes';
  const viewport=new THREE.Vector4();
  mesh.onBeforeRender=renderer=>{
    renderer.getCurrentViewport(viewport);
    material.uniforms.resolution.value.set(viewport.z,viewport.w);
    material.uniforms.width.value=5.5*renderer.getPixelRatio();
  };
  mesh.userData.positionBuffer=buffer;
  mesh.userData.styleBuffer=styleBuffer;
  return mesh;
}
