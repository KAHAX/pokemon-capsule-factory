import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A small static supply vignette: no extra asset downloads, lights or frame updates.
export function addSupplyRestArea(scene) {
  const area=new THREE.Group();area.name='Background / supply and charging nook';
  const original=[];scene.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))if(m&&!original.includes(m))original.push(m);});
  const enamel=original.find(m=>/Warm yellow enamel/.test(m.name));
  const surface=(name,color,metalness=.3,roughness=.48)=>{
    const m=enamel?.clone()||new THREE.MeshStandardMaterial();
    m.name=`Supply nook / ${name}`;m.color.set(color);m.map=null;m.emissive?.set(0);m.emissiveMap=null;m.metalness=metalness;m.roughness=roughness;
    return m;
  };
  const cream=surface('muted cream enamel','#b4a784'),blue=surface('slate blue enamel','#465b69');
  const red=surface('oxblood corner guards','#683b3c'),dark=surface('rubber seams','#202a30',.05,.72);
  const metal=surface('brushed metal fittings','#8b9391',.7,.38),brass=surface('charging contacts','#a28c53',.65,.4);
  const white=new THREE.MeshStandardMaterial({name:'Supply nook / warm status lamps',color:'#e8dab6',emissive:'#ffdc91',emissiveIntensity:1.1,roughness:.45,metalness:.1});
  const rootY=-.69;
  const box=(parent,x,y,z,w,h,d,material)=>{
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,1,Math.min(.055,w*.15,h*.15,d*.15)),material);
    mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  };
  const cylinder=(parent,x,y,z,top,bottom,h,material,segments=24)=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,h,segments),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  };
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#dbd0ae';ctx.fillRect(0,0,512,256);
  ctx.strokeStyle='#344752';ctx.lineWidth=7;ctx.strokeRect(12,12,488,232);
  ctx.fillStyle='#344752';ctx.font='bold 40px sans-serif';ctx.fillText('CAPSULE SUPPLY',30,67);
  ctx.font='22px monospace';ctx.fillText('FIELD SERVICE / 081',30,105);
  ctx.fillText('ENERGY CELL',30,143);ctx.fillText('UP ↑ ↑',355,143);
  for(let i=0;i<48;i++)ctx.fillRect(30+i*6,172,(i%3)+1,45);
  ctx.font='16px monospace';ctx.fillText('PK-01',358,205);
  const labelTexture=new THREE.CanvasTexture(canvas);labelTexture.colorSpace=THREE.SRGBColorSpace;labelTexture.anisotropy=4;
  const label=new THREE.MeshStandardMaterial({name:'Supply nook / printed shipment label',map:labelTexture,roughness:.85,metalness:0});
  function crate(x,z,y,w,h,d,material,yaw=0) {
    const g=new THREE.Group();g.name='Supply crate';g.position.set(x,rootY+y,z);g.rotation.y=yaw;area.add(g);
    box(g,0,h*.48,0,w,h*.88,d,material);
    box(g,0,h-.13,0,w+.025,.055,d+.025,dark);
    box(g,0,h-.055,0,w+.08,.15,d+.08,material);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      box(g,sx*(w/2-.06),.1,sz*(d/2-.06),.19,.2,.19,red);
      box(g,sx*(w/2-.06),h-.04,sz*(d/2-.06),.19,.17,.19,red);
    }
    for(const sx of [-1,1]){
      box(g,sx*w*.34,h-.18,d/2+.035,.13,.27,.065,metal);
      box(g,sx*w*.34,h-.18,d/2+.075,.06,.1,.025,dark);
      box(g,sx*(w/2+.015),h*.48,0,.045,.15,d*.38,dark);
    }
    const sticker=new THREE.Mesh(new THREE.PlaneGeometry(w*.59,h*.47),label);sticker.position.set(0,h*.43,d/2+.012);g.add(sticker);
    for(const sx of [-1,1])box(g,sx*w*.32,h+.03,0,.09,.025,d*.65,brass);
    return g;
  }
  crate(-16.4,-11,0,2.25,1.02,1.7,cream,.09);
  crate(-16.65,-11.1,1.06,1.5,.73,1.22,blue,-.10);
  crate(-14.25,-10.4,0,1.35,.78,1.3,blue,.18);

  const dock=new THREE.Group();dock.name='Small charging dock';dock.position.set(-21.1,rootY,-9.5);dock.rotation.y=-.12;area.add(dock);
  cylinder(dock,0,.10,0,1.28,1.35,.2,dark,32);
  cylinder(dock,0,.23,0,1.16,1.29,.2,blue,32);
  cylinder(dock,0,.345,0,.97,1.05,.07,metal,32);
  cylinder(dock,0,.39,0,.77,.77,.025,dark,32);
  // Three contact pads and small status strips; no large glowing halo.
  for(let i=0;i<3;i++){
    const angle=i*Math.PI*2/3+.3,x=Math.sin(angle),z=Math.cos(angle);
    const pad=box(dock,x*.58,.42,z*.58,.25,.045,.32,brass);pad.rotation.y=angle;
    const lamp=box(dock,x*1.11,.32,z*1.11,.26,.035,.055,white);lamp.rotation.y=angle;
  }
  for(let i=0;i<6;i++){const a=i*Math.PI/3;cylinder(dock,Math.sin(a)*.91,.39,Math.cos(a)*.91,.032,.032,.018,dark,8);}
  box(dock,0,.69,-.92,.48,.75,.30,blue);
  box(dock,0,.88,-.75,.32,.20,.025,dark);
  for(let i=0;i<3;i++)box(dock,-.095+i*.095,.88,-.73,.055,.12,.02,white);
  box(dock,0,.56,-.75,.17,.12,.03,brass);
  const cable=new THREE.CatmullRomCurve3([new THREE.Vector3(-17.5,rootY+.06,-11.2),new THREE.Vector3(-18.6,rootY+.045,-12),new THREE.Vector3(-20.1,rootY+.045,-11.8),new THREE.Vector3(-21.1,rootY+.12,-10.5)]);
  area.add(new THREE.Mesh(new THREE.TubeGeometry(cable,20,.045,6,false),dark));

  // Merge static parts by material to keep this entire addition inexpensive.
  area.updateMatrixWorld(true);const batches=new Map();let triangles=0;
  area.traverse(o=>{if(!o.isMesh)return;const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);if(!batches.has(o.material))batches.set(o.material,[]);batches.get(o.material).push(g);triangles+=g.attributes.position.count/3;});
  const merged=new THREE.Group();merged.name=area.name;
  for(const [material,geometries] of batches){const g=mergeGeometries(geometries);const mesh=new THREE.Mesh(g,material);mesh.name=material.name;mesh.receiveShadow=true;mesh.castShadow=material!==white&&material!==label;merged.add(mesh);for(const part of geometries)part.dispose();}
  area.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
  // Set back far enough to read above the belt from the normal hero camera.
  merged.position.set(-5,0,-7);
  merged.userData.statistics={triangles,drawCalls:batches.size};scene.add(merged);return merged;
}

