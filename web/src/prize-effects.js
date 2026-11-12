import * as THREE from 'three';

export function prizeFlash(time, gold) {
  const duration = gold ? 5.8 : 2.8;
  if (time >= duration) return { level: gold ? 1.6 : .8, gold, flashing: false };
  const wave = .5 + .5 * Math.sin(time * (gold ? 17 : 26));
  return { level: (gold ? .65 : .2) + Math.pow(wave, 2) * (gold ? 8.5 : 3.4), gold, flashing: true };
}

export function prepareReservoirBands(scene) {
  const uniforms = { color: { value: new THREE.Color('#ffffff') }, strength: { value: .4 } };
  scene.updateMatrixWorld(true);
  const position = new THREE.Vector3();
  let vertices = 0;
  scene.traverse(object => {
    if (!object.isMesh) return;
    let owner = object, match = false;
    while (owner) { if (owner.name.includes('WEB_STATIC_hero_031')) match = true; owner = owner.parent; }
    if (!match) return;
    const source = object.geometry.attributes.position, mask = new Float32Array(source.count);
    for (let i=0; i<source.count; i++) {
      position.fromBufferAttribute(source,i).applyMatrix4(object.matrixWorld);
      const r = Math.hypot(position.x, position.z);
      if (position.y > 3.926 && position.y < 4.109 && r > 1.65 && r < 1.747) { mask[i]=1; vertices++; }
    }
    if (!mask.some(value => value)) return;
    object.geometry = object.geometry.clone();
    object.geometry.setAttribute('reservoirBand',new THREE.BufferAttribute(mask,1));
    const patch = original => {
      const material = original.clone();
      const previous = material.onBeforeCompile;
      material.onBeforeCompile = shader => {
        previous.call(material,shader);
        shader.uniforms.prizeBandColor=uniforms.color;shader.uniforms.prizeBandStrength=uniforms.strength;
        shader.vertexShader='attribute float reservoirBand;varying float vReservoirBand;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvReservoirBand=reservoirBand;');
        shader.fragmentShader='uniform vec3 prizeBandColor;uniform float prizeBandStrength;varying float vReservoirBand;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=prizeBandColor*prizeBandStrength*vReservoirBand;');
      };
      material.customProgramCacheKey=()=> 'reservoir-prize-bands-v1';return material;
    };
    object.material=Array.isArray(object.material)?object.material.map(patch):patch(object.material);
  });
  return { vertices, update(level, gold) { uniforms.color.value.set(gold?'#ffd05a':'#ffffff');uniforms.strength.value=level; } };
}

export function addRareGlow(ball) {
  const time = { value: ball.userData.rareGlowTime || 0 };
  const strength = { value: 1 }, observation = { value: 0 }, emissionPass = { value: 0 };
  const originals = [];
  ball.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some(m => /Porcelain lower shell|vermilion lacquer/i.test(m?.name || ''))) return;
    const patched = materials.map(original => {
      if (!/Porcelain lower shell|vermilion lacquer/i.test(original?.name || '')) return original;
      const material = original.clone();
      const previous = original.onBeforeCompile;
      material.onBeforeCompile = shader => {
        previous.call(material, shader);
        shader.uniforms.prizeGlowTime = time;
        shader.uniforms.prizeGlowStrength = strength;
        shader.uniforms.prizeObservation = observation;
        shader.fragmentShader = 'uniform float prizeGlowTime,prizeGlowStrength,prizeObservation;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          float prizeRim = pow(clamp(1.0-abs(dot(normalize(normal),normalize(vViewPosition))),0.0,1.0),2.2);
          float prizeBreath = .94+.06*sin(prizeGlowTime*2.0);
          vec3 prizeColor=.55+.45*cos(6.2831853*(normal.x*.35+normal.y*.22+prizeGlowTime*.09+vec3(0.,.333,.667)));
          totalEmissiveRadiance += prizeColor*(.06+prizeRim*2.0)*prizeBreath*prizeGlowStrength*mix(1.,.3,prizeObservation);
        `);
      };
      material.customProgramCacheKey = () => 'iridescent-prize-soft-radiance-v5';
      return material;
    });
    originals.push({ object, original: object.material, patched, materials });
    object.material = Array.isArray(object.material) ? patched : patched[0];
  });

  // Diffuse radiance, not an enlarged spherical surface. The radial Gaussian
  // has no ring or visible boundary; world-height fading clears the contact zone.
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms:{time,strength,observation,emissionPass,center:{value:new THREE.Vector3()},radius:{value:1}},
    transparent:true,depthWrite:false,depthTest:true,
    // Light contributes radiance and bloom, never a new contour for the outline.
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,
    blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneFactor,
    blendEquationAlpha:THREE.AddEquation,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
    vertexShader:`varying vec2 glowUV;varying float worldHeight;
      void main(){
        glowUV=uv*2.-1.;
        vec4 p=modelViewMatrix*vec4(0.,0.,0.,1.);
        vec2 size=vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));
        p.xy+=position.xy*size;
        worldHeight=cameraPosition.y+dot(viewMatrix[1].xyz,p.xyz);
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader:`uniform float time,radius,strength,observation,emissionPass;uniform vec3 center;
      varying vec2 glowUV;varying float worldHeight;
      void main(){
        float r=length(glowUV)*mix(1.,1.12,observation);
        float softEdge=exp(-4.5*r*r)*(1.-smoothstep(.72,1.,r));
        float clearance=mix(smoothstep(-.65,-.05,(worldHeight-center.y)/radius),1.,observation);
        float alpha=softEdge*clearance*.9*strength*mix(1.,.12,observation);
        if(alpha<.001)discard;
        vec3 color=.55+.45*cos(6.2831853*(glowUV.x*.35+glowUV.y*.22+time*.09+vec3(0.,.333,.667)));
        gl_FragColor=vec4(color*3.0,alpha);
      }`,
  });
  haloMaterial.userData.emissionPass=emissionPass;
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2,2),haloMaterial);
  halo.frustumCulled=false;
  halo.name='Soft iridescent prize aura';
  ball.updateWorldMatrix(true,true);
  const bounds = new THREE.Box3().setFromObject(ball);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = ball.getWorldScale(new THREE.Vector3());
  halo.position.copy(ball.worldToLocal(center));
  const radius = Math.max(size.x,size.y,size.z)*.95;
  halo.scale.set(radius/scale.x,radius/scale.y,radius/scale.z);
  halo.raycast=()=>{};ball.add(halo);
  halo.getWorldPosition(haloMaterial.uniforms.center.value);
  haloMaterial.uniforms.radius.value=radius/.95*.5;
  const worldScale=new THREE.Vector3();
  return {
    update(dt, level = 1, observationAmount = 0) {
      time.value+=dt;
      ball.userData.rareGlowTime=time.value;
      strength.value=level;
      observation.value=observationAmount;
      halo.getWorldPosition(haloMaterial.uniforms.center.value);
      haloMaterial.uniforms.radius.value=halo.getWorldScale(worldScale).x/.95*.5;
    },
    dispose() {
      halo.removeFromParent();halo.geometry.dispose();haloMaterial.dispose();
      originals.forEach(({object,original,patched,materials})=>{
        object.material=original;
        patched.forEach((material,index)=>{if(material!==materials[index])material.dispose();});
      });
    },
  };
}

