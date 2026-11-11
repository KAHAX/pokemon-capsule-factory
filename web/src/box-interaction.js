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
    scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = asset.animations.map((clip) => {
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      return action;
    });
    this.playing = false;
    this.open = false;
    this.duration = Math.max(...asset.animations.map((clip) => clip.duration));
  }

  raycast(raycaster) {
    return raycaster.intersectObject(this.root, true).length ? { action: 'box' } : null;
  }

  play() {
    if (this.playing) return false;
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

  update(dt) {
    if (!this.playing) return;
    this.mixer.update(dt);
    if (this.actions.every((action) => action.paused || action.time >= this.stopAt)) {
      this.mixer.setTime(this.stopAt);
      this.playing = false;
    }
  }
}
