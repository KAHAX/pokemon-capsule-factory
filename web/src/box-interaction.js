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

