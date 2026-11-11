import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const original=await io.read(process.argv[2]);
const result=await io.read('public/assets/scene-v5-additions.glb');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const originalTextures=new Set(original.getRoot().listTextures().map(t=>hash(t.getImage())));
for(const t of result.getRoot().listTextures())assert(originalTextures.has(hash(t.getImage())),'Texture pixels changed');
const originalNodes=new Map(original.getRoot().listNodes().map(n=>[n.getName(),n]));
const triangles=m=>m.listPrimitives().reduce((s,p)=>s+p.getIndices().getCount()/3,0);
let protectedNodes=0;
for(const n of result.getRoot().listNodes()){
 const before=originalNodes.get(n.getName());assert(before,'Unexpected new node');
 for(const [i,x] of n.getMatrix().entries())assert(Math.abs(x-before.getMatrix()[i])<1e-5,'Transform changed');
 if(!n.getMesh())continue;
 if(/hollow glass reservoir|continuous watertight|logo yellow|logo violet|sign luminous|sign transparent|console instructions|delivery legend|cyclorama/i.test(n.getName())){
  assert.equal(triangles(n.getMesh()),triangles(before.getMesh()),'Protected geometry changed: '+n.getName());protectedNodes++;
 }
 for(const p of n.getMesh().listPrimitives()){
  const count=p.getAttribute('POSITION').getCount();
  for(const i of p.getIndices().getArray())assert(i>=0&&i<count,'Invalid vertex index');
  for(const a of p.listAttributes())for(const x of a.getArray())assert(Number.isFinite(x),'Invalid geometry');
 }
}
assert.equal(protectedNodes,9);
console.log('PASS: unchanged remaining texture pixels and transforms; 9 protected meshes intact; all remaining geometry indices finite and valid');
