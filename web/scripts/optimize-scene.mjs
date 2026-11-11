// Run once against the archived high-quality inputs; never repeatedly simplify output.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, EXTMeshoptCompression} from '@gltf-transform/extensions';
import {simplifyPrimitive, prune, unpartition, reorder} from '@gltf-transform/functions';
import {MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder} from 'meshoptimizer';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const hash=a=>crypto.createHash('sha256').update(a).digest('hex');
const stats=d=>({triangles:d.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0),nodes:d.getRoot().listNodes().length,materials:d.getRoot().listMaterials().map(m=>m.getName()),textures:d.getRoot().listTextures().map(t=>hash(t.getImage())),animations:d.getRoot().listAnimations().map(a=>a.getName())});
const report=[];
const input=process.argv[2];
if(!input) throw Error('Pass the extracted high-quality assets directory; do not simplify optimized outputs again.');
for(const file of ['scene-v5-additions','chamber-one-shot','machine','handbag-v5','box-v5','display_props','cart-v5','pokedex']) {
 const path=`public/assets/${file}.glb`, d=await io.read(`${input}/${file}.glb`), before=stats(d);
 for(const m of d.getRoot().listMeshes()) {
  // Preserve hero geometry, text, decals and all transparent glass surfaces.
  const protectedMesh=/hero|glass|reservoir|tube|letter|logo|legend|stencil|label|instruction|fleece/i.test(m.getName());
  const eligible=file==='scene-v5-additions'&&!protectedMesh || file==='chamber-one-shot'&&/^(Base_Shell|Lid_Shell)/.test(m.getName());
  if(!eligible) continue;
  for(const p of m.listPrimitives()) {
   const mat=p.getMaterial();
   if(!p.getIndices() || p.listTargets().length || p.getAttribute('JOINTS_0') || p.getIndices().getCount()<1500 || mat?.getAlphaMode()!=='OPAQUE') continue;
   simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio:file==='chamber-one-shot'?.7:.5,error:file==='chamber-one-shot'?.0005:.0008,lockBorder:true});
  }
 }
 // Preserve every named node/material: runtime interactions bind to those names.
 await d.transform(prune({propertyTypes:['Accessor'],keepAttributes:true}),unpartition(),reorder({encoder:MeshoptEncoder}));
 d.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
 const bytes=await io.writeBinary(d);
 const decoded=await io.readBinary(bytes), after=stats(decoded);
 for(const key of ['nodes','materials','textures','animations']) if(JSON.stringify(before[key])!==JSON.stringify(after[key])) throw Error(`${file}: changed ${key}`);
 if(bytes.length>25*1024*1024) {
  const b=Buffer.from(bytes), jl=b.readUInt32LE(12), j=JSON.parse(b.subarray(20,20+jl).toString()), bin=b.subarray(28+jl);
  const buffers=j.buffers.map(x=>({...x})), chunks=[], mapping=new Map();
  let pieces=[], length=0;
  const flush=()=>{if(length){chunks.push(Buffer.concat(pieces));pieces=[];length=0;}};
  for(const view of j.bufferViews) for(const ref of [view,view.extensions?.EXT_meshopt_compression].filter(Boolean)) {
   if(ref.buffer!==0) continue;
   const key=`${ref.byteOffset||0}/${ref.byteLength}`;
   if(!mapping.has(key)) {
    if(length+ref.byteLength>20*1024*1024) flush();
    mapping.set(key,{buffer:buffers.length+chunks.length,byteOffset:length});
    const part=bin.subarray(ref.byteOffset||0,(ref.byteOffset||0)+ref.byteLength), pad=(4-part.length%4)%4;
    pieces.push(part,Buffer.alloc(pad));length+=part.length+pad;
   }
   Object.assign(ref,mapping.get(key));
  }
  flush(); buffers[0]={byteLength:0};
  for(let i=0;i<chunks.length;i++) {const uri=`${file}.optimized-${i}.bin`;await fs.writeFile(`public/assets/${uri}`,chunks[i]);buffers.push({uri,byteLength:chunks[i].length});}
  j.buffers=buffers;
  let json=Buffer.from(JSON.stringify(j));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  await fs.writeFile(path,Buffer.concat([header,json]));
 } else await fs.writeFile(path,bytes);
 report.push({file,before:before.triangles,after:after.triangles,bytes:bytes.length,textureHashesUnchanged:true});
 console.log(report.at(-1));
}
await fs.writeFile('../optimization-report.json',JSON.stringify(report,null,2));
