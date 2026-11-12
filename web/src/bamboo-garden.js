import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// A compact tsukubai garden on the wet ground, clear of the roaming dragons.
export const BAMBOO_GARDEN_POSITION = [-23, -.69, -16];
export function addBambooGarden(scene, time) {
  const root = new THREE.Group();
  root.name = 'Background / Japanese bamboo water garden';
  root.position.set(...BAMBOO_GARDEN_POSITION);
  root.rotation.y = -.28;
  const material = (name, color, roughness = .82) => new THREE.MeshStandardMaterial({ name: `Water garden / ${name}`, color, roughness, metalness: .02 });
  const stone = material('carved grey granite', '#89958d');
  const slate = material('blue grey layered rocks', '#647787');
  const paving = material('worn stone paving', '#929c91');
  const bamboo = material('olive bamboo skin', '#84954c', .54);
  const nodes = material('bamboo joints', '#b4bd72', .65);
  const cut = material('fresh hollow bamboo ends', '#c8c48a');
  const dark = material('bamboo inner shadow and lashing', '#343d25');
  const green = material('fern and maple foliage', '#466c45'); green.side = THREE.DoubleSide;
  const lightGreen = material('new leaves', '#7b9654'); lightGreen.side = THREE.DoubleSide;
  for (const mat of [stone, slate, paving]) {
    mat.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 gardenStonePosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ngardenStonePosition=position;');
      shader.fragmentShader = 'varying vec3 gardenStonePosition;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gp=gardenStonePosition;
        float veins=sin(gp.y*17.0+gp.x*2.2+sin(gp.z*5.0)*.6);
        float grain=fract(sin(dot(floor(gp*75.0),vec3(127.1,311.7,74.7)))*43758.5453)-.5;
        diffuseColor.rgb*=.97+.025*veins+.035*grain;`);
    };
    mat.customProgramCacheKey=()=> 'garden-weathered-stone-v1';
  }
  const parts = new Map();
  const add = (geometry, mat, position = [0, 0, 0], quaternion = new THREE.Quaternion()) => {
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(1, 1, 1)));
    // Static pieces share one draw call per material.
    if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
    geometry.deleteAttribute('uv');
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat).push(geometry);
  };
  const up = new THREE.Vector3(0, 1, 0);
  const rod = (a, b, radius, mat, hollow = false) => {
    a = new THREE.Vector3(...a); b = new THREE.Vector3(...b);
    const delta = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize());
    add(new THREE.CylinderGeometry(radius, radius * 1.02, delta.length(), 16, 1, hollow), mat, a.clone().lerp(b, .5).toArray(), q);
    return { a, b, q, delta };
  };
  function bambooPole(a, b, radius, open = false) {
    const pipe = rod(a, b, radius, bamboo, open);
    for (const t of [.14, .52, .88]) {
      const point = pipe.a.clone().lerp(pipe.b, t);
      add(new THREE.CylinderGeometry(radius * 1.09, radius * 1.09, .065, 16), nodes, point.toArray(), pipe.q);
    }
    if (open) {
      const ringRotation = pipe.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      add(new THREE.RingGeometry(radius * .72, radius, 20), cut, pipe.b.toArray(), ringRotation);
      const inward = pipe.b.clone().addScaledVector(pipe.delta.clone().normalize(), -.055);
      add(new THREE.CircleGeometry(radius * .73, 20), dark, inward.toArray(), ringRotation);
    }
  }
  // Sloped, irregular stone slabs form one little island, not scattered pebbles.
  for (const [x,z,w,d,yaw] of [[-1.9,1.55,1.5,1.05,-.12],[-.3,2.15,1.65,1.1,.18],[1.45,1.65,1.45,1.15,-.23],[2.15,.3,1.2,1.6,.12],[-2.25,.1,1.3,1.45,-.3]]) {
    const g = new RoundedBoxGeometry(w,.18,d,1,.09);
    add(g,paving,[x,.07,z],new THREE.Quaternion().setFromAxisAngle(up,yaw));
  }
  const rock = (x,y,z,w,h,d,yaw) => {
    const g = new THREE.IcosahedronGeometry(1,0);
    g.scale(w/2,h/2,d/2);g.translate(0,h*.46,0);g.computeVertexNormals();
    add(g,slate,[x,y,z],new THREE.Quaternion().setFromAxisAngle(up,yaw));
  };
  rock(-1.7,0,-.7,1.8,2.25,1.4,.4);
  rock(1.65,0,-.7,1.3,2.7,1.55,-.15);
  rock(-1.75,0,.8,1.65,.85,1.45,.8);
  // A true hollow stone bowl: rim, inside wall and submerged floor are geometry.
  const profile = [[0,0],[.95,0],[1.06,.18],[1.12,.75],[1.15,1.6],[1.28,1.92],[1.34,2.1],[1.30,2.28],[1.02,2.28],[.91,2.06],[.84,1.84],[0,1.84]];
  const basin = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)),32);
  const p = basin.attributes.position;
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.atan2(z,x),r=1+.025*Math.sin(a*5)+.012*Math.cos(a*9);
    p.setXYZ(i,x*r,y+Math.min(1,y)*.018*Math.sin(a*7),z*r);
  }
  basin.computeVertexNormals();add(basin,stone);
  // A shallow interlocking diamond band, rather than straight cylinder ribs.
  for(let i=0;i<12;i++) {
    const angle=i*Math.PI/6,r=1.155;
    const points=[[-.18,1.38],[0,1.62],[.18,1.38],[0,1.17],[-.18,1.38]].map(([a,y])=>[Math.sin(angle+a)*r,y,Math.cos(angle+a)*r]);
    for(let j=0;j<4;j++)rod(points[j],points[j+1],.013,slate);
  }
  bambooPole([-1.12,.05,-1.08],[-1.12,4.3,-1.08],.13);
  bambooPole([-.55,.05,-1.25],[-.55,4.3,-1.25],.13);
  bambooPole([-1.58,3.93,-1.12],[-.16,3.93,-1.12],.14,true);
  bambooPole([-.82,4.22,-1.18],[.05,2.98,.02],.235,true);
  for(const y of [3.78,3.85,3.92]) rod([-1.29,y,-.91],[-.92,y,-1.25],.035,dark);
  // A bamboo dipper rests across the basin with a genuinely recessed cup.
  bambooPole([-.92,2.34,.55],[1.45,2.34,.55],.075,true);
  const dipper = new THREE.LatheGeometry([[0,0],[.22,0],[.29,.22],[.29,.31],[.23,.31],[.19,.08],[0,.08]].map(p=>new THREE.Vector2(...p)),20);
  add(dipper,nodes,[-.55,2.33,.55]);
  // Leafy branches frame the water feature; serrated leaf silhouettes read in the distance.
  function branch(x,z,height,lean,angle) {
    const dx=Math.cos(angle),dz=Math.sin(angle);
    rod([x,0,z],[x+dx*lean,height,z+dz*lean],.035,green);
    for(let k=0;k<6;k++)for(const side of [-1,1]) {
      const t=.28+k*.12,base=new THREE.Vector3(x+dx*lean*t,height*t,z+dz*lean*t);
      const length=.65*(1-k*.075),width=length*.32,positions=[];
      const tip=base.clone().add(new THREE.Vector3(-dz*side*length,.13,dx*side*length));
      const spine=tip.clone().sub(base),cross=new THREE.Vector3(dx,0,dz);
      const edge=(u,s)=>base.clone().addScaledVector(spine,u).addScaledVector(cross,Math.sin(Math.PI*u)*width*s*(Math.round(u*8)%2?.68:1));
      for(let j=0;j<8;j++)for(const sign of [-1,1]) {
        const a=base.clone().addScaledVector(spine,j/8),b=edge(j/8,sign),c=edge((j+1)/8,sign),d=base.clone().addScaledVector(spine,(j+1)/8);
        positions.push(...a,...b,...c,...a,...c,...d);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();add(g,k%3?green:lightGreen);
    }
  }
  for(const b of [[-1.5,-1.5,3.7,.75,2.7],[.5,-1.65,3.25,.9,.7],[1.6,-1.4,2.1,.65,.4],[-2,.4,1.3,.5,2.4],[1.7,1.35,.65,.5,.4],[-.6,2.4,.45,.35,2]])branch(...b);
  // Broad lobed leaves face outwards, giving a leafy silhouette from the main view.
  const leafOutline=[[0,0],[-.24,.16],[-.7,.24],[-.42,.43],[-.85,.6],[-.5,.66],[-.63,.93],[-.23,.86],[0,1.24],[.23,.86],[.63,.93],[.5,.66],[.85,.6],[.42,.43],[.7,.24],[.24,.16]];
  for(const [x,y,z,s,roll,yaw] of [[-1.8,2.6,-1.3,.88,.65,.2],[-1.5,3.25,-1.6,.68,-.35,.4],[-.2,2.8,-1.5,.82,-.65,.1],[.5,2.1,-1.5,.85,-.55,-.4],[1.5,1.4,-1,.9,-.8,.5],[-2.1,.6,.1,.8,.8,-.1],[-2.3,1.4,-.6,.8,.45,.4],[1.95,.35,.8,.55,-.85,.3]]) {
    const shape=new THREE.Shape(leafOutline.map(p=>new THREE.Vector2(...p)));
    const g=new THREE.ShapeGeometry(shape);g.scale(s,s,s);
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.15,yaw,roll));
    add(g,y>2.5?lightGreen:green,[x,y,z],q);
    const end=new THREE.Vector3(0,s*1.13,0).applyQuaternion(q).add(new THREE.Vector3(x,y,z));
    rod([x,y,z],end.toArray(),.012,nodes);
  }
  let triangles=0;
  for(const [mat,geometries] of parts) {
    const geometry=mergeGeometries(geometries);triangles+=geometry.attributes.position.count/3;
    const mesh=new THREE.Mesh(geometry,mat);mesh.name=mat.name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    geometries.forEach(g=>g.dispose());
  }
  const water = new THREE.MeshStandardMaterial({name:'Water garden / reflective basin water',color:'#438e81',metalness:.45,roughness:.17,transparent:true,opacity:.88});
  const surface = new THREE.Mesh(new THREE.CircleGeometry(.94,40),water);surface.rotation.x=-Math.PI/2;surface.position.y=2.075;root.add(surface);
  const streamMaterial = new THREE.MeshStandardMaterial({name:'Water garden / clear falling stream',color:'#9ae6df',emissive:'#4baaa5',emissiveIntensity:.45,roughness:.15,metalness:.1,transparent:true,opacity:.74});
  const flowCurve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(.05,2.96,.02),new THREE.Vector3(.22,2.55,.23),new THREE.Vector3(.24,2.08,.26));
  const stream=new THREE.Mesh(new THREE.TubeGeometry(flowCurve,18,.036,6,false),streamMaterial);root.add(stream);
  const rippleMaterial=new THREE.MeshBasicMaterial({color:'#b9eece',transparent:true,opacity:.45,depthWrite:false,side:THREE.DoubleSide});
  const ripples=[];
  for(let i=0;i<3;i++){const mesh=new THREE.Mesh(new THREE.RingGeometry(.15,.163,32),rippleMaterial.clone());mesh.rotation.x=-Math.PI/2;mesh.position.set(.24,2.084+i*.001,.26);root.add(mesh);ripples.push(mesh);}
  // All motion shares the existing clock, with no physics or extra render targets.
  surface.onBeforeRender=()=>{const t=time.value;for(let i=0;i<3;i++){const u=(t*.5+i/3)%1;const s=.3+u*3; ripples[i].scale.setScalar(s);ripples[i].material.opacity=(1-u)*.44;}stream.material.opacity=.68+Math.sin(t*7)*.08;};
  root.userData.statistics={triangles,staticDrawCalls:parts.size};
  const fill=new THREE.PointLight('#dae6d7',26,9,2);
  fill.name='Water garden / soft reflected moonlight';fill.position.set(1.5,5,3);root.add(fill);
  scene.add(root);return root;
}
