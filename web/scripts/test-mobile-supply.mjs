import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMobileSupplyBatches} from '../src/mobile-supply-batches.js';
const scene=new THREE.Scene(),parent=new THREE.Group();scene.add(parent);parent.position.set(7,2,-4);parent.rotation.y=.8;
const geometry=new THREE.SphereGeometry(1,32,24),material=new THREE.MeshStandardMaterial(),supply={balls:[]};
for(let i=0;i<34;i++){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(i*.2,i*.1,-i*.1);mesh.rotation.x=i*.2;parent.add(mesh);supply.balls.push({mesh});}
const optimized=createMobileSupplyBatches(scene,supply);optimized.update();
const batch=scene.children.find(o=>o.isInstancedMesh);assert.equal(batch.count,32);
const matrix=new THREE.Matrix4();
for(let i=0;i<32;i++){batch.getMatrixAt(i,matrix);assert(matrix.elements.every((v,j)=>Math.abs(v-supply.balls[i].mesh.matrixWorld.elements[j])<1e-5));assert.equal(supply.balls[i].mesh.layers.mask,(1<<31)>>>0);}
assert.equal(supply.balls[32].mesh.layers.mask,1,'capacity overflow stays visible');
const departed=supply.balls.shift();departed.mesh.removeFromParent();parent.position.y+=3;optimized.update();
assert.equal(departed.mesh.layers.mask,1,'departed balls are released from the batching cache');
batch.getMatrixAt(0,matrix);assert(matrix.elements.every((v,j)=>Math.abs(v-supply.balls[0].mesh.matrixWorld.elements[j])<1e-5),'handoff removes departed ball and keeps current world poses');
parent.visible=false;optimized.update();assert.equal(batch.count,0,'hidden ancestors must not leave ghost balls');
optimized.dispose();assert(!scene.children.includes(batch));assert(supply.balls.every(b=>b.mesh.layers.mask===1));
assert.equal(geometry.index.count,new THREE.SphereGeometry(1,32,24).index.count);
console.log('PASS: supply world transforms, capacity overflow, handoff, hidden parents and restoration');
