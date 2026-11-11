import * as THREE from 'three';
import { instantiateBall } from './assets.js';
import { SupplyRoute, SupplyRouteDebug } from './supply-route.js';

export const SUPPLY_STEP = 1 / 120;
const BELT_CRUISE = 1.4;
const LIFT_CRUISE = 1.65;
const RESERVE_CRUISE = 1.2;
const ACCELERATION = 3.2;
const DECELERATION = 3.8;
const CONTACT_SKIN = 0.018;

function moveTowards(value, target, amount) {
  return value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
}

function measureBall(template) {
  const mesh = instantiateBall(template, 0.405);
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  let radius = 0;
  let shellRadius = 0;
  mesh.traverse((object) => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      radius = Math.max(radius, point.length());
      shellRadius = Math.max(shellRadius, Math.abs(point.y));
    }
  });
  return { radius, shellRadius };
}

export class FeedSupply {
  constructor({ scene, ballTemplate, routeData, onCount, onBelt, onHandoff }) {
    this.scene = scene;
    this.ballTemplate = ballTemplate;
    this.route = new SupplyRoute(routeData);
    this.metrics = measureBall(ballTemplate);
    if (this.metrics.radius > this.route.ballRadius + 0.00001) throw new Error('送料球尺寸超出已校准的管道间隙');
    this.onCount = onCount || (() => {});
    this.onBelt = onBelt || (() => {});
    this.onHandoff = onHandoff || (() => {});
    this.balls = [];
    this.nextId = 1;
    this.accumulator = 0;
    this.beltOffset = 0;
    this.beltSpeed = 0;
    this.spawnCooldown = 0;
    this.releaseRequested = false;
    this.headGateAmount = 0;
    this.headGateTarget = 0;
    this.entranceGateAmount = 0;
    this.entranceGateTarget = 0;
    this.entranceApprovedId = null;
    this.handoffs = 0;
    this.lastCount = -1;
    this.lastReady = null;
    this.maxContactCorrection = 0;
    this.gateStopS = this.route.tubeStartS - this.route.ballRadius - 0.04;
    this.debug = new SupplyRouteDebug(scene, this.route);
    this.createGates();
    [-7, -3.8, -1.6, 0.6, 2.8, 4.2].forEach((x) => this.spawn(x + 26));
    this.render(1);
    this.notifyCount();
  }

  get count() { return this.balls.reduce((total, ball) => total + Number(ball.admitted), 0); }
  get incomingCount() { return this.balls.filter((ball) => ball.admitted && ball.s < this.route.headS - 0.002).length; }
  get conveyorCount() { return this.balls.filter((ball) => !ball.admitted).length; }
  get headReady() {
    const head = this.balls.find((ball) => ball.admitted && ball.slot === 0 && !ball.releasing);
    return Boolean(
      head && !this.releaseRequested && this.headGateAmount < 0.01
      && head.s >= this.route.headS - 0.002 && Math.abs(head.v) < 0.015
    );
  }

  spawn(s) {
    const mesh = instantiateBall(this.ballTemplate, 0.405);
    mesh.name = `SupplyBall_${this.nextId}`;
    const ball = {
      id: this.nextId++, mesh, s, previousS: s, v: 0, r: this.route.ballRadius,
      rollDistance: 0, previousRoll: 0, admitted: false, slot: -1, releasing: false,
      sample: {},
    };
    mesh.userData.supplyId = ball.id;
    this.scene.add(mesh);
    this.balls.push(ball);
    this.route.pose(s, 0, mesh, ball.sample);
    return ball;
  }

