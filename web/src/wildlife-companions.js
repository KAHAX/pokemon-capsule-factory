import * as THREE from 'three';

const TAU = Math.PI * 2;
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pick = list => list[Math.floor(Math.random() * list.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// Native clip keys per species (matched with String.includes against the clip names).
export const SPECIES = {
  pikachu: {
    wait: '00000_defaultwait01', walk: '00030_walk01', run: '00100_run01',
    idles: ['00010_defaultidle01', '00011_defaultidle02', '00560_notice01', '00320_refresh01', '00550_glad01'],
    eat: ['00290_eat01_start', '00291_eat01_loop', '00292_eat01_end'],
    rest: ['00270_rest01_start', '00271_rest01_loop', '00272_rest01_end'],
    sleep: ['00280_sleep01_start', '00281_sleep01_loop', '00282_sleep01_end'],
    hop: ['00150_jumpup01_start', '00155_land02'],
  },
  jolteon: {
    wait: '00000_defaultwait01', walk: '00030_walk01', run: '00100_run01',
    idles: ['00010_defaultidle01', '00011_defaultidle02', '00560_notice01', '00320_refresh01'],
    eat: ['00290_eat01_start', '00291_eat01_loop', '00292_eat01_end'],
    rest: ['00270_rest01_start', '00271_rest01_loop', '00272_rest01_end'],
    sleep: ['00280_sleep01_start', '00281_sleep01_loop', '00282_sleep01_end'],
  },
  cubone: {
    wait: 'kw01_wait01', walk: 'fi20_walk01', run: 'fi21_run01',
    idles: ['kw33_moveC01', 'kw32_happyB01', 'fi01_wait01'],
    eat: ['kw50_eatA01', 'kw50_eatB01', 'kw50_eatC01'],
    sleep: ['kw20_drowseA01', 'kw20_drowseB01', 'kw20_drowseC01'],
  },
};

// A connected perimeter walk keeps every journey outside the raised machine platform
// and the background production equipment. Neighbours connect; no shortcuts through models.
export const MEADOW_PATH = [
  [-15, 5.5], [-14, 11], [-2, 13], [12, 11], [14, -3.6], [14, -18],
  [10, -35], [-29, -36], [-49, -30], [-50, -10], [-32, 5.5], [-21, 5.5],
];

// Travel between distinct places, then perform a species-specific activity.
// Never plan a succession of stationary routines at the same location.
export class WanderingCompanion {
  constructor(actor, { species, center, walkSpeed, runSpeed, startYaw = 0, delay = 0, peers = () => [] }) {
    this.actor = actor;
    this.species = species;
    this.peers = peers;
    this.clips = SPECIES[species];
    this.center = v(...center);
    this.walkSpeed = walkSpeed * 1.25;
    this.runSpeed = runSpeed;
    this.lane = { pikachu: -.65, jolteon: .65, cubone: 0 }[species];
    this.nodes = MEADOW_PATH.map(([x,z]) => v(x + this.lane, center[1], z + this.lane));
    this.node = this.nodes.reduce((best, p, i) => p.distanceToSquared(this.center) < this.nodes[best].distanceToSquared(this.center) ? i : best, 0);
    this.destination = this.node;
    this.direction = species === 'jolteon' ? -1 : 1;
    this.visits = 0;
    this.lastRoutine = '';
    this.velocity = 0;
    this.queue = [];
    this.task = { kind: 'wait', time: delay + rand(.5, 2) };
    this.target = v();
    this.offset = v();
    actor.root.position.copy(this.center);
    actor.root.rotation.y = actor.targetYaw = startYaw;
    this.has = key => actor.clips.some(clip => clip.name.includes(key));
  }

  duration(key) {
    return this.actor.clips.find(clip => clip.name.includes(key))?.duration || 1.5;
  }

  // Travel first, then a different routine at each stop. Long excursions include
  // short runs; most visits stay around the cart/front/right meadow where they are visible.
  plan() {
    const count = this.nodes.length;
    const candidates = Math.random() < .18 ? [5,6,7,8,9,10] : [0,1,2,3,4,10,11];
    let choices = candidates.filter(i => this.nodes[i].distanceTo(this.actor.root.position) > 8);
    if (!choices.length) choices = candidates.filter(i => i !== this.node);
    let destination = pick(choices);
    // A nearby friend can attract a visit, reached via the same safe perimeter path.
    const friend = this.nearestFriend(18);
    if (friend && friend.node !== this.node && Math.random() < .22) destination = friend.node;
    const clockwise = (destination - this.node + count) % count;
    const anticlockwise = (this.node - destination + count) % count;
    this.direction = clockwise <= anticlockwise ? 1 : -1;
    this.destination = destination;
    const legs = [];
    if (this.actor.root.position.distanceTo(this.nodes[this.node]) > .15) legs.push(this.node);
    let index = this.node;
    while (index !== destination) {
      index = (index + this.direction + count) % count;
      legs.push(index);
    }
    for (const node of legs) {
      const run = this.species === 'jolteon' ? Math.random() < .6 : Math.random() < .35;
      this.queue.push({kind:'turn',at:this.nodes[node].clone()}, {kind:'move',run,node});
    }
    this.queue.push({kind:'arrive',time:.1});
  }

  nearestFriend(range) {
    let nearest = null, distance = range;
    for (const other of this.peers()) {
      if (other === this) continue;
      const d = this.actor.root.position.distanceTo(other.actor.root.position);
      if (d < distance) { distance = d; nearest = other; }
    }
    return nearest;
  }

  activity() {
    this.visits++;
    const c = this.clips, steps = [];
    const once = key => { if (this.has(key)) steps.push({kind:'once',key,time:this.duration(key)}); };
    const hold = (key,time) => { if (this.has(key)) steps.push({kind:'hold',key,time}); };
    const sequence = (keys,time) => { if (!keys) return; once(keys[0]);hold(keys[1],time);once(keys[2]); };
    const friend = this.nearestFriend(9);
    if (friend) {
      steps.push({kind:'look',at:friend.actor.root.position.clone(),time:.75});
      once(this.species === 'cubone' ? 'kw32_happyB01' : (this.species === 'pikachu' ? '00550_glad01' : '00560_notice01'));
    }
    const options = this.species === 'cubone'
      ? ['explore','bone-play','happy','eat','sleep']
      : this.species === 'pikachu'
        ? ['explore','happy','hop','refresh','eat','rest','sleep']
        : ['explore','alert','hop','refresh','eat','rest','sleep'];
    const routine = pick(options.filter(key => key !== this.lastRoutine && (key !== 'sleep' || this.visits % 3 === 0)));
    this.lastRoutine = routine;
    this.actor.root.userData.routine = routine;
    if (routine === 'explore') {
      const yaw = this.actor.root.rotation.y + rand(-.9,.9);
      steps.push({kind:'look',at:this.actor.root.position.clone().add(v(Math.sin(yaw)*3,0,Math.cos(yaw)*3)),time:1});
      once(pick(c.idles));
    } else if (routine === 'bone-play') {
      once('kw33_moveC01');once('ba20_buturi01');once('kw32_happyB01');
    } else if (routine === 'happy') once(this.species === 'cubone' ? 'kw32_happyB01' : '00550_glad01');
    else if (routine === 'alert') { once('00560_notice01');once('00300_roar01'); }
    else if (routine === 'refresh') once('00320_refresh01');
    else if (routine === 'eat') sequence(c.eat,rand(2,4));
    else if (routine === 'rest') sequence(c.rest,rand(3,6));
    else if (routine === 'sleep') sequence(c.sleep,rand(4,7));
    else if (routine === 'hop') {
      once('00150_jumpup01_start');hold('00151_jumpup01_loop',.12);
      once('00152_jumpdown01_start');hold('00153_jumpdown01_loop',.12);once('00155_land02');
    }
    hold(c.wait,rand(.5,1.4));
    this.queue.push(...steps);
  }

  update(dt) {
    const actor = this.actor, task = this.task;
    actor.root.userData.activity = task.kind === 'move' ? (task.run ? 'run' : 'walk') : task.key || task.kind;
    if (task.kind === 'arrive') {
      this.velocity = 0;
      this.activity();this.next();
    } else if (task.kind === 'turn' || task.kind === 'look') {
      const desired = Math.atan2(task.at.x - actor.root.position.x, task.at.z - actor.root.position.z);
      actor.targetYaw = desired;
      actor.play(task.kind === 'look' ? this.clips.wait : this.clips.walk, .3, task.kind === 'look' ? 1 : .55);
      this.target.copy(task.at);
      task.elapsed = (task.elapsed || 0) + dt;
      if (task.kind === 'look' ? task.elapsed >= task.time : Math.abs(wrap(desired - actor.root.rotation.y)) < .25 || task.elapsed > 1.4) this.next();
    } else if (task.kind === 'move') {
      const speed = task.run ? this.runSpeed : this.walkSpeed;
      const offset = this.offset.copy(this.target).sub(actor.root.position).setY(0);
      const distance = offset.length();
      const heading = Math.atan2(offset.x,offset.z);
      const turnFactor = Math.max(.2,Math.cos(wrap(heading - actor.root.rotation.y)));
      // Ease into/out of each leg; the animation rate follows travel speed.
      this.velocity = THREE.MathUtils.damp(this.velocity, speed * Math.min(1, .2 + distance) * turnFactor, 5, dt);
      actor.play(task.run ? this.clips.run : this.clips.walk, .3, Math.max(.2,this.velocity/speed));
      const step = Math.min(distance, this.velocity * dt);
      if (distance > 1e-3) {
        actor.targetYaw = Math.atan2(offset.x, offset.z);
        actor.root.position.addScaledVector(offset.normalize(), step);
      }
      if (distance < .05) { actor.root.position.copy(this.target);this.node = task.node;this.velocity = 0;this.next(); }
    } else {
      actor.play(task.key || this.clips.wait, .35, 1, task.kind === 'once');
      if ((task.time -= dt) <= 0) this.next();
    }
    actor.update(dt);
  }

  next() {
    if (!this.queue.length) this.plan();
    this.task = this.queue.shift();
  }
}

// Rayquaza patrols the high sky in long, open, banking loops — always flying forward
// with its body stretched out (flight clips only; no coiled hovering poses).
export class SkyRayquaza {
  constructor(actor) {
    this.actor = actor;
    this.time = rand(0, 30);
    // A distant sky silhouette, roughly 500–730 units away. Preserve the original
    // skyward bearing while separating it clearly from the foreground dragons.
    this.route = new THREE.CatmullRomCurve3([
      v(13, 32, -212), v(5, 37, -227), v(-18, 41, -227), v(-46, 42, -212), v(-64, 38, -186),
      v(-64, 32, -164), v(-51, 27, -153), v(-32, 25, -157), v(-11, 25, -171), v(6, 28, -192),
    ].map(point => point.multiplyScalar(3).add(v(-65, -45, 0)).multiply(v(1, 2, 1))), true, 'centripetal');
    this.route.arcLengthDivisions = 600;
    this.route.updateArcLengths();
    this.length = this.route.getLength();
    this.speed = 14;
    this.tangent = v(); this.ahead = v(); this.point = v();
    this.bank = 0; this.pitch = 0;
    this.burst = { until: 0, next: rand(18, 30) };
    this.pivot = new THREE.Group();
    actor.root.add(this.pivot);
    this.pivot.add(actor.placement);
  }

  update(dt) {
    this.time += dt;
    const t = this.time, actor = this.actor;
    // Occasional surges of speed; otherwise a steady glide.
    if (t > this.burst.next) { this.burst.until = t + 6; this.burst.next = t + rand(26, 40); }
    const surging = t < this.burst.until;
    const speed = this.speed * (surging ? 1.7 : 1);
    this.distance = ((this.distance || rand(0, this.length)) + speed * dt) % this.length;
    const u = this.distance / this.length;
    this.route.getPointAt(u, this.point);
    this.route.getTangentAt(u, this.tangent);
    this.route.getTangentAt((u + .012) % 1, this.ahead);
    // Gentle swooping on top of the route.
    this.point.y += 2 * (Math.sin(t * .35) * 1.6 + Math.sin(t * .13 + 1.3) * 1.1);
    actor.root.position.copy(this.point);
    actor.targetYaw = Math.atan2(this.tangent.x, this.tangent.z);
    const turn = this.tangent.x * this.ahead.z - this.tangent.z * this.ahead.x;
    this.bank = THREE.MathUtils.damp(this.bank, THREE.MathUtils.clamp(-turn * 9, -.55, .55), 1.5, dt);
    this.pitch = THREE.MathUtils.damp(this.pitch, -Math.cos(t * .35) * .12 - this.tangent.y * .6, 1.5, dt);
    this.pivot.rotation.set(this.pitch, 0, this.bank, 'YXZ');
    actor.play(surging ? '20100_run01' : '20030_walk01', 1.2, surging ? 1.15 : .9);
    actor.update(dt);
  }
}
