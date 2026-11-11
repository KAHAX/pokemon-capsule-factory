import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const BALL_RADIUS = 0.38;
export const GLOBE_CENTER = new THREE.Vector3(0, 6.15, 0);

let initialization;
export function initializePhysics() {
  if (!initialization) initialization = RAPIER.init().then(() => RAPIER);
  return initialization;
}

export class CapsulePhysics {
  constructor(rapier) {
    this.R = rapier;
    this.world = new rapier.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.world.numSolverIterations = 16;
    this.accumulator = 0;
    this.balls = new Map();
    this.hatchOpen = false;
    this.events = [];
    this.createGlobe();
    this.createChuteAndTray();
  }

  createGlobe() {
    this.setHatch(false);
  }

  constrainGlobe() {
    this.balls.forEach(({ body, kind }) => {
      if (kind !== 'globe') return;
      const position = body.translation();
      const dx = position.x - GLOBE_CENTER.x;
      const dy = position.y - GLOBE_CENTER.y;
      const dz = position.z - GLOBE_CENTER.z;
      const distance = Math.hypot(dx, dy, dz) || 0.0001;
      const atOpenHatch = this.hatchOpen && position.y < 5.1 && Math.hypot(dx, dz) < 1.0;
      if (atOpenHatch || distance <= 1.54) return;
      const nx = dx / distance;
      const ny = dy / distance;
      const nz = dz / distance;
      body.setTranslation({ x: GLOBE_CENTER.x + nx * 1.54, y: GLOBE_CENTER.y + ny * 1.54, z: GLOBE_CENTER.z + nz * 1.54 }, true);
      const velocity = body.linvel();
      const outward = velocity.x * nx + velocity.y * ny + velocity.z * nz;
      if (outward > 0) {
        body.setLinvel({ x: velocity.x - nx * outward * 1.16, y: velocity.y - ny * outward * 1.16, z: velocity.z - nz * outward * 1.16 }, true);
      }
    });
  }

  constrainOutput() {
    this.balls.forEach(({ body, kind }) => {
      if (kind !== 'output') return;
      const position = body.translation();
      const velocity = body.linvel();
      let { x, y, z } = position;
      if (z > 2.05 && y < 1.08) {
        y = 1.08;
        if (velocity.y < 0) velocity.y = -velocity.y * 0.12;
      }
      if (Math.abs(x) > 0.68) {
        x = Math.sign(x) * 0.68;
        velocity.x = -velocity.x * 0.25;
      }
      if (z > 3.12) {
        z = 3.12;
        velocity.z = -Math.abs(velocity.z) * 0.2;
      }
      if (x !== position.x || y !== position.y || z !== position.z) body.setTranslation({ x, y, z }, true);
      body.setLinvel(velocity, true);
    });
  }

  createChuteAndTray() {
    this.addRamp(new THREE.Vector3(0, 3.8, 0), new THREE.Vector3(0, 1.45, 1.65), 0.62);
    this.addRamp(new THREE.Vector3(0, 1.45, 1.65), new THREE.Vector3(0, 0.78, 3.05), 0.72);
    this.world.createCollider(this.R.ColliderDesc.cuboid(1.05, 0.08, 0.72).setTranslation(0, 0.62, 2.85).setFriction(0.72));
    this.world.createCollider(this.R.ColliderDesc.cuboid(1.05, 0.48, 0.07).setTranslation(0, 1.05, 3.52).setFriction(0.5));
    this.world.createCollider(this.R.ColliderDesc.cuboid(0.07, 0.38, 0.72).setTranslation(-1.05, 0.97, 2.85));
    this.world.createCollider(this.R.ColliderDesc.cuboid(0.07, 0.38, 0.72).setTranslation(1.05, 0.97, 2.85));
  }