  createGates() {
    const material = new THREE.MeshStandardMaterial({ color: '#c79a47', metalness: 0.78, roughness: 0.26 });
    this.headGate = new THREE.Group();
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 16), material);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), material);
    knob.position.y = 0.19;
    this.headGate.add(pin, knob);
    this.scene.add(this.headGate);
    this.headSample = this.route.sample(this.route.headS);
    this.headGate.quaternion.copy(this.headSample.frame);

    this.entranceGate = new THREE.Group();
    const flap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.045, 32), material);
    flap.rotation.x = Math.PI / 2;
    this.entranceGate.add(flap);
    this.entranceSample = this.route.sample(this.route.tubeStartS);
    this.entranceGate.position.copy(this.entranceSample.position);
    this.entranceGate.quaternion.copy(this.entranceSample.frame);
    this.scene.add(this.entranceGate);
    this.updateGates(0);
  }

  setDebug(visible) {
    this.debug.setVisible(visible);
  }

  requestRelease() {
    if (this.releaseRequested || !this.count) return false;
    this.releaseRequested = true;
    return true;
  }

  tryBeginRelease() {
    if (!this.releaseRequested || this.headGateAmount > 0.01) return;
    const head = this.balls.find((ball) => ball.admitted && ball.slot === 0 && !ball.releasing);
    if (!head || head.s < this.route.headS - 0.002 || Math.abs(head.v) >= 0.015) return;
    head.releasing = true;
    head.v = 0;
    this.headGateTarget = 1;
  }

  tryAdmission() {
    if (this.entranceApprovedId != null || this.count >= this.route.capacity) return;
    const candidate = this.balls
      .filter((ball) => !ball.admitted)
      .sort((a, b) => b.s - a.s)[0];
    if (!candidate || candidate.s < this.gateStopS - 0.003) return;
    candidate.admitted = true;
    candidate.slot = Math.max(-1, ...this.balls.filter((ball) => ball.admitted).map((ball) => ball.slot)) + 1;
    this.entranceApprovedId = candidate.id;
    this.entranceGateTarget = 1;
    this.notifyCount();
  }

  updateMotor(dt) {
    const fifth = this.balls.find((ball) => ball.admitted && ball.slot === 4);
    let target = BELT_CRUISE;
    if (this.count >= this.route.capacity) {
      target = 0;
    } else if (fifth) {
      const remaining = Math.max(0, this.route.slots[4] - fifth.s);
      const arrivalTime = remaining / Math.max(0.5, fifth.v, RESERVE_CRUISE);
      const brakingTime = this.beltSpeed / 1.8 + 0.65;
      if (arrivalTime <= brakingTime) target = 0;
    }
    this.beltSpeed = moveTowards(this.beltSpeed, target, dt * (target < this.beltSpeed ? 1.8 : 0.85));
    this.beltOffset += this.beltSpeed * dt;
  }

  driveBall(ball, dt, leader) {
    let target;
    let cruise;
    if (ball.releasing) {
      target = this.headGateAmount >= 0.98 ? this.route.handoffS : this.route.headS;
      cruise = 1.35;
    } else if (ball.admitted) {
      target = this.route.slots[ball.slot];
      const section = this.route.sample(ball.s, ball.sample).section;
      cruise = section === 'reserve' ? RESERVE_CRUISE : LIFT_CRUISE;
      if (ball.id === this.entranceApprovedId && this.entranceGateAmount < 0.98) target = Math.min(target, this.gateStopS);
    } else {
      target = this.gateStopS;
      cruise = this.beltSpeed;
    }
    if (ball.admitted && !ball.releasing && leader?.admitted) {
      target = Math.min(target, this.route.contactBehind(leader.s));
    }
    const remaining = Math.max(0, target - ball.s);
    const desired = remaining <= 0.001 ? 0 : Math.min(cruise, Math.sqrt(2 * DECELERATION * remaining));
    ball.v = moveTowards(ball.v, desired, dt * (desired < ball.v ? DECELERATION : ACCELERATION));
    const advance = Math.min(ball.v * dt, remaining);
    ball.s += advance;
    if (advance < ball.v * dt) ball.v = advance / dt;
  }

  solveContacts() {
    this.balls.sort((a, b) => b.s - a.s || a.id - b.id);
    for (let index = 1; index < this.balls.length; index += 1) {
      const leader = this.balls[index - 1];
      const ball = this.balls[index];
      const contactS = leader.admitted && ball.admitted
        ? this.route.contactBehind(leader.s)
        : leader.s - leader.r - ball.r - CONTACT_SKIN;
      if (ball.s <= contactS) continue;
      this.maxContactCorrection = Math.max(this.maxContactCorrection, ball.s - contactS);
      ball.s = contactS;
      ball.v = Math.min(ball.v, leader.v);
    }
  }

  completeHandoff(head) {
    const index = this.balls.indexOf(head);
    if (index < 0 || !head.releasing) return;
    this.balls.splice(index, 1);
    this.balls.forEach((ball) => { if (ball.admitted) ball.slot -= 1; });
    this.releaseRequested = false;
    this.headGateTarget = 0;
    this.handoffs += 1;
    head.mesh.visible = false;
    head.mesh.userData.inChamber = true;
    this.onHandoff(head.mesh, { id: head.id, radius: head.r, scale: head.mesh.scale.x });
    this.notifyCount();
  }

  step(dt) {
    this.spawnCooldown = Math.max(0, this.spawnCooldown - dt);
    this.tryBeginRelease();
    this.headGateAmount = moveTowards(this.headGateAmount, this.headGateTarget, dt * 5.5);
    this.entranceGateAmount = moveTowards(this.entranceGateAmount, this.entranceGateTarget, dt * 5.5);
    this.tryAdmission();
    this.updateMotor(dt);
    this.balls.sort((a, b) => b.s - a.s || a.id - b.id);
    this.balls.forEach((ball, index) => {
      ball.previousS = ball.s;
      ball.previousRoll = ball.rollDistance;
      this.driveBall(ball, dt, this.balls[index - 1]);
    });
    this.solveContacts();
    this.balls.forEach((ball) => {
      const advance = Math.max(0, ball.s - ball.previousS);
      ball.rollDistance += advance;
      ball.v = Math.min(ball.v, advance / dt);
    });

    const approved = this.balls.find((ball) => ball.id === this.entranceApprovedId);
    if (approved && approved.s >= this.route.tubeStartS + approved.r * 2 + CONTACT_SKIN) {
      this.entranceApprovedId = null;
      this.entranceGateTarget = 0;
    }
    const head = this.balls.find((ball) => ball.releasing);
    if (head && head.s >= this.route.handoffS - 0.0001) this.completeHandoff(head);

    if (this.conveyorCount < 6 && this.spawnCooldown <= 0) {
      const tail = this.balls.filter((ball) => !ball.admitted).sort((a, b) => a.s - b.s)[0];
      const s = tail ? Math.min(0, tail.s - tail.r * 2 - 0.5) : 0;
      this.spawn(s);
      this.spawnCooldown = 1.2;
    }
    this.notifyCount();
  }

  update(dt) {
    this.accumulator += Math.min(Math.max(dt, 0), 1);
    while (this.accumulator >= SUPPLY_STEP) {
      this.step(SUPPLY_STEP);
      this.accumulator -= SUPPLY_STEP;
    }
    this.render(this.accumulator / SUPPLY_STEP);
    this.updateGates(dt);
    this.onBelt(this.beltOffset, this.beltSpeed);
  }

  updateGates() {
    this.headGate.position.copy(this.headSample.position)
      .add(new THREE.Vector3(0, 1, 0).applyQuaternion(this.headSample.frame)
        .multiplyScalar(this.route.ballRadius * 0.88 + this.headGateAmount * 0.7));
    this.entranceGate.quaternion.copy(this.entranceSample.frame)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.entranceGateAmount * 1.5));
  }

  render(alpha) {
    this.balls.forEach((ball) => {
      const s = THREE.MathUtils.lerp(ball.previousS, ball.s, alpha);
      const roll = THREE.MathUtils.lerp(ball.previousRoll, ball.rollDistance, alpha);
      this.route.pose(s, roll, ball.mesh, ball.sample);
    });
  }

  notifyCount() {
    const ready = this.headReady;
    if (this.count === this.lastCount && ready === this.lastReady) return;
    this.lastCount = this.count;
    this.lastReady = ready;
    this.onCount(this.count, this.count >= this.route.capacity, this);
  }

  inspect() {
    let minimumPairDistance = Infinity;
    const ordered = [...this.balls].sort((a, b) => b.s - a.s);
    for (let index = 1; index < ordered.length; index += 1) {
      minimumPairDistance = Math.min(minimumPairDistance, ordered[index - 1].mesh.position.distanceTo(ordered[index].mesh.position));
    }
    return {
      count: this.count, incoming: this.incomingCount, conveyor: this.conveyorCount,
      headReady: this.headReady, releaseRequested: this.releaseRequested, handoffs: this.handoffs,
      beltSpeed: this.beltSpeed, minimumPairDistance, maxContactCorrection: this.maxContactCorrection,
      balls: this.balls.map((ball) => ({
        id: ball.id, s: ball.s, v: ball.v, slot: ball.slot, admitted: ball.admitted,
        releasing: ball.releasing, position: ball.mesh.position.toArray(),
      })),
    };
  }
}
