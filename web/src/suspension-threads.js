import * as THREE from 'three';

// Isolated cable components in the authored static meshes; the rest stays untouched.
export function softenSuspensionThreads(object) {
  if (!/WEB_STATIC_hero_026|WEB_STATIC_background_052/.test(object.name)) return null;
  const source=object.geometry;
  if(!source.index)return null;
  const position=source.attributes.position,normal=source.attributes.normal;
  // Find actual cable components: exported/optimized vertex offsets are not stable.
  const parent=Int32Array.from({length:position.count},(_,i)=>i),weld=new Map();
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a;};
  for(let i=0;i<position.count;i++){
    const key=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>Math.round(v*10000)).join(',');
    if(weld.has(key))join(i,weld.get(key));else weld.set(key,i);
  }
  const ids=source.index.array;
  for(let i=0;i<ids.length;i+=3){join(ids[i],ids[i+1]);join(ids[i],ids[i+2]);}
  const groups=new Map(),v=new THREE.Vector3();
  for(const i of new Set(ids)){
    const r=root(i);if(!groups.has(r))groups.set(r,{box:new THREE.Box3(),ids:[]});
    const g=groups.get(r);g.ids.push(i);g.box.expandByPoint(v.fromBufferAttribute(position,i));
  }
  const positions=[],normals=[],heights=[],remap=new Map();
  for(const {box,ids:vertices} of groups.values()){
    const size=box.getSize(new THREE.Vector3());
    if(size.y<10||size.x>.12||size.z>.12)continue;
    for(const i of vertices){
      const height=(position.getY(i)-box.min.y)/size.y*4.5;
      remap.set(i,heights.length);
      positions.push(position.getX(i),box.min.y+height,position.getZ(i));
      normals.push(normal.getX(i),normal.getY(i),normal.getZ(i));heights.push(height);
    }
  }
  if(!heights.length)return null;
  const solidIndices = [], threadIndices = [], indices = source.index.array;
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap.get(indices[i]), b = remap.get(indices[i+1]), c = remap.get(indices[i+2]);
    if (a !== undefined && b !== undefined && c !== undefined) threadIndices.push(a,b,c);
    else solidIndices.push(indices[i],indices[i+1],indices[i+2]);
  }
  object.geometry = source.clone();
  object.geometry.setIndex(solidIndices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('threadHeight', new THREE.Float32BufferAttribute(heights,1));
  geometry.setIndex(threadIndices);
  const material = new THREE.MeshStandardMaterial({
    color: '#89939e', metalness: .18, roughness: .65, envMapIntensity: .35,
    transparent: true, opacity: .72, depthWrite: false, alphaTest: .005,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float threadHeight; varying float vThreadHeight;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvThreadHeight = threadHeight;');
    shader.fragmentShader = 'varying float vThreadHeight;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>',
      'diffuseColor.a *= 1.0 - smoothstep(0.35, 4.3, vThreadHeight);\n#include <alphatest_fragment>');
  };
  material.customProgramCacheKey = () => 'suspension-thread-soft-fade-v1';
  const threads = new THREE.Mesh(geometry, material);
  threads.name = 'Suspension threads / attached ends with upward fade';
  threads.castShadow = false;
  return threads;
}
