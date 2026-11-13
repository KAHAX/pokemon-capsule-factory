import * as THREE from 'three';

export class ChamberOneShot {
  constructor(scene, asset) {
    this.scene = scene;
    this.root = asset.scene;
    this.scene.add(this.root);
    this.exitBall = this.root.getObjectByName('SIM_Ball_13');
    this.incomingRoot = this.root.getObjectByName('SIM_Incoming_Ball');
    this.incomingBaseScale = this.incomingRoot.scale.x;
    this.duration = Math.max(...asset.animations.map((clip) => clip.duration));
    this.incomingClip = asset.animations.find((clip) => clip.name === 'Capsule_OneShot__SIM_Incoming_Ball');
    const chamberClips = asset.animations.filter((clip) => clip !== this.incomingClip);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = chamberClips.map((clip) => this.mixer.clipAction(clip));
    this.actions.forEach((action) => {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    });
    this.mixer.update(0);
    this.actions.forEach((action) => action.stop());
    this.root.traverse((object) => {
      if (object.isMesh) object.castShadow = false;
    });

    this.incomingMixer = new THREE.AnimationMixer(this.incomingRoot);
    this.incomingAction = this.incomingMixer.clipAction(this.incomingClip);
    this.incomingAction.setLoop(THREE.LoopOnce, 1);
    this.incomingAction.clampWhenFinished = true;
    this.incomingHandoffTime = this.findIncomingHandoffTime();
    this.incomingRoot.visible = false;
    this.playing = false;
    this.outputFired = false;
    this.elapsed = 0;
    // The baked chamber balls finish their tumble at 5 s. The incoming ball's
    // later 7.15 s handoff is an independent replenishment cue.
    this.settleTime = 5;
    this.incomingPrepared = false;
    this.incomingStarted = false;
    this.incomingComplete = false;
  }

  findIncomingHandoffTime() {
    this.incomingAction.play();
    let time = 7.15;
    for (; time < this.duration; time += 1 / 240) {
      this.incomingAction.time = time;
      this.incomingMixer.update(0);
      if (this.incomingRoot.position.y <= 9.02) break;
    }
    this.incomingAction.stop();
    return time;
  }

  start({ onOutput, onComplete }) {
    this.incomingBall?.removeFromParent();
    this.incomingBall = null;
    this.incomingMixer.stopAllAction();
    this.incomingRoot.visible = false;
    this.incomingPrepared = false;
    this.incomingStarted = false;
    this.incomingComplete = false;
    this.playing = true;
    this.outputFired = false;
    this.elapsed = 0;
    this.onOutput = onOutput;
    this.onComplete = onComplete;
    this.actions.forEach((action) => {
      action.reset();
      action.play();
    });
  }

  prepareIncoming(mesh) {
    if (!this.playing || this.incomingPrepared) return false;
    this.incomingAction.reset();
    this.incomingAction.time = this.incomingHandoffTime;
    this.incomingAction.play();
    this.incomingMixer.update(0);
    mesh.updateWorldMatrix(true, true);
    this.incomingRoot.updateWorldMatrix(true, true);
    this.incomingRoot.children.forEach((child) => { child.visible = false; });
    this.incomingRoot.attach(mesh);
    this.incomingScale = mesh.scale.x;
    mesh.visible = true;
    this.incomingBall = mesh;
    this.incomingPrepared = true;
    this.incomingStarted = false;
    this.incomingComplete = false;
    this.incomingRoot.visible = false;
    this.syncIncomingScale();
    if (this.elapsed >= this.incomingHandoffTime) this.startIncoming();
    return true;
  }

  startIncoming() {
    if (!this.incomingPrepared || this.incomingStarted) return;
    this.incomingStarted = true;
    this.incomingStartedAt = this.elapsed;
    this.lastIncomingElapsed = 0;
    this.incomingRoot.visible = true;
  }

  syncIncomingScale() {
    if (!this.incomingBall) return;
    const scale = this.incomingScale * this.incomingBaseScale / this.incomingRoot.scale.x;
    this.incomingBall.scale.setScalar(scale);
  }

  update(dt) {
    if (!this.playing) return;
    this.elapsed += dt;
    this.mixer.update(dt);
    this.exitBall.visible = !this.outputFired && this.exitBall.position.y >= 4.15;
    if (!this.outputFired && this.elapsed >= this.settleTime) {
      this.outputFired = true;
      this.exitBall.visible = false;
      this.onOutput();
    }
    if (this.incomingPrepared && !this.incomingStarted && this.elapsed >= this.incomingHandoffTime) this.startIncoming();
    if (this.incomingStarted) {
      const elapsed = this.elapsed - this.incomingStartedAt;
      this.incomingMixer.update(Math.max(0, elapsed - this.lastIncomingElapsed));
      this.lastIncomingElapsed = elapsed;
      this.incomingComplete = this.incomingAction.paused;
    }
    this.syncIncomingScale();
    if (this.elapsed >= this.duration && this.incomingComplete) {
      this.playing = false;
      this.onComplete();
    }
  }
}
