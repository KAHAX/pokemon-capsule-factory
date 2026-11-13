import * as THREE from 'three';
import { findByKey } from './assets.js';
import { OutletCurtain } from './outlet-curtain.js';

export class OutputAnimator {
  constructor(scene, asset) {
    this.scene = scene;
    this.asset = asset;
    this.active = [];
    this.curtain = new OutletCurtain(scene);
  }

  play(index, onComplete, { lead = 0, onApproach, onExit } = {}) {
    const name = `OutputBall_0${index + 1}`;
    const source = findByKey(this.asset.scene, name);
    const clip = this.asset.animations.find((animation) => animation.name === name)
      || this.asset.animations.find((animation) => animation.name.includes(name));
    if (!source || !clip) throw new Error(`Missing baked output animation: ${name}`);
    const mesh = source.clone(true);
    mesh.traverse((object) => {
      if (object.name.toLowerCase().startsWith('standard_lidpivot')) object.name = 'standard_LidPivot';
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.scene.add(mesh);
    const mixer = new THREE.AnimationMixer(mesh);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = 1.65;
    action.play();
    mixer.update(0);
    // Each of the three baked takes has a different hidden lead-in. Derive the
    // cues from the actual path through the curtain instead of a fixed timer.
    const track = clip.tracks.find(track => track.name.endsWith('.position'));
    // Takes 2 and 3 contain long stationary lead-ins from the original bake.
    // Begin immediately before the first falling motion, retaining the path.
    let startTime=0;
    if(track)for(let i=1;i<track.times.length;i++){
      const distance=Math.hypot(...[0,1,2].map(k=>track.values[i*3+k]-track.values[k]));
      if(distance>.003){startTime=track.times[Math.max(0,i-1)];break;}
    }
    action.time=startTime;mixer.update(0);
    const crossing = z => {
      if (!track) return 0;
      for (let i = 1; i < track.times.length; i++) {
        const a = track.values[(i-1)*3+2], b = track.values[i*3+2];
        if (a < z && b >= z) return Math.max(0,(THREE.MathUtils.lerp(track.times[i-1],track.times[i],(z-a)/(b-a))-startTime)/action.timeScale);
      }
      return 0;
    };
    const mouthZ = this.curtain.flaps[0]?.pivot.position.z ?? 1.375;
    const approach = crossing(mouthZ - .405), exit = crossing(mouthZ + .405 + .04);
    const hold = Math.max(0, lead - approach);
    this.active.push({ mesh, mixer, action, onComplete, elapsed: 0, hold,
      approachAt: hold + approach - lead, exitAt: hold + exit,
      onApproach, onExit, approachFired: false, exitFired: false });
    return mesh;
  }

  update(dt) {
    // Resolve ball/hinge contact at 120 Hz, including on slow rendering frames.
    const steps = Math.max(1, Math.ceil(Math.min(dt, .5) * 120));
    const step = Math.min(dt, .5) / steps;
    for (let i = 0; i < steps; i++) {
      for (const item of this.active) {
        const previous = item.elapsed;
        item.elapsed += step;
        if (!item.approachFired && item.elapsed >= item.approachAt) {
          item.approachFired = true; item.onApproach?.();
        }
        const advance = Math.max(0,item.elapsed-item.hold)-Math.max(0,previous-item.hold);
        if (advance > 0) item.mixer.update(advance);
        if (!item.exitFired && item.elapsed >= item.exitAt) {
          item.exitFired = true; item.onExit?.();
        }
      }
      this.curtain.update(step || 1 / 120, this.active.map(item => item.mesh));
    }
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const item = this.active[index];
      if (item.action.paused) {
        this.active.splice(index, 1);
        item.onComplete(item.mesh);
      }
    }
  }
}
