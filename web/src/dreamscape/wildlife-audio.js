import * as THREE from 'three';

const rand = (min, max) => min + Math.random() * (max - min);
const NEAR = 26, FAR = 32;
const SPECIES = new Set(['pikachu', 'cubone', 'jolteon']);

// Sparse environmental voices. Reuse the existing synth/reverb/mute graph;
// no audio files, continuous oscillators, or per-frame audio-node allocation.
export class WildlifeAudio {
  constructor(fx, { camera, companions, isSceneActive = () => true }) {
    this.fx = fx; this.camera = camera; this.companions = companions;
    this.isSceneActive = isSceneActive;
    this.time = 0; this.nextCheck = 0; this.nextVoice = 0; this.nextRoar = null;
    this.states = new Map();
    this.world = new THREE.Vector3(); this.local = new THREE.Vector3();
    this.eye = new THREE.Vector3(); this.lastEvent = null;
  }

  location(actor) {
    actor.root.getWorldPosition(this.world);
    this.world.y += (actor.size || 0) * .45;
    this.camera.getWorldPosition(this.eye);
    const distance = this.eye.distanceTo(this.world);
    this.local.copy(this.world).applyMatrix4(this.camera.matrixWorldInverse);
    const horizontal = Math.hypot(this.local.x, this.local.z);
    return { distance, inFront: this.local.z < 0,
      pan: THREE.MathUtils.clamp(this.local.x / Math.max(horizontal, 1), -.85, .85) };
  }

  update(dt = 0) {
    const fx = this.fx;
    if (!this.camera || !fx.ctx || fx.ctx.state !== 'running' || fx.muted || document.hidden || !this.isSceneActive()) return;
    this.time += Math.min(Math.max(dt, 0), .5);
    if (this.time < this.nextCheck) return;
    this.nextCheck = this.time + .12;
    this.camera.updateMatrixWorld();
    const companions = typeof this.companions === 'function' ? this.companions() : this.companions;
    if (!companions) return;
    for (const wanderer of companions.wanderers || []) {
      if (!SPECIES.has(wanderer.species) || !wanderer.actor.root.visible) continue;
      const { distance, inFront, pan } = this.location(wanderer.actor);
      let state = this.states.get(wanderer);
      if (!state) { state = { near: false, next: 0 }; this.states.set(wanderer, state); }
      // Hysteresis prevents a call storm while crossing the proximity boundary.
      if (!inFront || distance > FAR) { state.near = false; continue; }
      if (!state.near && distance < NEAR) {
        state.near = true;
        state.next = Math.max(state.next, this.time + rand(.3, 1));
      }
      if (!state.near || distance > NEAR || this.time < state.next || this.time < this.nextVoice) continue;
      if (/sleep|drowse/i.test(wanderer.actor.root.userData.activity || '')) continue;
      const level = .16 + .84 * (1 - THREE.MathUtils.smoothstep(distance, 8, 30));
      this.call(wanderer.species, level, pan);
      state.next = this.time + rand(12, 23);
      this.nextVoice = this.time + 2.4;
      this.lastEvent = { species: wanderer.species, distance, pan, level, time: this.time };
    }
    const dragon = companions.rayquaza?.actor;
    if (!dragon?.root.visible) return;
    if (this.nextRoar === null) this.nextRoar = this.time + rand(20, 34);
    if (this.time < this.nextRoar || this.time < this.nextVoice) return;
    const { distance, pan } = this.location(dragon);
    const level = THREE.MathUtils.clamp(190 / Math.max(190, distance), .3, 1) * .65;
    this.roar(level, pan * .75);
    this.nextRoar = this.time + rand(38, 68);
    this.nextVoice = this.time + 4.3;
    this.lastEvent = { species: 'rayquaza', distance, pan, level, time: this.time };
  }

  call(species, level = 1, pan = 0) {
    if (!this.fx.ready('wildlife-call', .3)) return;
    const fx = this.fx, pitch = rand(.94, 1.06);
    const tone = options => fx.tone({ wet: .18, pan, ...options,
      freq: options.freq * pitch, to: options.to ? options.to * pitch : null,
      gain: options.gain * level });
    if (species === 'pikachu') {
      // Bright two-syllable chirp with an upward greeting and a softer answer.
      tone({ type:'triangle', freq:1040, to:1530, at:0, dur:.18, gain:.095, attack:.035, vibrato:22 });
      tone({ type:'square', freq:1560, to:1850, at:.02, dur:.13, gain:.015, attack:.025, filter:{freq:2700} });
      tone({ type:'triangle', freq:1480, to:820, at:.23, dur:.36, gain:.1, attack:.055, vibrato:17 });
      tone({ freq:2220, to:1230, at:.24, dur:.29, gain:.023, attack:.045 });
    } else if (species === 'cubone') {
      // Hollow, rounded wooden/formant-like notes: quieter and lower than Pikachu.
      tone({ type:'triangle', freq:400, to:540, at:0, dur:.25, gain:.115, attack:.065, vibrato:8 });
      tone({ type:'sine', freq:770, to:900, at:.02, dur:.19, gain:.034, attack:.06 });
      tone({ type:'triangle', freq:490, to:260, at:.3, dur:.43, gain:.1, attack:.07, vibrato:12 });
      tone({ type:'sine', freq:980, to:520, at:.31, dur:.36, gain:.025, attack:.07 });
      fx.noise({type:'bandpass',freq:780,q:3,at:.31,dur:.19,gain:.022*level,attack:.04,wet:.22,pan});
    } else if (species === 'jolteon') {
      // A short throaty electric yip, finished with a fine crackle.
      tone({ type:'sawtooth', freq:460, to:800, dur:.19, gain:.06, attack:.035, vibrato:30, filter:{freq:1900,q:1.2} });
      tone({ type:'triangle', freq:720, to:350, at:.17, dur:.34, gain:.09, attack:.045, vibrato:24 });
      fx.noise({type:'bandpass',freq:2400,to:1100,q:3,at:.13,dur:.27,gain:.035*level,attack:.04,wet:.16,pan});
      tone({ type:'square', freq:1800, to:2600, at:.42, dur:.07, gain:.012, attack:.012, filter:{freq:3000} });
    }
  }

  roar(level = .6, pan = 0) {
    if (!this.fx.ready('wildlife-rayquaza', 8)) return;
    const fx = this.fx, pitch = rand(.9, 1.07);
    // Low layered throat + breath, with a high, falling harmonic. Long attack
    // and filtered, diminishing echoes make this read as a creature far overhead.
    for (const [at, strength] of [[0,1],[1.25,.27],[2.25,.1]]) {
      fx.tone({type:'sawtooth',freq:118*pitch,to:51*pitch,at,dur:2.2,gain:.085*level*strength,
        attack:.32,filter:{freq:680,q:1.1},vibrato:23,wet:.95,pan});
      fx.tone({type:'triangle',freq:61*pitch,to:34*pitch,at:at+.06,dur:2.5,gain:.11*level*strength,
        attack:.4,filter:{freq:260},wet:.8,pan});
      fx.tone({type:'sine',freq:440*pitch,to:140*pitch,at:at+.12,dur:1.85,gain:.037*level*strength,
        attack:.3,vibrato:16,wet:1.1,pan});
      fx.noise({type:'bandpass',freq:620,to:210,q:1.2,at,dur:2.4,gain:.095*level*strength,
        attack:.38,wet:1.15,pan});
    }
  }
}
