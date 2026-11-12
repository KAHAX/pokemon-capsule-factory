import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// One compact rock garden behind the conveyor, outside the companions' routes.
export const DISTANT_NATURE_PATCHES = [
  { x:-45, z:-17, scale:1, angle:.2 },
];
export function addDistantNature(scene) {
  const root=new THREE.Group();root.name='Background / distant rocks and low plants';
  const materials=[
    new THREE.MeshStandardMaterial({name:'Distant nature / blue slate',color:'#65798b',roughness:.88,metalness:.04}),
    new THREE.MeshStandardMaterial({name:'Distant nature / weathered stone',color:'#88928d',roughness:.92,metalness:.02}),
    new THREE.MeshStandardMaterial({name:'Distant nature / shadow foliage',color:'#48775f',roughness:.85,side:THREE.DoubleSide}),
    new THREE.MeshStandardMaterial({name:'Distant nature / sage tips',color:'#85a969',roughness:.82,side:THREE.DoubleSide}),
  ];
  const buckets=materials.map(()=>[]);let seed=8341;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  function rock(x,z,w,h,d,kind){
    // Broad stratified planes and a sloping crown, rather than swollen spheres.
    const footprint=[[-.47,-.32],[-.16,-.52],[.38,-.39],[.52,.04],[.29,.43],[-.3,.46],[-.54,.08]];
    const rings=[
      footprint.map(([a,b])=>[a*w,-.09,b*d]),
      footprint.map(([a,b])=>[(a*.96+.025)*w,(.62+a*.12)*h,b*.94*d]),
      footprint.map(([a,b])=>[(a*.65-.12)*w,(.91+a*.2-b*.1)*h,(b*.65-.045)*d]),
    ];
    const vertices=[];
    const tri=(a,b,c)=>vertices.push(...a,...b,...c);
    for(let ring=0;ring<2;ring++)for(let i=0;i<7;i++){
      const j=(i+1)%7,a=rings[ring][i],b=rings[ring][j],c=rings[ring+1][i],e=rings[ring+1][j];
      tri(a,c,b);tri(b,c,e);
    }
    for(let i=1;i<6;i++)tri(rings[2][0],rings[2][i+1],rings[2][i]);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();
    rotation.setFromAxisAngle(up,random()*Math.PI);
    matrix.compose(new THREE.Vector3(x,-.69,z),rotation,new THREE.Vector3(1,1,1));g.applyMatrix4(matrix);buckets[kind].push(g);
  }
  function tuft(x,z,size,broad=false){
    const positions=[];
    for(let blade=0;blade<11;blade++){
      const angle=blade*2.399+random()*.35,height=size*(.65+random()*.55),lean=.3+random()*.6,width=size*(broad ? .15+random()*.07 : .075+random()*.065);
      const dx=Math.sin(angle),dz=Math.cos(angle),bx=(random()-.5)*size*.28,bz=(random()-.5)*size*.28;
      const edge=(t,side)=>{
        const spread=lean*height*t*t,w=width*Math.pow(Math.sin(Math.PI*t),broad?.72:1)*(1-t*.5);
        return [x+bx+dx*spread+dz*w*side,-.71+height*t,z+bz+dz*spread-dx*w*side];
      };
      for(let j=0;j<5;j++){
        const a=edge(j/5,-1),b=edge(j/5,1),c=edge((j+1)/5,-1),d=edge((j+1)/5,1);
        // Raised midrib makes the wider leaves read as foliage, rather than flat strips.
        const mid=t=>{const l=edge(t,-1),r=edge(t,1);return [(l[0]+r[0])*.5,(l[1]+r[1])*.5+(broad?.055:0)*size*Math.sin(Math.PI*t),(l[2]+r[2])*.5];};
        const m=mid(j/5),n=mid((j+1)/5);
        positions.push(...a,...m,...c,...m,...n,...c,...m,...b,...n,...b,...d,...n);
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();buckets[random()>.7?3:2].push(g);
  }
  for(const patch of DISTANT_NATURE_PATCHES){
    const {x,z,scale:s,angle}=patch,c=Math.cos(angle),sn=Math.sin(angle);
    const at=(dx,dz)=>[x+(dx*c-dz*sn)*s,z+(dx*sn+dz*c)*s];
    rock(...at(-.65,-.4),3.3*s,3.25*s,1.95*s,0);
    rock(...at(1.35,.15),3.0*s,1.65*s,1.8*s,1);
    rock(...at(-.4,1.05),3.6*s,.48*s,1.65*s,0);
    for(const [dx,dz,k] of [[-2.1,-.85,1.9],[2.6,-.2,1.7],[1.8,1.4,.85]])tuft(...at(dx,dz),s*k,true);
  }
  let triangles=0;
  buckets.forEach((parts,i)=>{
    if(!parts.length)return;const geometry=mergeGeometries(parts);triangles+=geometry.attributes.position.count/3;
    const mesh=new THREE.Mesh(geometry,materials[i]);mesh.name=materials[i].name;mesh.castShadow=i<2;mesh.receiveShadow=true;root.add(mesh);
    parts.forEach(g=>g.dispose());
  });
  root.userData.statistics={triangles,drawCalls:root.children.length,patches:DISTANT_NATURE_PATCHES.length};scene.add(root);return root;
}
