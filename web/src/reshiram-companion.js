import { LegendaryEnergy } from './legendary-energy.js';
import * as THREE from 'three';

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = t => t * t * (3 - 2 * t);
const clamp = THREE.MathUtils.clamp;

export function prepareLegendary(asset) {
  return prepareReshiram(asset);
}

export function prepareReshiram(asset) {
  // The exported rig is Y-up. Keep the native body/feet motion, but let our
  // ground path own the root's X/Z translation so each gait loop stays in place.
  asset.animations = asset.animations.map(source => {
    const clip = source.clone();
    if (clip.name.includes('_00030_walk01')) for (const track of clip.tracks) {
      if (track.name !== 'origin.position') continue;
      for (let i = 3; i < track.values.length; i += 3) {
        track.values[i] = track.values[0];
        track.values[i + 2] = track.values[2];
      }
    }
    return clip;
  });
  return asset;
}

// Separate clearings: Zekrom lives to the left of Reshiram, and flies farther left.
const G = -.69;
export const RESHIRAM_LAYOUT = {
  a: [-9, G, -49], b: [-16, G, -59],
  outward: [[-5, G, -52], [-8, G, -59]],
  home: [[-22, G, -56], [-19, G, -49]],
  ascent: [[-18, 3, -62], [-20, 13, -67], [-17, 29, -70]],
  sky: [[-17, 29, -70], [-5, 39, -72], [9, 43, -65], [12, 37, -53], [2, 28, -48]],
  descent: [[-6, 19, -48], [-15, 8, -53], [-17, 2, -57]],
};
export const ZEKROM_LAYOUT = {
  a: [-41, G, -50], b: [-48, G, -60],
  outward: [[-37, G, -54], [-40, G, -61]],
  home: [[-54, G, -57], [-51, G, -50]],
  ascent: [[-52, 3, -64], [-56, 14, -69], [-57, 31, -73]],
  sky: [[-57, 31, -73], [-69, 41, -78], [-80, 46, -68], [-76, 42, -54], [-63, 33, -50]],
  descent: [[-59, 21, -50], [-55, 9, -54], [-49, 2, -58]],
};

