import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const beforeRoot='D:/Codex/2026-11-11/high-quality-validation/web/public/assets/';
const report=JSON.parse(await fs.readFile('../optimization-report.json','utf8'));
const arr=a=>Array.from(a);
for(const row of report){
 if(row.file==='scene-v5-additions') {console.log('scene-v5-additions: intentional background removal; use check-background-removal.mjs against pre-removal model');continue;}
 const a=await io.read(beforeRoot+row.file+'.glb'),b=await io.read('public/assets/'+row.file+'.glb');
 const rig=d=>d.getRoot().listNodes().map(n=>[n.getName(),n.getTranslation(),n.getRotation(),n.getScale(),n.getMesh()?.getName()]);
 const ra=rig(a),rb=rig(b); assert.equal(ra.length,rb.length);
 for(let i=0;i<ra.length;i++) {assert.equal(ra[i][0],rb[i][0]);assert.equal(ra[i][4],rb[i][4]);for(let j=1;j<4;j++)for(let k=0;k<ra[i][j].length;k++)assert(Math.abs(ra[i][j][k]-rb[i][j][k])<1e-5,'transform tolerance');}
 const animations=d=>d.getRoot().listAnimations().map(a=>a.listChannels().map(c=>[c.getTargetNode()?.getName(),c.getTargetPath(),c.getSampler().getInterpolation(),arr(c.getSampler().getInput().getArray()),arr(c.getSampler().getOutput().getArray())]));
 assert.deepEqual(animations(a),animations(b),row.file+' animation data');
 for(const mesh of b.getRoot().listMeshes()) for(const p of mesh.listPrimitives()) {
  const count=p.getAttribute('POSITION').getCount();
  for(const i of p.getIndices()?.getArray()||[]) assert(i<count && i>=0,'invalid index');
  for(const attr of p.listAttributes()) for(const x of attr.getArray()) assert(Number.isFinite(x),'nonfinite attribute');
 }
 console.log(row.file+': valid indices/attributes; all transforms, animation keys unchanged');
}
