import * as THREE from 'three';
import { createLightningStrokes } from './lightning-strokes.js';

// Raikou's electricity, drawn as thick HDR strokes (golden-white core, amber corona):
//  · body discharge — bolts leaping from the mane to the ground, each striking on its own
//    rhythm, with small ground splashes and arcs crawling over the body;
//  · charging — a heavy main bolt from the head to the pillar socket with two strands
//    spiralling around it, bright pulses racing towards the pillar, sparks bursting at the
//    socket and arcs climbing the pillar, plus glows and light at both ends.
const MAX = 448, TAU = Math.PI * 2;
const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const v = () => new THREE.Vector3();

function glowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d'), gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(.16, 'rgba(255,244,190,.75)');
  gradient.addColorStop(.45, 'rgba(255,190,70,.2)'); gradient.addColorStop(1, 'rgba(255,150,30,0)');
  g.fillStyle = gradient; g.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class RaikouLightning {
  constructor(actor, pillar) {
    this.actor = actor; this.pillar = pillar;
    this.head = actor.rig.getObjectByName('head') || actor.placement;
    this.positions = new Float32Array(MAX * 6);
    this.styles = new Float32Array(MAX * 2);
    this.mesh = createLightningStrokes(this.positions, this.styles, { core: [9, 7.4, 3.1], corona: [5.4, 2.4, .22] });
    this.mesh.name = 'Raikou / golden lightning strokes';
    this.mesh.material.uniforms.power.value = 1;
    this.mesh.visible = false;
    this.root = new THREE.Group(); this.root.name = 'Raikou / lightning, glows and light';
    this.root.add(this.mesh);
    const texture = glowTexture();
    const sprite = scale => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: new THREE.Color(2.6, 2.1, 1.1), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.userData.size = scale; s.visible = false; this.root.add(s); return s;
    };
    this.socketGlow = sprite(3.4); this.mouthGlow = sprite(2.1); this.bodyGlow = sprite(6.5);
    this.socketLight = new THREE.PointLight('#ffd76a', 0, 11, 2);
    this.bodyLight = new THREE.PointLight('#ffdc78', 0, 12, 2);
    this.root.add(this.socketLight, this.bodyLight);
    this.count = 0;
    this.a = v(); this.b = v(); this.p = v(); this.q = v(); this.prev = v(); this.dir = v(); this.n1 = v(); this.n2 = v();
    this.f0 = v(); this.f1 = v(); this.g0 = v(); this.g1 = v();
    this.path = Array.from({ length: 33 }, v); this.pathLength = 0;
  }

  attach() {
    if (this.root.parent) return true;
    const parent = this.actor.root.parent; if (!parent) return false;
    parent.add(this.root);
    let scene = parent; while (scene.parent) scene = scene.parent;
    // Light, not an opaque surface: keep it out of the depth-of-field depth pass.
    (scene.userData.dreamNoDepth ||= new Set()).add(this.root);
    return true;
  }

  seg(a, b, intensity, width) {
    if (this.count >= MAX) return;
    const i = this.count * 6, j = this.count * 2;
    this.positions[i] = a.x; this.positions[i + 1] = a.y; this.positions[i + 2] = a.z;
    this.positions[i + 3] = b.x; this.positions[i + 4] = b.y; this.positions[i + 5] = b.z;
    this.styles[j] = intensity; this.styles[j + 1] = width; this.count++;
  }

  // A jagged bolt from a to b: slow wander + per-strike jitter, optional spiral and forks.
  bolt(a, b, { steps = 14, spread = .4, seed = 0, strike = 0, width = 1, intensity = 1, forks = 0, twist = 0, phase = 0, record = false }) {
    const { dir, n1, n2, p, prev } = this;
    dir.subVectors(b, a); const length = dir.length(); if (length < 1e-4) return;
    dir.multiplyScalar(1 / length);
    n1.set(0, 1, 0).cross(dir); if (n1.lengthSq() < 1e-4) n1.set(1, 0, 0); n1.normalize();
    n2.crossVectors(dir, n1).normalize();
    prev.copy(a); if (record) { this.path[0].copy(a); this.pathLength = steps; }
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, env = Math.sin(Math.PI * u);
      const lo1 = Math.sin(u * 8.2 + seed * 11 + strike * 1.7) * .55, lo2 = Math.cos(u * 5.6 + seed * 7 + strike * 2.3) * .55;
      const hi1 = hash(seed * 61 + i * 3.1 + strike * 17) - .5, hi2 = hash(seed * 83 + i * 5.7 + strike * 29) - .5;
      const s1 = env * (spread * (lo1 + hi1) + twist * Math.cos(u * TAU * 1.6 + phase));
      const s2 = env * (spread * (lo2 + hi2) + twist * Math.sin(u * TAU * 1.6 + phase));
      p.copy(a).addScaledVector(dir, length * u).addScaledVector(n1, s1).addScaledVector(n2, s2);
      this.seg(prev, p, intensity, width * (.7 + .5 * env));
      if (record) this.path[i].copy(p);
      if (forks && i > 1 && i < steps - 1 && hash(seed * 13 + i * 1.9 + strike * 3) > 1 - forks) {
        // A short branch peeling off sideways and forwards, thinning as it goes.
        const { f0, f1 } = this, reach = length * (.08 + .1 * hash(i + seed + strike));
        f0.copy(p);
        for (let k = 1; k <= 3; k++) {
          f1.copy(f0).addScaledVector(dir, reach * .28)
            .addScaledVector(n1, reach * (hash(seed + i * 7 + k + strike) - .5) * 1.1)
            .addScaledVector(n2, reach * (hash(seed + i * 11 + k * 3 + strike) - .5) * 1.1);
          this.seg(f0, f1, intensity * (.7 - k * .14), width * (.62 - k * .12));
          f0.copy(f1);
        }
      }
      prev.copy(p);
    }
  }

  update(time, body, charging) {
    const active = (body > .002 || charging > .002) && this.attach();
    this.mesh.visible = !!active;
    if (!active) {
      this.socketLight.intensity = this.bodyLight.intensity = 0;
      this.socketGlow.visible = this.mouthGlow.visible = this.bodyGlow.visible = false;
      return;
    }
    this.count = 0;
    const actor = this.actor, k = actor.size / 3.9, root = actor.root, parent = this.root.parent;
    root.updateWorldMatrix(true, true);
    const local = (target, x, y, z) => parent.worldToLocal(root.localToWorld(target.set(x * k, y * k, z * k)));
    const flick = .7 + .3 * hash(Math.floor(time * 30));

    if (body > .002) {
      // Ground strikes: each bolt re-strikes on its own clock and rests in between.
      for (let j = 0; j < 7; j++) {
        const strike = Math.floor(time * (7 + j % 3) + j * .37);
        if (hash(j * 7.3 + strike) < .4) continue;
        const angle = j * TAU / 7 + (hash(j + strike * .5) - .5) * .9;
        const reach = 2 + 1.5 * hash(j * 3 + strike);
        local(this.a, Math.cos(angle) * .6, 2.55 + .7 * hash(j * 5 + strike), Math.sin(angle) * .9);
        local(this.b, Math.cos(angle) * reach, .03, Math.sin(angle) * (reach + .9));
        const power = body * (.6 + .7 * hash(j * 9 + strike));
        this.bolt(this.a, this.b, { steps: 11, spread: .34 * k, seed: j + 1, strike, width: .85 + .5 * hash(j + strike * 3), intensity: power, forks: .3 });
        // Splash where it meets the ground.
        for (let s = 0; s < 3; s++) {
          const spin = hash(j * 17 + s + strike) * TAU, size = (.25 + .35 * hash(s + strike)) * k;
          this.g1.copy(this.b).add(this.g0.set(Math.cos(spin) * size, .06 * k + size * .35, Math.sin(spin) * size));
          this.seg(this.b, this.g1, power * .7, .5);
        }
      }
      // Arcs crawling over the mane and back.
      for (let j = 0; j < 5; j++) {
        const strike = Math.floor(time * 13 + j * 1.7);
        if (hash(j * 4.1 + strike) < .35) continue;
        const a0 = hash(j + strike) * TAU, a1 = a0 + 1 + hash(j * 2 + strike);
        local(this.a, Math.cos(a0) * .75, 1.9 + Math.sin(a0 * 2) * .75, Math.sin(a0) * 1.5);
        local(this.b, Math.cos(a1) * .75, 1.9 + Math.sin(a1 * 2) * .75, Math.sin(a1) * 1.5);
        this.bolt(this.a, this.b, { steps: 6, spread: .2 * k, seed: 40 + j, strike, width: .5, intensity: body * .8 });
      }
      local(this.bodyGlow.position, 0, 2.1, .2);
      local(this.bodyLight.position, 0, 2.6, .3);
    }
    this.bodyGlow.visible = body > .002;
    this.bodyGlow.material.opacity = body * .32 * flick;
    this.bodyGlow.scale.setScalar(this.bodyGlow.userData.size * k * (.9 + .2 * flick));
    this.bodyLight.intensity = body * 11 * flick;

    if (charging > .002 && this.pillar) {
      const pillar = this.pillar;
      pillar.updateWorldMatrix(true, false);
      this.head.getWorldPosition(this.a); parent.worldToLocal(this.a);
      this.q.copy(pillar.userData.chargeSocket); pillar.localToWorld(this.q); parent.worldToLocal(this.q);
      this.b.copy(this.q);
      this.a.addScaledVector(this.g0.subVectors(this.b, this.a).normalize(), .3 * k);
      const span = this.a.distanceTo(this.b), strike = Math.floor(time * 16), slow = Math.floor(time * 5);
      const power = charging * (.8 + .2 * flick);
      // Main bolt, re-recorded so the pulses can ride along it.
      this.bolt(this.a, this.b, { steps: 24, spread: span * .045, seed: 3, strike: slow + hash(strike) * .35, width: 1.9, intensity: power * 1.15, forks: .22, record: true });
      const mainEnd = this.pathLength;
      // Two finer strands spiralling around the main bolt.
      for (let j = 0; j < 2; j++) {
        this.a.copy(this.path[0]); this.b.copy(this.path[mainEnd]);
        this.bolt(this.a, this.b, { steps: 20, spread: span * .03, seed: 20 + j, strike, width: .75, intensity: power * .75,
          twist: span * .06, phase: time * (5 + j * 1.5) * (j ? -1 : 1) + j * Math.PI, forks: .12 });
      }
      // Bright packets of charge racing from Raikou into the pillar.
      for (let j = 0; j < 4; j++) {
        const u = (time * 1.9 + j / 4) % 1, at = u * (mainEnd - 2), i = Math.floor(at);
        const fade = Math.sin(Math.PI * u);
        this.seg(this.path[i], this.path[i + 1], power * 2.6 * fade, 3);
        this.seg(this.path[i + 1], this.path[i + 2], power * 1.6 * fade, 2.4);
      }
      // Sparks bursting from the socket.
      const end = this.path[mainEnd];
      for (let j = 0; j < 7; j++) {
        const spin = hash(j * 3.3 + strike) * TAU, lift = hash(j * 5.1 + strike) - .35, size = (.35 + .75 * hash(j + strike * 7)) * k * .45;
        this.g0.set(Math.cos(spin) * size, lift * size * 1.6, Math.sin(spin) * size).add(end);
        this.g1.copy(this.g0).add(this.f0.set(Math.cos(spin) * size * .6, -size * .45, Math.sin(spin) * size * .6));
        this.seg(end, this.g0, power * 1.2, .7); this.seg(this.g0, this.g1, power * .6, .4);
      }
      // Arcs climbing the pillar as it takes the charge.
      for (let j = 0; j < 3; j++) {
        const climb = (time * .55 + j / 3) % 1, y = 1 + climb * 3.4, start = hash(j * 9 + slow) * TAU, sweep = 1.3 + hash(j + slow);
        const strength = power * Math.sin(Math.PI * climb) * .85;
        for (let s = 0; s < 8; s++) {
          const point = (target, step) => {
            const angle = start + sweep * step / 8, radius = 1.42 + (hash(j * 31 + step + strike) - .5) * .16;
            return parent.worldToLocal(pillar.localToWorld(target.set(Math.sin(angle) * radius, y + (hash(j * 37 + step + strike) - .5) * .3, Math.cos(angle) * radius)));
          };
          point(this.f0, s); point(this.f1, s + 1);
          this.seg(this.f0, this.f1, strength, .55);
        }
      }
      this.socketGlow.position.copy(end); this.mouthGlow.position.copy(this.path[0]);
      this.socketLight.position.copy(end);
    }
    const on = charging > .002 && !!this.pillar;
    this.socketGlow.visible = this.mouthGlow.visible = on;
    for (const glow of [this.socketGlow, this.mouthGlow]) {
      glow.material.opacity = charging * (.55 + .4 * flick);
      glow.scale.setScalar(glow.userData.size * k * .55 * (.85 + .3 * flick));
    }
    this.socketLight.intensity = charging * 26 * flick;

    this.mesh.geometry.instanceCount = this.count;
    this.mesh.userData.positionBuffer.needsUpdate = true;
    this.mesh.userData.styleBuffer.needsUpdate = true;
  }
}