export class ReshiramCompanion {
  constructor(actor, layout = RESHIRAM_LAYOUT, { startTime = 0 } = {}) {
    this.actor = actor;
    this.energy = new LegendaryEnergy(actor, layout === ZEKROM_LAYOUT);
    this.time = startTime;
    this.ground = G;
    this.tangent = v();
    this.nextTangent = v();
    const p = xyz => v(...xyz);
    const a = p(layout.a), b = p(layout.b);
    const curve = points => {
      const c = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      c.arcLengthDivisions = 300; c.updateArcLengths(); return c;
    };
    const skyEnd = p(layout.sky.at(-1));
    this.paths = {
      outward: curve([a, ...layout.outward.map(p), b]),
      home: curve([b, ...layout.home.map(p), a]),
      ascent: curve([b, ...layout.ascent.map(p)]),
      sky: curve(layout.sky.map(p)),
      descent: curve([skyEnd, ...layout.descent.map(p), b]),
    };
    const duration = key => {
      const clip = actor.clips.find(c => c.name.includes(key));
      if (!clip) throw new Error(`${actor.root.name} missing native animation: ${key}`);
      return clip.duration;
    };
    // Original walking stride: 1.8 rig units, including the source parent scale.
    const origin = actor.rig.getObjectByName('origin');
    actor.root.updateMatrixWorld(true);
    this.gaitSpeed = origin.getWorldScale(v()).z * 1.8 / duration('_00030_walk01');
    const travelTime = path => path.getLength() / (this.gaitSpeed * 1.08 * .92);
    this.stages = [
      { key: 'walk-out', duration: travelTime(this.paths.outward), path: 'outward', walk: true, clip: '_00030_walk01' },
      { key: 'look-around', duration: duration('_00010_defaultidle01'), clip: '_00010_defaultidle01', once: true },
      { key: 'ready', duration: 2.2, clip: '_00000_defaultwait01' },
      { key: 'take-off', duration: duration('_00150_jumpup01_start'), clip: '_00150_jumpup01_start', once: true, fade: .12 },
      { key: 'climb', duration: 4.5, path: 'ascent', clip: '_00151_jumpup01_loop', flying: true },
      { key: 'high-flight', duration: 13, path: 'sky', clip: '_20000_defaultwait01', flying: true, fade: .8 },
      { key: 'approach', duration: duration('_00152_jumpdown01_start'), clip: '_00152_jumpdown01_start', once: true, fade: .4 },
      { key: 'descend', duration: 8, path: 'descent', clip: '_00153_jumpdown01_loop', flying: true },
      { key: 'touch-down', duration: duration('_00155_land02'), clip: '_00155_land02', once: true, fade: .18 },
      { key: 'settle', duration: 2, clip: '_00000_defaultwait01' },
      { key: 'skill-charge', duration: 2.2, clip: '_00000_defaultwait01' },
      { key: 'skill-start', duration: duration('_00460_rangeattack02_start'), clip: '_00460_rangeattack02_start', once: true, fade: .25 },
      { key: 'skill-release', duration: duration('_00461_rangeattack02_loop') * 2, clip: '_00461_rangeattack02_loop', fade: .12 },
      { key: 'skill-end', duration: duration('_00462_rangeattack02_end'), clip: '_00462_rangeattack02_end', once: true, fade: .15 },
      { key: 'daily-motion', duration: duration('_00011_defaultidle02'), clip: '_00011_defaultidle02', once: true },
      { key: 'walk-home', duration: travelTime(this.paths.home), path: 'home', walk: true, clip: '_00030_walk01' },
      { key: 'stretch', duration: duration('_00320_refresh01'), clip: '_00320_refresh01', once: true },
      { key: 'rest-start', duration: duration('_00280_sleep01_start'), clip: '_00280_sleep01_start', once: true },
      { key: 'rest', duration: 7, clip: '_00281_sleep01_loop' },
      { key: 'wake', duration: duration('_00282_sleep01_end'), clip: '_00282_sleep01_end', once: true },
      { key: 'pause', duration: 3, clip: '_00000_defaultwait01' },
    ];
    this.cycle = this.stages.reduce((sum, s) => sum + s.duration, 0);
    actor.root.position.copy(a);
    this.paths.outward.getTangentAt(0, this.tangent);
    actor.root.rotation.y = actor.targetYaw = Math.atan2(this.tangent.x, this.tangent.z);
    if (startTime) { this.time -= 1e-3; this.update(1e-3); }
    actor.root.userData.heightRelativeToRaikou = 2.25;
    actor.root.userData.standingHeight = actor.size;
  }

  update(dt) {
    this.time += dt;
    let elapsed = this.time % this.cycle, index = 0;
    while (elapsed >= this.stages[index].duration) elapsed -= this.stages[index++].duration;
    const stage = this.stages[index], actor = this.actor, u = elapsed / stage.duration;
    let rate = 1, bank = 0;
    if (stage.path) {
      const path = this.paths[stage.path];
      const edge = stage.walk ? .08 : .16;
      const integral = x => x < edge ? x * x / (2 * edge)
        : x > 1 - edge ? 1 - edge - (1 - x) * (1 - x) / (2 * edge) : x - edge / 2;
      const p = clamp(integral(u) / (1 - edge), 0, 1);
      path.getPointAt(p, actor.root.position);
      path.getTangentAt(p, this.tangent);
      actor.targetYaw = Math.atan2(this.tangent.x, this.tangent.z);
      if (stage.walk) {
        const speed = Math.min(1, u / edge, (1 - u) / edge) / (1 - edge);
        rate = Math.max(.15, path.getLength() / stage.duration * speed / this.gaitSpeed);
      } else {
        path.getTangentAt(Math.min(1, p + .025), this.nextTangent);
        const turn = this.tangent.x * this.nextTangent.z - this.tangent.z * this.nextTangent.x;
        bank = clamp(turn * 2, -.16, .16) * Math.sin(Math.PI * u);
        rate = stage.key === 'climb' ? 1.35 : stage.key === 'high-flight' ? 1.1 : 1;
      }
    }
    actor.play(stage.clip, stage.fade ?? .45, rate, !!stage.once);
    actor.root.rotation.z = THREE.MathUtils.damp(actor.root.rotation.z, bank, 4, dt);
    actor.update(dt);
    actor.root.userData.activity = stage.key;
    this.energy.update(dt, stage, elapsed);
  }
}
