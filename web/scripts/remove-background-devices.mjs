// Remove complete disconnected parts, never clip triangles through a device.
// Input must be the separately saved pre-removal additions model.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, EXTMeshoptCompression} from '@gltf-transform/extensions';
import {prune, compactPrimitive, unpartition, reorder} from '@gltf-transform/functions';
import {MeshoptDecoder, MeshoptEncoder} from 'meshoptimizer';
import fs from 'node:fs';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const input=process.argv[2];if(!input)throw Error('Supply saved pre-removal model');
const d=await io.read(input), report=[], retainedParts=[];
const stats=()=>({triangles:d.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0),meshes:d.getRoot().listMeshes().length,textures:d.getRoot().listTextures().length,textureBytes:d.getRoot().listTextures().reduce((s,t)=>s+t.getImage().byteLength,0)});
const before=stats();
for(const node of d.getRoot().listNodes()) {
 const mesh=node.getMesh();if(!mesh)continue;
 const name=node.getName();
 if(/FLEECE|cyclorama/i.test(name))continue;
 const world=node.getWorldMatrix();
 for(const primitive of [...mesh.listPrimitives()]) {
  const position=primitive.getAttribute('POSITION'), index=primitive.getIndices();
  if(!index)throw Error('Expected indexed mesh '+name);
  const points=position.getArray(), indices=index.getArray(), count=position.getCount();
  const parent=new Int32Array(count);for(let i=0;i<count;i++)parent[i]=i;
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a;};
  const welded=new Map();
  for(let i=0;i<count;i++) {const key=[0,1,2].map(j=>Math.round(points[i*3+j]*10000)).join(',');if(welded.has(key))join(i,welded.get(key));else welded.set(key,i);}
  for(let i=0;i<indices.length;i+=3){join(indices[i],indices[i+1]);join(indices[i],indices[i+2]);}
  const components=new Map();
  for(let i=0;i<count;i++) {
   const r=root(i);let c=components.get(r);if(!c){c={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};components.set(r,c);}
   const x=points[i*3],y=points[i*3+1],z=points[i*3+2];
   const p=[world[0]*x+world[4]*y+world[8]*z+world[12],world[1]*x+world[5]*y+world[9]*z+world[13],world[2]*x+world[6]*y+world[10]*z+world[14]];
   p.forEach((v,j)=>{c.min[j]=Math.min(c.min[j],v);c.max[j]=Math.max(c.max[j],v);});
  }
  for(const c of components.values()) {
   const track=c.min[2]>-4.4 && c.max[2]<-1.9 && c.min[1]>-.85 && c.max[1]<3.5;
   const rearCabinet=c.min[0]>-6.3&&c.max[0]<-4.4&&c.min[2]>-5.5&&c.max[2]<-4&&c.max[1]<4.5;
   c.remove=(/WEB_STATIC_background/.test(name)&&!track)||c.max[2]<-6.5||(c.max[0]<-11&&!track)||rearCabinet||/Rear left control cabinet|Rear diagnostic screen|Rear service map/.test(name);
   if(!c.remove)retainedParts.push({name,min:c.min,max:c.max});
  }
  const keep=[];for(let i=0;i<indices.length;i+=3)if(!components.get(root(indices[i])).remove)keep.push(indices[i],indices[i+1],indices[i+2]);
  if(keep.length!==indices.length) {
   report.push({name,before:indices.length/3,after:keep.length/3,removedComponents:[...components.values()].filter(c=>c.remove).length});
   if(keep.length){primitive.setIndices(d.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(index.getBuffer()));compactPrimitive(primitive);}
   else mesh.removePrimitive(primitive);
  }
 }
 if(!mesh.listPrimitives().length)node.dispose();
}
await d.transform(prune({keepAttributes:true,keepLeaves:false}),unpartition(),reorder({encoder:MeshoptEncoder}));
d.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
const bytes=await io.writeBinary(d), after=stats();
fs.writeFileSync('public/assets/scene-v5-additions.glb',bytes);
fs.writeFileSync('../background-removal-report.json',JSON.stringify({before,after,bytes:bytes.length,removed:report},null,2));
fs.writeFileSync('D:/Codex/2026-11-11/retained-scene-parts.json',JSON.stringify(retainedParts));
console.log(JSON.stringify({before,after,bytes:bytes.length}));
