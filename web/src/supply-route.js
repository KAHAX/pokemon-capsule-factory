import * as THREE from 'three';

const FORWARD = new THREE.Vector3(0, 0, 1);
const ROLL_AXIS = new THREE.Vector3(1, 0, 0);

export class SupplyRoute {
  constructor(data) {
    Object.assign(this, data);
    this.samples = data.samples.map((sample) => ({
      ...sample,
      position: new THREE.Vector3().fromArray(sample.p),
      tangent: new THREE.Vector3().fromArray(sample.t),
      frame: new THREE.Quaternion(),
    }));
    this.samples[0].frame.setFromUnitVectors(FORWARD, this.samples[0].tangent);
    const delta = new THREE.Quaternion();
    for (let index = 1; index < this.samples.length; index += 1) {
      const previous = this.samples[index - 1];
      const sample = this.samples[index];
      delta.setFromUnitVectors(previous.tangent, sample.tangent);
      sample.frame.copy(previous.frame).premultiply(delta).normalize();
    }
    // The pipe clearance includes the protruding latch; the queue packs against
    // the spherical shells. Use chord distance, not arc length, through elbows.
    this.contactGap = .008;
    this.slotGap = this.shellRadius * 2 + this.contactGap;
    this.slots = [this.headS];
    for (let i = 1; i < this.capacity; i++) {
      this.slots.push(this.contactBehind(this.slots[i - 1], this.slotGap));
    }
  }

  contactBehind(leaderS, separation = this.slotGap) {
    const front = this.sample(leaderS).position;
    const sample = {};
    let near = leaderS, far = leaderS - separation;
    // Search the local trailing segment; the route has no self-crossing elbows.
    while (far > 0 && this.sample(far, sample).position.distanceTo(front) < separation) far -= separation * .25;
    for (let i = 0; i < 20; i++) {
      const middle = (near + far) * .5;
      if (this.sample(middle, sample).position.distanceTo(front) < separation) near = middle;
      else far = middle;
    }
    return far;
  }

  sample(s, out = {}) {
    const distance = THREE.MathUtils.clamp(s, 0, this.length);
    let low = 0;
    let high = this.samples.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (this.samples[middle].s <= distance) low = middle;
      else high = middle;
    }
    const from = this.samples[low];
    const to = this.samples[high];
    const alpha = from === to ? 0 : (distance - from.s) / (to.s - from.s);
    out.position = (out.position || new THREE.Vector3()).lerpVectors(from.position, to.position, alpha);
    out.tangent = (out.tangent || new THREE.Vector3()).lerpVectors(from.tangent, to.tangent, alpha).normalize();
    out.frame = (out.frame || new THREE.Quaternion()).slerpQuaternions(from.frame, to.frame, alpha);
    out.clearance = from.clearance == null || to.clearance == null ? null : Math.min(from.clearance, to.clearance);
    out.section = alpha < 0.5 ? from.section : to.section;
    return out;
  }

  pose(s, rollDistance, mesh, sample = {}) {
    this.sample(s, sample);
    mesh.position.copy(sample.position);
    mesh.quaternion.copy(sample.frame).multiply(new THREE.Quaternion().setFromAxisAngle(ROLL_AXIS, rollDistance / this.shellRadius));
  }
}

export class SupplyRouteDebug {
  constructor(scene, route) {
    this.route = route;
    this.group = new THREE.Group();
    this.group.name = 'Supply route / clearance and reserved slots';
    this.group.visible = false;
    scene.add(this.group);

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(route.samples.map((sample) => sample.position)),
      new THREE.LineBasicMaterial({ color: '#75fff1', depthTest: false, transparent: true, opacity: 0.95 }),
    );
    line.renderOrder = 20;
    this.group.add(line);

    const pipeSamples = route.samples.filter((sample) => sample.clearance != null);
    const spheres = new THREE.InstancedMesh(
      new THREE.SphereGeometry(route.ballRadius, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#5ce9d2', wireframe: true, transparent: true, opacity: 0.18, depthWrite: false }),
      Math.ceil(pipeSamples.length / 3),
    );
    const matrix = new THREE.Matrix4();
    pipeSamples.forEach((sample, index) => {
      if (index % 3) return;
      matrix.makeTranslation(sample.position.x, sample.position.y, sample.position.z);
      spheres.setMatrixAt(index / 3, matrix);
    });
    spheres.renderOrder = 19;
    this.group.add(spheres);

    route.slots.forEach((s, index) => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(route.ballRadius, 16, 12),
        new THREE.MeshBasicMaterial({ color: index === 4 ? '#ffb66e' : '#ffe691', wireframe: true, transparent: true, opacity: 0.75, depthTest: false }),
      );
      marker.position.copy(route.sample(s).position);
      marker.renderOrder = 21;
      this.group.add(marker);
    });
    const handoff = new THREE.Mesh(
      new THREE.SphereGeometry(route.ballRadius * 1.1, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#ff8f70', wireframe: true, depthTest: false }),
    );
    handoff.position.copy(route.sample(route.handoffS).position);
    handoff.renderOrder = 21;
    this.group.add(handoff);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }
}
