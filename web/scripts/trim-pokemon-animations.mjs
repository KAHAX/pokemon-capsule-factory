import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {displayAnimationNames} from '../src/pokemon-animation-policy.js';
import {SPECIES} from '../src/wildlife-companions.js';
const source=process.argv[2]||path.resolve('public/assets');
const output='public/assets',backup=process.argv[3]||path.resolve('../backups/animations-'+new Date().toISOString().replace(/[:.]/g,'-')+'/public/assets');
const manifest=JSON.parse(await fs.readFile(source+'/pokemon-v5/manifest.json','utf8'));
const legendText=await fs.readFile('src/reshiram-companion.js','utf8'),raikouText=await fs.readFile('src/raikou-companion.js','utf8');
const clipKeys=text=>[...new Set([...text.matchAll(/clip:\s*'([^']+)'/g)].map(x=>x[1]))];
const legendary=clipKeys(legendText),raikou=[...clipKeys(raikouText),'walk01'];
const extras=['00150_jumpup01_start','00151_jumpup01_loop','00152_jumpdown01_start','00153_jumpdown01_loop','00155_land02','00300_roar01','00550_glad01'];
const wildlife=species=>[...new Set(Object.values(SPECIES[species]).flat().concat(species==='cubone'?['ba20_buturi01']:extras))];
const required={
 'companions/081.glb':['defaultwait01','rangeattack02_start','rangeattack02_loop','rangeattack02_end'],
 'companions/311.glb':['defaultwait01','run01','glad01','defaultidle02'],
 'companions/312.glb':['defaultwait01','run01','defaultidle01','glad01','notice01'],
 'companions/587.glb':['fi21_run01','kw01_wait01'],
 'companions/243.glb':raikou,
 'companions/643.glb':legendary,
 'companions/151.glb':['20000_defaultwait01','20560_notice01','20010_defaultidle01'],
 'pokemon-v5/644.glb':legendary,
 'pokemon-v5/025.glb':wildlife('pikachu'),
 'pokemon-v5/135.glb':wildlife('jolteon'),
 'pokemon-v5/104.glb':wildlife('cubone'),
 'pokemon-v5/384.glb':['20030_walk01','20100_run01'],
};
const supplement=JSON.parse(await fs.readFile(source+'/companions/reshiram-skill-clips.json','utf8'));
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},component={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
function parse(buffer){const length=buffer.readUInt32LE(12);return {j:JSON.parse(buffer.subarray(20,20+length)),bin:buffer.subarray(28+length)};}
function accessorBytes(doc,id){const a=doc.j.accessors[id],v=doc.j.bufferViews[a.bufferView],size=sizes[a.type]*component[a.componentType];assert(size&&!a.sparse);const stride=v.byteStride||size,start=(v.byteOffset||0)+(a.byteOffset||0),bytes=Buffer.alloc(a.count*size);for(let i=0;i<a.count;i++)doc.bin.copy(bytes,i*size,start+i*stride,start+i*stride+size);return bytes;}
function repack(doc,names){
 const j=structuredClone(doc.j),oldAccessors=j.accessors,oldViews=j.bufferViews; j.animations=(j.animations||[]).filter(a=>names.has(a.name));
 const used=new Set();for(const mesh of j.meshes||[])for(const p of mesh.primitives){if(p.indices!==undefined)used.add(p.indices);Object.values(p.attributes).forEach(x=>used.add(x));for(const t of p.targets||[])Object.values(t).forEach(x=>used.add(x));}
 for(const s of j.skins||[])if(s.inverseBindMatrices!==undefined)used.add(s.inverseBindMatrices);
 for(const a of j.animations)for(const s of a.samplers){used.add(s.input);used.add(s.output);}
 const blocks=[],views=[],accessors=[],mapping=new Map();let offset=0;
 const append=(bytes,target)=>{const index=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}: {})});blocks.push(bytes);offset+=bytes.length;const padding=(4-offset%4)%4;if(padding){blocks.push(Buffer.alloc(padding));offset+=padding;}return index;};
 for(const id of [...used].sort((a,b)=>a-b)){const a=structuredClone(oldAccessors[id]);mapping.set(id,accessors.length);a.bufferView=append(accessorBytes(doc,id),oldViews[a.bufferView].target);delete a.byteOffset;accessors.push(a);}
 const copiedImages=new Map();for(const image of j.images||[]){if(image.bufferView===undefined)continue;const id=image.bufferView,v=oldViews[id];if(!copiedImages.has(id))copiedImages.set(id,append(doc.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)));image.bufferView=copiedImages.get(id);}
 for(const mesh of j.meshes||[])for(const p of mesh.primitives){if(p.indices!==undefined)p.indices=mapping.get(p.indices);for(const k of Object.keys(p.attributes))p.attributes[k]=mapping.get(p.attributes[k]);for(const t of p.targets||[])for(const k of Object.keys(t))t[k]=mapping.get(t[k]);}
 for(const s of j.skins||[])if(s.inverseBindMatrices!==undefined)s.inverseBindMatrices=mapping.get(s.inverseBindMatrices);
 for(const a of j.animations)for(const s of a.samplers){s.input=mapping.get(s.input);s.output=mapping.get(s.output);}
 j.accessors=accessors;j.bufferViews=views;j.buffers=[{byteLength:offset}];
 const raw=Buffer.from(JSON.stringify(j)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);const bin=Buffer.concat(blocks),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
 const result=Buffer.concat([header,json,binHeader,bin]),after=parse(result);
 assert.deepEqual(j.nodes,doc.j.nodes);assert.deepEqual(j.materials,doc.j.materials);assert.deepEqual(j.textures,doc.j.textures);
 for(const [oldId,newId] of mapping)assert(accessorBytes(doc,oldId).equals(accessorBytes(after,newId)),'changed accessor bytes');
 for(let i=0;i<(j.images||[]).length;i++){const a=doc.j.bufferViews[doc.j.images[i].bufferView],b=j.bufferViews[j.images[i].bufferView];assert(doc.bin.subarray(a.byteOffset||0,(a.byteOffset||0)+a.byteLength).equals(after.bin.subarray(b.byteOffset||0,(b.byteOffset||0)+b.byteLength)),'changed image bytes');}
 return result;
}
const report=[];
for(const folder of ['companions','pokemon-v5','pokemon'])for(const file of (await fs.readdir(source+'/'+folder)).filter(f=>f.endsWith('.glb'))){
 const relative=folder+'/'+file,before=await fs.readFile(source+'/'+relative),doc=parse(before),clips=doc.j.animations||[];if(!clips.length)continue;
 assert.equal(doc.j.buffers.length,1);assert(!doc.j.extensionsRequired?.some(x=>/meshopt|draco/.test(x)));
 const entry=manifest.find(e=>e.file===relative)||{id:file.slice(0,3),animation:clips.find(a=>a.name.includes('defaultwait'))?.name};
 const names=folder==='companions'?new Set():displayAnimationNames(clips,entry);
 const missing=[];for(const key of required[relative]||[]){const found=clips.find(c=>c.name.includes(key));if(found)names.add(found.name);else if(relative==='companions/643.glb'&&supplement.some(c=>c.name.includes(key))){}else if(['pokemon-v5/025.glb','pokemon-v5/135.glb','pokemon-v5/104.glb'].includes(relative))missing.push(key);else throw Error(relative+' missing '+key);}
 assert(names.size>0,relative+' no required clips');
 const after=names.size===clips.length?before:repack(doc,names);await fs.mkdir(path.dirname(backup+'/'+relative),{recursive:true});await fs.copyFile(source+'/'+relative,backup+'/'+relative);await fs.mkdir(path.dirname(output+'/'+relative),{recursive:true});await fs.writeFile(output+'/'+relative,after);
 const row={file:relative,beforeBytes:before.length,afterBytes:after.length,beforeClips:clips.length,afterClips:names.size,kept:clips.filter(a=>names.has(a.name)).map(a=>a.name),alreadyMissingOptional:missing,beforeHash:crypto.createHash('sha256').update(before).digest('hex')};report.push(row);console.log(relative+': '+clips.length+' -> '+names.size+' clips, '+(before.length/1e6).toFixed(1)+' -> '+(after.length/1e6).toFixed(1)+' MB');
}
for(const entry of manifest){const row=report.find(r=>r.file===entry.file);if(row){entry.animations=row.kept;entry.sourceActionCount=row.afterClips;}}
await fs.copyFile(source+'/pokemon-v5/manifest.json',backup+'/pokemon-v5/manifest.json');await fs.writeFile(output+'/pokemon-v5/manifest.json',JSON.stringify(manifest,null,2));
await fs.writeFile('animation-prune-report.json',JSON.stringify(report,null,2));console.log('TOTAL',JSON.stringify(report.reduce((a,r)=>({beforeBytes:a.beforeBytes+r.beforeBytes,afterBytes:a.afterBytes+r.afterBytes,beforeClips:a.beforeClips+r.beforeClips,afterClips:a.afterClips+r.afterClips}),{beforeBytes:0,afterBytes:0,beforeClips:0,afterClips:0})));
