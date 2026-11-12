import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareCompanionRendering} from '../src/companion-rendering.js';
import {batchRigidSiblings} from '../src/static-batching.js';
const rig=new THREE.Group(),bone=new THREE.Bone();rig.add(bone);
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(12),4));geometry.setAttribute('skinWeight',new THREE.Uint8BufferAttribute([255,0,0,0,255,0,0,0,255,0,0,0],4,true));
const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());rig.add(mesh);mesh.bind(new THREE.Skeleton([bone]));
const update=prepareCompanionRendering(rig,{outlines:false});bone.position.set(5,2,0);update();const point=new THREE.Vector3();for(let i=0;i<3;i++){mesh.getVertexPosition(i,point);assert(mesh.boundingSphere.containsPoint(point),'animated skinned vertex must remain in culling sphere');}
const box=new THREE.Group(),lid=new THREE.Group(),mat=new THREE.MeshStandardMaterial();box.add(lid);lid.name='Lid';const meshes=[];for(let i=0;i<8;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),mat);m.geometry.clearGroups();m.position.set(i*.2,0,0);lid.add(m);meshes.push(m);}const animated=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),mat);animated.name='Animated';lid.add(animated);
const clip=new THREE.AnimationClip('open',1,[new THREE.NumberKeyframeTrack('Lid.rotation[z]',[0,1],[0,1]),new THREE.VectorKeyframeTrack('Animated.scale',[0,1],[1,1,1,2,2,2])]);const b=batchRigidSiblings(box,[clip]);assert.equal(b.meshesBefore,8);assert.equal(b.meshesAfter,1);assert.equal(animated.layers.mask,1);
const batch=lid.children.find(x=>x.name.startsWith('Rigid detail batch'));
for(const angle of [0,.4,1.2]){lid.rotation.z=angle;box.updateMatrixWorld(true);const expected=new THREE.Box3();meshes.forEach(m=>{m.geometry.computeBoundingBox();expected.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));});const actual=batch.geometry.boundingBox.clone().applyMatrix4(batch.matrixWorld);assert(expected.min.distanceTo(actual.min)<1e-6&&expected.max.distanceTo(actual.max)<1e-6,'animated lid bounds');}
console.log('PASS: normalized skin weights / animated bounds / rigid batching preserves lid animation and excludes deforming parts');

