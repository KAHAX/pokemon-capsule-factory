import * as THREE from 'three';

export function uprightBallQuaternion(camera, pitch = 0.32, yaw = 0, target = new THREE.Quaternion()) {
  return target.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'XYZ')));
}

export class BallDragControls {
  constructor(camera, getGroup) {
    this.camera = camera;
    this.getGroup = getGroup;
    this.dragging = false;
    this.velocity = new THREE.Vector2();
    this.angles = new THREE.Vector2();
    this.target = new THREE.Vector2();
    this.orientation = new THREE.Quaternion();
    this.euler = new THREE.Euler(0, 0, 0, 'XYZ');
    this.pitchLimit = THREE.MathUtils.degToRad(38);
  }

  align() {
    this.reset();
    this.angles.set(0, 0.32);
    this.target.copy(this.angles);
    this.applyOrientation();
  }

  applyOrientation() {
    const group = this.getGroup();
    if (!group) return;
    // Reconstruct camera-relative pitch/yaw to prevent accumulated trackball roll.
    this.euler.set(this.angles.y, this.angles.x, 0, 'XYZ');
    this.orientation.setFromEuler(this.euler);
    group.quaternion.copy(this.camera.quaternion).multiply(this.orientation);
  }

  pointerDown(event) {
    if (!this.getGroup() || (event.button !== undefined && event.button !== 0)) return;
    this.dragging = true;
    this.pointerId = event.pointerId;
    this.velocity.set(0, 0);
    this.last = { x: event.clientX, y: event.clientY, time: performance.now() };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  rotate(yaw, pitch) {
    this.target.x += yaw;
    const wantedPitch = this.target.y + pitch;
    this.target.y = THREE.MathUtils.clamp(wantedPitch, -this.pitchLimit, this.pitchLimit);
    if (wantedPitch !== this.target.y) this.velocity.y = 0;
  }

  pointerMove(event) {
    if (!this.dragging || event.pointerId !== this.pointerId) return;
    const now = performance.now();
    const dt = Math.max((now - this.last.time) / 1000, 1 / 240);
    const yaw = (event.clientX - this.last.x) * 0.005;
    const pitch = (event.clientY - this.last.y) * 0.004;
    const blend = 1 - Math.exp(-dt * 22);
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, THREE.MathUtils.clamp(yaw / dt, -4, 4), blend);
    this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, THREE.MathUtils.clamp(pitch / dt, -2.5, 2.5), blend);
    this.rotate(yaw, pitch);
    this.last = { x: event.clientX, y: event.clientY, time: now };
  }

  pointerUp(event) {
    if (event.pointerId !== this.pointerId) return;
    this.dragging = false;
    if (this.last && performance.now() - this.last.time > 90) this.velocity.set(0, 0);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  reset() {
    this.dragging = false;
    this.pointerId = null;
    this.velocity.set(0, 0);
    this.target.copy(this.angles);
  }

  update(dt, enabled) {
    if (!enabled || !this.getGroup()) return;
    dt = Math.min(dt, 0.05);
    if (!this.dragging) {
      const decay = Math.exp(-dt * 4.5);
      const travel = (1 - decay) / 4.5;
      this.rotate(this.velocity.x * travel, this.velocity.y * travel);
      this.velocity.multiplyScalar(decay);
      if (this.velocity.length() < 0.005) this.velocity.set(0, 0);
    }
    this.angles.lerp(this.target, 1 - Math.exp(-dt * 24));
    this.applyOrientation();
  }
}
