import * as THREE from 'three';
import { RaikouLightning } from './raikou-lightning.js';

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

export class RaikouCompanion {
  constructor(actor, pillar = null) {
    this.actor = actor;
    this.pillar = pillar;
    this.time = 0;
    const ground = -.69;
    const start = v(-3, ground, -18), rest = v(2, ground, -25);
    this.routes = [
      new THREE.CatmullRomCurve3([start, v(1, ground, -19), v(4, ground, -22), rest]),
      new THREE.CatmullRomCurve3([rest, v(-3, ground, -27), v(-6, ground, -23), start]),
    ];
    this.routes.forEach(route => { route.arcLengthDivisions = 240; route.updateArcLengths(); });
    this.tangent = v();
    this.lightning = new RaikouLightning(actor, pillar);
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
    if (pillar) {
      // Approach from the open clearing, keeping the large body away from the
      // conveyor and leaving a gap between its head and the charging cabinet.
      // Stand a few paces back, so the charging bolt is a long, clearly visible arc.
      const stop = pillar.position.clone().add(v(9.4, 0, .9)); stop.y = ground;
      const outbound = new THREE.CatmullRomCurve3([start, v(-7, ground, -19), v(-10.5, ground, -17.5), stop]);
      const home = new THREE.CatmullRomCurve3([stop, v(-11.5, ground, -12), v(-7, ground, -13), start]);
      for (const route of [outbound, home]) { route.arcLengthDivisions = 240; route.updateArcLengths(); this.routes.push(route); }
      this.stages.push(
        { duration: 1.2, clip: 'defaultidle01', once: true },
        { duration: travelTime(outbound), route: 2, task: 'approach-charger' },
        { duration: 1.4, clip: 'defaultwait01', faceCharger: true },
        { duration: this.duration('rangeattack02_start'), clip: 'rangeattack02_start', once: true, faceCharger: true },
        { duration: 6.5, clip: 'rangeattack02_loop', electric: true, charging: true, faceCharger: true },
        { duration: this.duration('rangeattack02_end'), clip: 'rangeattack02_end', once: true, faceCharger: true },
        { duration: 2, clip: 'defaultwait01', faceCharger: true },
        { duration: travelTime(home), route: 3, task: 'leave-charger' },
        { duration: 7, clip: 'defaultwait01' },
      );
    }
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
      if (stage.faceCharger) actor.targetYaw = Math.atan2(this.pillar.position.x - actor.root.position.x, this.pillar.position.z - actor.root.position.z);
      else if (stage.clip === 'defaultwait01') actor.targetYaw += Math.sin(this.time * .6) * dt * .025;
    }
    actor.update(dt);
    const envelope = stage.electric ? smooth(clamp(elapsed / .35, 0, 1)) * smooth(clamp((stage.duration - elapsed) / .45, 0, 1)) : 0;
    const pulse = .28 + .72 * Math.pow(Math.max(0, Math.sin(this.time * 17)), 2);
    const charging = stage.charging ? envelope : 0;
    // While charging, most of the energy flows down the link; the body crackles more quietly.
    this.lightning.update(this.time, envelope * pulse * (stage.charging ? .55 : 1), charging);
    this.pillar?.userData.setCharge(charging, dt);
    actor.root.userData.activity = stage.charging ? 'charging-pillar' : stage.task || (stage.route !== undefined ? 'patrol' : stage.clip);
  }
}
