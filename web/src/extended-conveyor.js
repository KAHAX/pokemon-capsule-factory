import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Split complete authored parts, preserving their normals and UVs.
function partsOf(mesh) {
  const g=mesh.geometry,p=g.attributes.position,index=g.index;
  if(!index)return [];
  const parent=Int32Array.from({length:p.count},(_,i)=>i),weld=new Map();
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a;};
  for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*10000)).join(',');
    if(weld.has(key))join(i,weld.get(key));else weld.set(key,i);
  }
  for(let i=0;i<index.count;i+=3){join(index.getX(i),index.getX(i+1));join(index.getX(i),index.getX(i+2));}
  const parts=new Map(),v=new THREE.Vector3();
  for(let i=0;i<index.count;i++){
    const vertex=index.getX(i),r=root(vertex);
    if(!parts.has(r))parts.set(r,{bounds:new THREE.Box3(),indices:[]});
    const part=parts.get(r);part.indices.push(vertex);
    part.bounds.expandByPoint(v.fromBufferAttribute(p,vertex).applyMatrix4(mesh.matrixWorld));
  }
  return [...parts.values()];
}
function extract(mesh,indices){
  const source=mesh.geometry,g=new THREE.BufferGeometry(),ids=[...new Set(indices)],remap=new Map(ids.map((id,i)=>[id,i]));
  for(const [name,a] of Object.entries(source.attributes)){
    const values=new Float32Array(ids.length*a.itemSize);
    const components=['getX','getY','getZ','getW'];
    ids.forEach((id,i)=>{for(let k=0;k<a.itemSize;k++)values[i*a.itemSize+k]=a[components[k]](id);});
    g.setAttribute(name,new THREE.BufferAttribute(values,a.itemSize));
  }
  g.setIndex(indices.map(i=>remap.get(i)));return g.applyMatrix4(mesh.matrixWorld);
}
export function extendConveyor(scene,machine){
  scene.updateMatrixWorld(true);
  const group=new THREE.Group();group.name='Conveyor / left off-screen continuation';
  const templates=[],longitudinals=[],sources=[];
  scene.traverse(o=>{if(o.isMesh&&/WEB_STATIC_background_0(45|46|47|48|49|50|51|52|67)|GIF.*segmented return belt tread/.test(o.name))sources.push(o);});
  let removed=0;
  for(const mesh of sources){
    const keep=[];
    for(const part of partsOf(mesh)){
      const {min,max}=part.bounds,width=max.x-min.x;
      const corridor=min.z>-4.5&&max.z<-1.9&&max.y<3.5;
      if(corridor&&width>25&&min.x>-26.3&&min.x<-25.8)longitudinals.push({geometry:extract(mesh,part.indices),material:mesh.material,bounds:part.bounds});
      if(corridor&&min.x>-24.7&&max.x<-23.0&&width<2)templates.push({geometry:extract(mesh,part.indices),material:mesh.material});
      const oldExtension=max.x<-25.9&&min.x<-26.3;
      const terminalRoller=corridor&&min.x<-25.8&&max.x>-26.2&&width<1&&min.y>1.7;
      if(oldExtension||terminalRoller){removed++;continue;}
      keep.push(...part.indices);
    }
    if(!keep.length)mesh.visible=false;
    else if(keep.length!==mesh.geometry.index.count){mesh.geometry=mesh.geometry.clone();mesh.geometry.setIndex(keep);mesh.geometry.computeBoundingSphere();}
  }
  // Batch both sides of each station by their shared original material.
  const byMaterial=new Map();
  for(const t of templates){if(!byMaterial.has(t.material))byMaterial.set(t.material,[]);byMaterial.get(t.material).push(t.geometry);}
  const stations=[...byMaterial].map(([material,geometries])=>({material,geometry:mergeGeometries(geometries)}));
  scene.add(group);
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),unit=new THREE.Vector3(1,1,1),box=new THREE.BoxGeometry(1,1,1);
  let triangles=0,batches=0;
  const batch=(name,geometry,material,poses,shadow=true)=>{
    if(!poses.length)return;
    const m=new THREE.InstancedMesh(geometry,material,poses.length);
    m.name=`Conveyor extension / ${name}`;m.castShadow=shadow;m.receiveShadow=true;
    poses.forEach((p,i)=>{matrix.compose(new THREE.Vector3(...p.position),p.rotation||q,p.scale?new THREE.Vector3(...p.scale):unit);m.setMatrixAt(i,matrix);});
    m.computeBoundingSphere();group.add(m);triangles+=(geometry.index?.count||geometry.attributes.position.count)/3*poses.length;batches++;
  };
  const dark=machine.slatBatches.find(m=>/Midnight/.test(m.material.name))||machine.slatBatches[0];
  const light=machine.slatBatches.find(m=>/aluminium/i.test(m.material.name))||dark;
  const item=machine.slatData[0],pitch=(machine.slatMax-machine.slatMin)/(machine.slatData.length-1);
  for(let a=-180;a<-26;a+=16){
    const b=Math.min(a+16,-26);
    for(const t of longitudinals){
      const end=Math.min(b,t.bounds.min.x),length=end-a;if(length<=0)continue;
      const sx=length/(t.bounds.max.x-t.bounds.min.x);
      batch('original continuous profile',t.geometry,t.material,[{position:[a-t.bounds.min.x*sx,0,0],scale:[sx,1,1]}]);
    }
    const supports=[];
    // Last original support is -25.75, repeated at the original 2.3-unit spacing.
    for(let x=-28.05;x>=a;x-=2.3)if(x<b)supports.push({position:[x+23.45,0,0]});
    for(const t of stations)batch('original support station',t.geometry,t.material,supports);
    const near=[[],[]],far=[[],[]];
    for(let x=machine.slatMin-pitch;x>=a;x-=pitch){
      if(x>=b)continue;
      const kind=Math.abs(Math.round((x-machine.slatMin)/pitch))%7===0?1:0;
      if(x>-45)near[kind].push({position:[x,item.position.y,item.position.z],rotation:item.quaternion,scale:item.scale.toArray()});
      else far[kind].push({position:[x,2.465,-3.18],scale:[.13,.065,1.37]});
    }
    [dark,light].forEach((t,i)=>{batch('original slats',t.geometry,t.material,near[i],false);batch('distant slats',box,t.material,far[i],false);});
  }
  group.userData.statistics={triangles,batches,templates:templates.length,longitudinals:longitudinals.length,removed,range:[-180,-26]};
  return group;
}

