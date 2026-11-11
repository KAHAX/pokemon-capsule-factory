import * as THREE from 'three';

// Reuse the original nearby slats/materials; distant repeats use box geometry and
// spatial batches so the off-screen continuation costs no per-slat draw calls.
export function extendConveyor(scene, machine) {
  const group = new THREE.Group();
  group.name = 'Conveyor / continuous right-hand extension';
  scene.add(group);
  const materials = new Map();
  scene.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) if (m && !materials.has(m.name)) materials.set(m.name, m);
  });
  const match = (pattern, fallback) => [...materials.values()].find(m => pattern.test(m.name)) || new THREE.MeshStandardMaterial(fallback);
  const gold = match(/^02.*Warm yellow enamel$/, {color:'#d6ad47',metalness:.4,roughness:.35});
  const brass = match(/^14.*Machined brass$/, {color:'#bc9545',metalness:.7,roughness:.3});
  const red = match(/^05.*Oxblood base$/, {color:'#771c29',metalness:.25,roughness:.4});
  const rubber = match(/^11.*Graphite rubber$/, {color:'#242b2c',roughness:.7});
  const steel = match(/^13.*Polished steel$/, {color:'#b9c2c3',metalness:.9,roughness:.25});
  const dark = machine.slatBatches.find(m => /Midnight/.test(m.material.name)) || machine.slatBatches[0];
  const light = machine.slatBatches.find(m => /aluminium/i.test(m.material.name)) || dark;
  const item = machine.slatData[0];
  const matrix = new THREE.Matrix4(), identity = new THREE.Quaternion(), unit = new THREE.Vector3(1,1,1);
  const box = new THREE.BoxGeometry(1,1,1);
  let triangles=0, batches=0;
  const batch = (name, geometry, material, poses, castShadow=false) => {
    if(!poses.length)return;
    const mesh = new THREE.InstancedMesh(geometry,material,poses.length);
    mesh.name=`Conveyor extension / ${name}`;mesh.receiveShadow=true;mesh.castShadow=castShadow;
    poses.forEach((p,i)=>{matrix.compose(new THREE.Vector3(...p.position),p.rotation||identity,p.scale?new THREE.Vector3(...p.scale):unit);mesh.setMatrixAt(i,matrix);});
    mesh.computeBoundingSphere();group.add(mesh);
    triangles += (geometry.index?.count || geometry.attributes.position.count)/3*poses.length;batches++;
  };
  const pitch=(machine.slatMax-machine.slatMin)/(machine.slatData.length-1);
  const ranges=[[machine.slatMax+pitch/2,180],[-180,machine.slatMin-pitch/2]];
  for(const [start,end] of ranges) for(let a=start;a<end;a+=16) {
    const b=Math.min(a+16,end),center=(a+b)/2,length=b-a;
    const beams=[],rails=[],legs=[],feet=[],braces=[];
    for(const z of [-4.02,-2.34]) {
      beams.push({position:[center,2.08,z],scale:[length,.28,.14]});
      rails.push({position:[center,3.18,z],scale:[length,.065,.065]});
      for(let x=Math.ceil(a/2.4)*2.4;x<b;x+=2.4){
        legs.push({position:[x,1.25,z],scale:[.11,3.8,.11]});
        feet.push({position:[x,-.64,z],scale:[.38,.12,.34]});
        braces.push({position:[x+.5,.68,z],scale:[.045,2.55,.045],rotation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-.4)});
      }
    }
    batch('enamel beams',box,gold,beams,true);
    batch('brass guard rails',box,brass,rails);
    batch('supports',box,gold,legs,true);
    batch('red feet',box,red,feet,true);
    batch('steel diagonal braces',box,steel,braces);
    batch('belt backing',box,rubber,[{position:[center,2.35,-3.18],scale:[length,.10,1.48]}]);
    const near=[[],[]],far=[[],[]];
    for(let x=machine.slatMax+pitch*Math.ceil((a-machine.slatMax)/pitch);x<b;x+=pitch){
      const index=Math.round((x-machine.slatMax)/pitch),kind=Math.abs(index)%7===0?1:0;
      if(x>-35&&x<19)near[kind].push({position:[x,2.465,-3.18],rotation:item.quaternion,scale:item.scale.toArray()});
      else far[kind].push({position:[x,2.465,-3.18],scale:[.13,.065,1.37]});
    }
    [dark,light].forEach((source,i)=>{
      batch('detailed slats',source.geometry,source.material,near[i]);
      batch('distant slats',box,source.material,far[i]);
    });
  }
  group.userData.statistics={triangles,batches,range:[-180,180]};
  return group;
}
