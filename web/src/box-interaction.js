import * as THREE from 'three';

export class BoxInteraction {
  constructor(scene, asset) {
    this.root = asset.scene;
    this.root.name = 'InteractiveBlenderBox';
    this.root.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = !object.material?.transparent;
        object.receiveShadow = true;
      }
    });
    // Place outside the platform. Transform a parent so authored lid animation
    // and its local pivots remain unchanged at the larger display size.
    this.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.root);
    const center = bounds.getCenter(new THREE.Vector3());
    this.placement = new THREE.Group();
    this.placement.name = 'Question box / right ground placement';
    this.placement.scale.setScalar(1.5);
    this.placement.position.set(9.2 - center.x * 1.5, -.69 - bounds.min.y * 1.5, .4 - center.z * 1.5);
    this.placement.add(this.root);
    scene.add(this.placement);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = asset.animations.map((clip) => {
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      return action;
    });
    this.root.traverse(o=>{if(/pokeball_standard$/i.test(o.name))this.prize=o;});
    this.readyAt = 0;
    try { this.readyAt=Number(localStorage.getItem('capsule-box-ready-at'))||0; } catch {}
    this.charge = {value:1};
    this.root.updateWorldMatrix(true,true);
    const marks=[];const markBounds=new THREE.Box3();
    this.root.traverse(o=>{if(o.isMesh && /Front[_ ]ivory[_ ]question/i.test(o.name)){marks.push(o);markBounds.union(new THREE.Box3().setFromObject(o));}});
    for(const mesh of marks){
      mesh.geometry=mesh.geometry.clone();
      const positions=mesh.geometry.attributes.position;
      const heights=new Float32Array(positions.count),point=new THREE.Vector3();
      for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
        heights[i]=(point.y-markBounds.min.y)/Math.max(.01,markBounds.max.y-markBounds.min.y);
      }
      mesh.geometry.setAttribute('boxFillHeight',new THREE.BufferAttribute(heights,1));
      const original=mesh.material;mesh.material=original.clone();const m=mesh.material;
      m.onBeforeCompile=shader=>{
        shader.uniforms.boxCharge=this.charge;
        shader.uniforms.boxMin={value:markBounds.min.y};shader.uniforms.boxHeight={value:Math.max(.01,markBounds.max.y-markBounds.min.y)};
        shader.vertexShader='attribute float boxFillHeight;varying float boxHeightY;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nboxHeightY=boxFillHeight;');
        shader.fragmentShader='varying float boxHeightY;uniform float boxCharge,boxMin,boxHeight;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat fill=boxCharge>=.9999?1.:boxCharge<=.0001?0.:1.-smoothstep(boxCharge-.008,boxCharge+.008,boxHeightY);totalEmissiveRadiance*=fill;diffuseColor.rgb*=mix(.035,1.,fill);');
      };
      m.customProgramCacheKey=()=> 'question-box-charge-v2';
    }
    this.playing = false;
    this.open = false;
    this.duration = Math.max(...asset.animations.map((clip) => clip.duration));
  }

  raycast(raycaster) {
    const hits=raycaster.intersectObject(this.root,true).filter(h=>{for(let p=h.object;p;p=p.parent)if(!p.visible)return false;return true;});
    if(!hits.length)return null;
    let owner=hits[0].object;while(owner && owner!==this.prize)owner=owner.parent;
    return {action:owner && this.open && !this.playing && Date.now()>=this.readyAt ? 'box-prize':'box'};
  }

  play() {
    if (this.playing || (!this.open && Date.now()<this.readyAt)) return false;
    this.open = !this.open;
    this.stopAt = this.open ? 1.5 : this.duration;
    this.playing = true;
    this.actions.forEach((action) => {
      action.reset();
      action.time = this.open ? 0 : 2.0;
      action.play();
    });
    return true;
  }

  claim() {
    if(!this.open || this.playing || Date.now()<this.readyAt || !this.prize)return null;
    const position=this.prize.getWorldPosition(new THREE.Vector3());
    const scale=this.prize.getWorldScale(new THREE.Vector3());
    const quaternion=this.prize.getWorldQuaternion(new THREE.Quaternion());
    this.prize.visible=false;this.play();this.readyAt=Date.now()+300000;
    try{localStorage.setItem('capsule-box-ready-at',String(this.readyAt));}catch{}
    return {position,scale,quaternion,pokemonId:['480','481','482'][Math.floor(Math.random()*3)]};
  }

  update(dt) {
    this.charge.value=THREE.MathUtils.clamp(1-(this.readyAt-Date.now())/300000,0,1);
    if(this.prize)this.prize.visible=Date.now()>=this.readyAt;
    if (!this.playing) return;
    this.mixer.update(dt);
    if (this.actions.every((action) => action.paused || action.time >= this.stopAt)) {
      this.actions.forEach(a=>{a.paused=false;a.time=this.stopAt;});
      this.mixer.update(0);
      this.actions.forEach(a=>{a.paused=true;});
      this.playing = false;
    }
  }
}

