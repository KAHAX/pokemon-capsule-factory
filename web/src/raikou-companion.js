import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = t => t * t * (3 - 2 * t);

// The imported rig is Z-up internally: its local Y is forward, not height.
// Strip only the locomotion root translation; paws/back/mane retain their motion.
export function prepareRaikou(asset) {
  asset.animations = asset.animations.map(source => {
    const clip = source.clone();
    if (/walk01|run01/.test(clip.name)) for (const track of clip.tracks) {
      if (track.name !== 'origin.position') continue;
      for (let i = 3; i < track.values.length; i++) track.values[i] = track.values[i % 3];
    }
    return clip;
  });
  return asset;
}

class RaikouDischarge {
  constructor(actor) {
    this.actor = actor;
    this.group = new THREE.Group();
    this.group.name = 'Raikou / brief branching electrical discharge';
    this.group.scale.setScalar(actor.size / 3.9);
    actor.root.add(this.group);
    this.positions = new Float32Array(480 * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.LineBasicMaterial({ color: new THREE.Color(4, 3.1, .85), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
    this.light = new THREE.PointLight('#ffdc78', 0, 8, 2);
    this.light.position.set(0, 2.5, .3);
    this.group.add(this.light);
    this.a = v(); this.b = v();
  }
  update(time, strength) {
    this.group.visible = strength > .001;
    if (!this.group.visible) { this.light.intensity = 0; return; }
    const tick = Math.floor(time * 24);
    const noise = n => { const s = Math.sin(n * 127.1 + tick * 311.7) * 43758.5453; return s - Math.floor(s); };
    let count = 0;
    const line = (a, b) => { for (const p of [a, b]) { this.positions[count++] = p.x; this.positions[count++] = p.y; this.positions[count++] = p.z; } };
    for (let arc = 0; arc < 7; arc++) {
      const angle = arc * Math.PI * 2 / 7 + .22 * Math.sin(tick);
      const start = v(Math.cos(angle) * .65, 2.7 + noise(arc) * .6, Math.sin(angle) * .9);
      const end = v(Math.cos(angle) * (1.9 + noise(arc + 10)), .12 + noise(arc + 20) * 1.6, Math.sin(angle) * 2.8);
      this.a.copy(start);
      for (let i = 1; i <= 10; i++) {
        const u = i / 10, jitter = Math.sin(Math.PI * u) * .4;
        this.b.lerpVectors(start, end, u);
        this.b.x += (noise(arc * 61 + i) - .5) * jitter;
        this.b.y += (noise(arc * 71 + i) - .5) * jitter;
        this.b.z += (noise(arc * 83 + i) - .5) * jitter;
        line(this.a, this.b);
        if (i === 5 || i === 8) line(this.b, this.b.clone().add(v((noise(i + arc) - .5) * .7, .25, .3)));
        this.a.copy(this.b);
      }
    }
    this.geometry.setDrawRange(0, count / 3);
    this.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = strength;
    this.light.intensity = strength * 9;
  }
}

export class RaikouCompanion {
  constructor(actor) {
    this.actor = actor;
    this.time = 0;
    const ground = -.69;
    const start = v(-3, ground, -18), rest = v(2, ground, -25);
    this.routes = [
      new THREE.CatmullRomCurve3([start, v(1, ground, -19), v(4, ground, -22), rest]),
      new THREE.CatmullRomCurve3([rest, v(-3, ground, -27), v(-6, ground, -23), start]),
    ];
    this.routes.forEach(route => { route.arcLengthDivisions = 240; route.updateArcLengths(); });
    this.tangent = v();
    this.sparks = new RaikouDischarge(actor);
    actor.root.position.copy(start);
    actor.root.rotation.y = actor.targetYaw = Math.atan2(4, -1);
    this.duration = key => actor.clips.find(c => c.name.includes(key)).duration;
    // Keep the original gait near normal speed even after resizing the animal.
    // Derive travel time from its enlarged stride, instead of slowing the clip
    // down to fill a fixed 14/16-second route.
    this.walkEdge = .08;
    this.walkSpeed = 2.25 * actor.placement.scale.x / this.duration('walk01');
    const travelTime = route => route.getLength() / (this.walkSpeed * 1.15 * (1 - this.walkEdge));
    this.stages = [
      { duration: travelTime(this.routes[0]), route: 0 },
      { duration: 2.5, clip: 'defaultwait01' },
      { duration: this.duration('sleep01_start'), clip: 'sleep01_start', once: true },
      { duration: 8, clip: 'sleep01_loop' },
      { duration: this.duration('sleep01_end'), clip: 'sleep01_end', once: true },
      { duration: 2, clip: 'defaultwait01' },
      { duration: travelTime(this.routes[1]), route: 1 },
      { duration: 1.8, clip: 'defaultwait01' },
      { duration: this.duration('rangeattack02_start'), clip: 'rangeattack02_start', once: true },
      { duration: 2.6, clip: 'rangeattack02_loop', electric: true },
      { duration: this.duration('rangeattack02_end'), clip: 'rangeattack02_end', once: true },
      { duration: 4, clip: 'defaultwait01' },
    ];
    this.cycle = this.stages.reduce((sum, stage) => sum + stage.duration, 0);
  }
  update(dt) {
    this.time += dt;
    let elapsed = this.time % this.cycle, index = 0;
    while (elapsed >= this.stages[index].duration) elapsed -= this.stages[index++].duration;
    const stage = this.stages[index], actor = this.actor;
    if (stage.route !== undefined) {
      const u = elapsed / stage.duration;
      // Ease acceleration only near the ends; keep most of the walk at an even pace.
      const edge = this.walkEdge;
      const integral = x => x < edge ? x * x / (2 * edge) : x > 1 - edge ? 1 - edge - (1 - x) * (1 - x) / (2 * edge) : x - edge / 2;
      const progress = integral(u) / (1 - edge);
      const speed = Math.min(1, u / edge, (1 - u) / edge) / (1 - edge);
      const route = this.routes[stage.route];
      route.getPointAt(progress, actor.root.position);
      route.getTangentAt(progress, this.tangent);
      actor.targetYaw = Math.atan2(this.tangent.x, this.tangent.z);
      // Source gait moves 2.25 model units per 3.033 s; match foot speed to route speed.
      const gaitSpeed = route.getLength() / stage.duration * speed / this.walkSpeed;
      actor.play('walk01', .28, Math.max(.12, gaitSpeed));
    } else {
      actor.play(stage.clip, .35, 1, !!stage.once);
      if (stage.clip === 'defaultwait01') actor.targetYaw += Math.sin(this.time * .6) * dt * .025;
    }
    actor.update(dt);
    const envelope = stage.electric ? smooth(clamp(elapsed / .35, 0, 1)) * smooth(clamp((stage.duration - elapsed) / .45, 0, 1)) : 0;
    const pulse = .28 + .72 * Math.pow(Math.max(0, Math.sin(this.time * 17)), 2);
    this.sparks.update(this.time, envelope * pulse);
  }
}
