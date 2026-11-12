import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import sharp from 'sharp';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {quantize,getBounds} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';

await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const files=['machine.glb','pokeball.glb','scene-v5-additions.glb','handbag-v5.glb','box-v5.glb','display_props.glb','output-sequence.glb','chamber-one-shot.glb','cart-v5.glb','pokedex.glb','pokemon-neon-sign.glb','companions/081.glb','companions/587.glb','pokemon-v5/025.glb'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const geometry=d=>d.getRoot().listMeshes().map(m=>({name:m.getName(),primitives:m.listPrimitives().map(p=>({indices:p.getIndices()?hash(Buffer.from(p.getIndices().getArray().buffer,p.getIndices().getArray().byteOffset,p.getIndices().getArray().byteLength)):null,attributes:p.listSemantics().map(k=>[k,hash(Buffer.from(p.getAttribute(k).getArray().buffer,p.getAttribute(k).getArray().byteOffset,p.getAttribute(k).getArray().byteLength))])}))}));
const selected=process.argv[2]?[process.argv[2]]:files;
const manifest=process.argv[2]?JSON.parse(await fs.readFile('src/mobile-transfer-manifest.json')):{};
const report=process.argv[2]?JSON.parse(await fs.readFile('../mobile-assets-report.json')).filter(row=>!selected.includes(row.file)):[];
await fs.mkdir('public/assets/mobile',{recursive:true});
for(const file of selected){
 const input=await fs.readFile('public/assets/'+file),length=input.readUInt32LE(12),json=JSON.parse(input.subarray(20,20+length));
 const bin=input.subarray(28+length),d=await io.readBinary(input),before=geometry(d),nodes=d.getRoot().listNodes().map(n=>n.getName()),animations=d.getRoot().listAnimations().map(a=>a.getName());
 let imageBefore=0,imageAfter=0;
 const replacements=new Map();
 for(const imageInfo of json.images||[]){
  if(imageInfo.bufferView===undefined)continue;
  const view=json.bufferViews[imageInfo.bufferView];if(view.buffer!==0)throw Error('External image buffer');
  const image=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);imageBefore+=image.length;
  // Preserve UVs and alpha; only raster resolution/encoding changes on phones.
  const out=await sharp(image).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:84,alphaQuality:100,effort:6}).toBuffer();
  replacements.set(imageInfo.bufferView,out);imageInfo.mimeType='image/webp';imageAfter+=out.length;
 }
 for(const texture of json.textures||[]){if(texture.source!==undefined&&json.images[texture.source]?.mimeType==='image/webp'){
   texture.extensions||={};texture.extensions.EXT_texture_webp={source:texture.source};delete texture.source;
 }}
 if(replacements.size){json.extensionsUsed=[...new Set([...(json.extensionsUsed||[]),'EXT_texture_webp'])];json.extensionsRequired=[...new Set([...(json.extensionsRequired||[]),'EXT_texture_webp'])];}
 const pieces=[],ranges=new Map();let offset=0;
 // Copy encoded vertex/index/animation ranges byte-for-byte, replacing images only.
 for(const [i,view] of (json.bufferViews||[]).entries())for(const ref of [view,view.extensions?.EXT_meshopt_compression].filter(Boolean)){
  if(ref.buffer!==0)continue;
  const key=replacements.has(i)&&ref===view?'image:'+i:`${ref.byteOffset||0}/${ref.byteLength}`;
  if(!ranges.has(key)){
   const data=replacements.has(i)&&ref===view?replacements.get(i):bin.subarray(ref.byteOffset||0,(ref.byteOffset||0)+ref.byteLength);
   ranges.set(key,{byteOffset:offset,byteLength:data.length});const padding=(4-data.length%4)%4;
   pieces.push(data,Buffer.alloc(padding));offset+=data.length+padding;
  }
  Object.assign(ref,ranges.get(key));
 }
 json.buffers[0].byteLength=offset;
 let jb=Buffer.from(JSON.stringify(json));jb=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,32)]);
 const header=Buffer.alloc(20),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jb.length+offset,8);header.writeUInt32LE(jb.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(offset);bh.writeUInt32LE(0x004e4942,4);
 let bytes=Buffer.concat([header,jb,bh,...pieces]);
 const decoded=await io.readBinary(bytes);
 if(JSON.stringify(before)!==JSON.stringify(geometry(decoded)))throw Error(file+': geometry changed');
 if(JSON.stringify(nodes)!==JSON.stringify(decoded.getRoot().listNodes().map(n=>n.getName())))throw Error(file+': node names changed');
 if(JSON.stringify(animations)!==JSON.stringify(decoded.getRoot().listAnimations().map(a=>a.getName())))throw Error(file+': animation selection changed');
 let precisionOnly=false;
 if(file==='scene-v5-additions.glb'){
   const bounds=getBounds(decoded.getRoot().listScenes()[0]);
   const triangles=decoded.getRoot().listMeshes().map(m=>m.listPrimitives().map(p=>p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount()));
   // Positions remain exact Float32: scene setup moves connected sign vertices
   // and must not write those offsets into normalized integer attributes.
   const positions=decoded.getRoot().listMeshes().map(m=>m.listPrimitives().map(p=>hash(Buffer.from(p.getAttribute('POSITION').getArray().buffer))));
   await decoded.transform(quantize({pattern:/^(NORMAL|TANGENT|TEXCOORD_\d+)$/,quantizeNormal:12,quantizeTexcoord:16}));
   decoded.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
   bytes=Buffer.from(await io.writeBinary(decoded));const verify=await io.readBinary(bytes),after=getBounds(verify.getRoot().listScenes()[0]);
   if(JSON.stringify(positions)!==JSON.stringify(verify.getRoot().listMeshes().map(m=>m.listPrimitives().map(p=>hash(Buffer.from(p.getAttribute('POSITION').getArray().buffer))))))throw Error('Mobile prop positions changed');
   if(JSON.stringify(triangles)!==JSON.stringify(verify.getRoot().listMeshes().map(m=>m.listPrimitives().map(p=>p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount()))))throw Error('Mobile prop topology changed');
   if([...bounds.min.map((v,i)=>Math.abs(v-after.min[i])),...bounds.max.map((v,i)=>Math.abs(v-after.max[i]))].some(delta=>delta>.01))throw Error('Mobile props moved outside precision tolerance');
   precisionOnly=true;
 }
 const parts=[];
 for(let offset=0;offset<bytes.length;offset+=2*1024*1024){
  const raw=bytes.subarray(offset,offset+2*1024*1024),gz=gzipSync(raw,{level:9}),name=hash(gz).slice(0,24)+'.bin';
  if(!gunzipSync(gz).equals(raw))throw Error('Mobile transfer mismatch');
  await fs.writeFile('public/assets/mobile/'+name,gz);parts.push({url:'/assets/mobile/'+name,bytes:gz.length,size:raw.length});
 }
 manifest['/assets/'+file]={size:bytes.length,parts};
 const row={file,bytes:bytes.length,transfer:parts.reduce((n,p)=>n+p.bytes,0),requests:parts.length,imageBefore,imageAfter,geometryUnchanged:!precisionOnly,topologyUnchanged:true,precisionOnly};report.push(row);console.log(row);
}
await fs.writeFile('src/mobile-transfer-manifest.json',JSON.stringify(manifest));
await fs.writeFile('../mobile-assets-report.json',JSON.stringify(report,null,2));
const textures={};
for(const [key,file,width] of [['sky','milky-way-4k.jpg',2048],['pokedex','pokedex/pokedex-material-atlas-v1.png',1024]]){
 const image=await sharp('public/assets/'+file).resize({width,withoutEnlargement:true}).webp({quality:86,effort:6}).toBuffer();
 const name=hash(image).slice(0,24)+'.webp';await fs.writeFile('public/assets/mobile/'+name,image);textures[key]='/assets/mobile/'+name;
 console.log({texture:key,bytes:image.length});
}
await fs.writeFile('src/mobile-textures.json',JSON.stringify(textures));
console.log({total:report.reduce((n,r)=>n+r.transfer,0),requests:report.reduce((n,r)=>n+r.requests,0)});
