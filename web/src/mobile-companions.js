import * as THREE from 'three';
import { CompanionActor } from './background-companions.js';
import { createAssetLoader } from './asset-loader.js';

// A phone-sized cast. Other species remain available as capsule/card prizes;
// their rigs, shaders and animations are not resident in the factory scene.
export class MobileCompanions {
  constructor(scene) {
    this.scene=scene;this.group=new THREE.Group();this.group.name='Mobile / near-scene Pokemon';
    scene.add(this.group);this.time=0;this.ready=false;this.fullyLoaded=false;
    this.workers=[];this.pals=[];this.wanderers=[];
  }
  async load({onProgress=()=>{}}={}) {
    const loader=createAssetLoader();let done=0;
    const assets=await Promise.all(['/assets/companions/081.glb','/assets/companions/587.glb','/assets/pokemon-v5/025.glb'].map(async url=>{
      const asset=await loader.loadAsync(url);onProgress(++done,3);return asset;
    }));
    this.magnet=new CompanionActor(assets[0],'小磁怪 / mobile technician',1.45,true,assets[0].animations[0].name);
    this.magnet.root.position.set(-6.1,3.1,-1.05);this.magnet.targetYaw=.2;
    this.flyer=new CompanionActor(assets[1],'电飞鼠 / mobile sign perch',1.65,true,'kw01_wait01');
    this.flyer.update(0);this.flyer.root.updateMatrixWorld(true);
    const standing=new THREE.Box3().setFromObject(this.flyer.root,true);
    this.flyer.root.position.set(-4.7,15.332-standing.min.y,-3.65);this.flyer.targetYaw=.35;
    this.pikachu=new CompanionActor(assets[2],'皮卡丘 / mobile meadow',2.2,false,'00000_defaultwait01');
    this.pikachu.root.position.set(11.2,-.69,-3.6);
    for(const actor of [this.magnet,this.flyer,this.pikachu]){
      actor.root.traverse(mesh=>{if(mesh.isMesh)mesh.castShadow=false;});this.group.add(actor.root);
    }
    this.ready=this.fullyLoaded=true;this.update(0);
  }
  update(dt) {
    if(!this.ready)return;this.time+=dt;
    this.magnet.root.position.y=3.1+Math.sin(this.time*1.2)*.08;
    const phase=this.time%26;
    this.pikachu.play(phase<14?'00030_walk01':'00000_defaultwait01',.3,.75);
    if(phase<14){
      const angle=phase/14*Math.PI*2;
      this.pikachu.root.position.set(11.2+1.4*Math.cos(angle),-.69,-5+1.4*Math.sin(angle));
      this.pikachu.targetYaw=Math.atan2(-Math.sin(angle),Math.cos(angle));
    }
    for(const actor of [this.magnet,this.flyer,this.pikachu])actor.update(dt);
  }
}