  addRamp(start, end, halfWidth) {
    const direction = end.clone().sub(start);
    const center = start.clone().add(end).multiplyScalar(0.5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize());
    this.world.createCollider(
      this.R.ColliderDesc.cuboid(halfWidth, 0.055, direction.length() * 0.5)
        .setTranslation(center.x, center.y, center.z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
        .setFriction(0.58)
        .setRestitution(0.08),
    );
    [-1, 1].forEach((side) => {
      this.world.createCollider(
        this.R.ColliderDesc.cuboid(0.045, 0.24, direction.length() * 0.5)
          .setTranslation(center.x + side * halfWidth, center.y + 0.2, center.z)
          .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
          .setFriction(0.42),
      );
    });
  }

  setHatch(open) {
    if (this.hatchOpen === open) return;
    this.hatchOpen = open;
    if (open) this.releaseAvailable = true;
    if (open && this.hatchCollider) {
      this.world.removeCollider(this.hatchCollider, true);
      this.hatchCollider = null;
    }
    if (!open && !this.hatchCollider) {
      this.hatchCollider = this.world.createCollider(
        this.R.ColliderDesc.cylinder(0.06, 0.47).setTranslation(0, 4.31, 0).setFriction(0.64).setRestitution(0.1),
      );
    }
    if (open) {
      let candidate;
      this.balls.forEach((item) => {
        if (item.kind === 'globe' && (!candidate || item.body.translation().y < candidate.body.translation().y)) candidate = item;
      });
      if (candidate) {
        const position = candidate.body.translation();
        candidate.body.setLinvel({ x: -position.x * 1.5, y: -1.4, z: -position.z * 1.5 }, true);
      }
    }
  }

  addBall(mesh, kind = 'globe') {
    const position = mesh.position;
    const rotation = mesh.quaternion;
    const bodyDesc = this.R.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
      .setLinearDamping(0.2)
      .setAngularDamping(0.42)
      .setAdditionalSolverIterations(8)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);
    const collider = this.R.ColliderDesc.ball(BALL_RADIUS)
      .setContactSkin(0.075)
      .setDensity(1.1)
      .setFriction(0.62)
      .setRestitution(0.2);
    this.world.createCollider(collider, body);
    this.balls.set(mesh, { body, kind });
    mesh.userData.physicsKind = kind;
    return body;
  }

  removeBall(mesh) {
    const item = this.balls.get(mesh);
    if (!item) return;
    this.world.removeRigidBody(item.body);
    this.balls.delete(mesh);
  }

  agitate(amount = 1) {
    this.balls.forEach(({ body, kind }) => {
      if (kind !== 'globe') return;
      const position = body.translation();
      const radial = Math.hypot(position.x, position.z) || 1;
      const impulse = 0.018 * amount;
      body.applyImpulse({
        x: (-position.z / radial) * impulse + (Math.random() - 0.5) * impulse,
        y: (0.006 + Math.random() * 0.012) * amount,
        z: (position.x / radial) * impulse + (Math.random() - 0.5) * impulse,
      }, true);
      body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 0.01 * amount, y: (Math.random() - 0.5) * 0.008 * amount, z: (Math.random() - 0.5) * 0.01 * amount }, true);
    });
  }

  step(dt) {
    this.accumulator += Math.min(dt, 0.12);
    let steps = 0;
    while (this.accumulator >= 1 / 60 && steps < 8) {
      this.balls.forEach(({ body, kind }) => {
        if (kind === 'chute') body.applyImpulse({ x: 0, y: 0, z: 0.025 }, true);
      });
      this.world.step();
      this.constrainGlobe();
      this.constrainOutput();
      this.accumulator -= 1 / 60;
      steps += 1;
    }
    this.balls.forEach((item, mesh) => {
      const position = item.body.translation();
      const rotation = item.body.rotation();
      mesh.position.set(position.x, position.y, position.z);
      mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      if (item.kind === 'globe' && this.hatchOpen && this.releaseAvailable && position.y < 3.82 && Math.abs(position.x) < 0.7 && Math.abs(position.z) < 0.7) {
        this.releaseAvailable = false;
        item.kind = 'chute';
        mesh.userData.physicsKind = 'chute';
        this.events.push({ type: 'chute', mesh });
        this.setHatch(false);
      }
      if (item.kind === 'chute' && position.z > 2.2) {
        item.kind = 'output';
        mesh.userData.physicsKind = 'output';
        this.events.push({ type: 'output', mesh });
      }
    });
    const events = this.events;
    this.events = [];
    return events;
  }

  drainEvents(dt) {
    return this.step(dt);
  }
}
