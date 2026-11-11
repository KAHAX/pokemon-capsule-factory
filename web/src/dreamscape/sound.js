import { WildlifeAudio } from './wildlife-audio.js';
// Quiet, streamed background playlist plus synthesized interaction effects.
const MUSIC_TRACKS = [
  new URL('assets/audio/pure-white-icelands.mp3', document.baseURI).href,
  new URL('assets/audio/lake.mp3', document.baseURI).href,
];
const MUSIC_VOLUME = .08;
const PENTA = [0, 2, 4, 7, 9];
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('capsule-sound-muted') === '1'; } catch { /* storage unavailable */ }
    this.lastPlayed = new Map();
  }

  // ---------- graph ----------
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.playMusic();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = .004; comp.release.value = .25;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = .75; this.sfx.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.6, 2.6);
    this.reverbOut = ctx.createGain(); this.reverbOut.gain.value = .825;
    this.reverb.connect(this.reverbOut).connect(this.master);
    this.send = ctx.createGain(); this.send.gain.value = 1; this.send.connect(this.reverb);
    this.noiseBuffer = this.makeNoise(2);
    this.startAmbience();
  }

  impulse(seconds, decay) {
    const ctx = this.ctx, length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
    return buffer;
  }

  makeNoise(seconds) {
    const ctx = this.ctx, buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    try { localStorage.setItem('capsule-sound-muted', muted ? '1' : '0'); } catch { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, .08);
  }

  ready(key, gap = 0) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return false;
    if (!gap) return true;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(key) ?? -9) < gap) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  // ---------- primitives ----------
  tone({ type = 'sine', freq = 440, to = null, at = 0, dur = .2, gain = .2, attack = .005, wet = .2, pan = 0, detune = 0, vibrato = 0, filter = null }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.detune.value = detune;
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = vibrato; depth.gain.value = freq * .025;
      lfo.connect(depth).connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + .05);
    }
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.value = filter.freq; f.Q.value = filter.q ?? .7;
      node.connect(f); node = f;
    }
    node.connect(amp);
    this.route(amp, wet, pan);
    osc.start(t); osc.stop(t + dur + .05);
  }

  noise({ at = 0, dur = .3, gain = .2, type = 'bandpass', freq = 1200, to = null, q = 1, attack = .01, wet = .2, pan = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f).connect(amp);
    this.route(amp, wet, pan);
    src.start(t, Math.random()); src.stop(t + dur + .05);
  }

  route(node, wet, pan) {
    let out = node;
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); out = p; }
    out.connect(this.sfx);
    if (wet) { const w = this.ctx.createGain(); w.gain.value = wet; out.connect(w).connect(this.send); }
  }

  bell(freq, at = 0, gain = .12, dur = 1.6, wet = .5, pan = 0) {
    this.tone({ freq, at, gain, dur, wet, pan, attack: .002 });
    this.tone({ freq: freq * 2.76, at, gain: gain * .35, dur: dur * .45, wet, pan, attack: .002 });
    this.tone({ freq: freq * 5.4, at, gain: gain * .12, dur: dur * .2, wet, pan, attack: .001 });
  }

  // ---------- background playlist ----------
  startAmbience() {
    const ctx = this.ctx;
    this.musicIndex = Math.floor(Math.random() * MUSIC_TRACKS.length);
    const audio = this.music = new Audio();
    // Stream on first interaction; don't decode both songs during scene loading.
    audio.preload = 'none';
    audio.loop = false;
    audio.src = MUSIC_TRACKS[this.musicIndex];
    this.musicGain = ctx.createGain();
    this.musicGain.gain.setValueAtTime(0, ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(MUSIC_VOLUME, ctx.currentTime, .7);
    this.musicSource = ctx.createMediaElementSource(audio);
    this.musicSource.connect(this.musicGain).connect(this.master);
    audio.addEventListener('ended', () => {
      this.musicIndex = (this.musicIndex + 1) % MUSIC_TRACKS.length;
      audio.src = MUSIC_TRACKS[this.musicIndex];
      this.playMusic();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) audio.pause();
      else this.playMusic();
    });
    this.playMusic();
  }

  playMusic() {
    if (!this.music || document.hidden || !this.music.paused) return;
    // Autoplay may be denied until a real gesture; unlock() retries on interaction.
    this.music.play().catch(() => {});
  }

  // ---------- effects ----------
  ui() { if (!this.ready('ui', .04)) return; this.tone({ type: 'square', freq: 1320, to: 1760, dur: .06, gain: .045, wet: .05, filter: { freq: 3200 } }); }
  hover() { if (!this.ready('hover', .08)) return; this.tone({ type: 'triangle', freq: 2093, dur: .035, gain: .02, wet: .05 }); }
  denied() { if (!this.ready('denied', .2)) return; this.tone({ type: 'square', freq: 220, to: 160, dur: .16, gain: .05, filter: { freq: 1400 } }); }

  crankStart() {
    if (!this.ready('crank', .3)) return;
    this.noise({ type: 'lowpass', freq: 900, dur: .25, gain: .12, wet: .1 });
    this.tone({ type: 'sawtooth', freq: 70, to: 48, dur: .3, gain: .05, filter: { freq: 400 } });
  }
  ratchet() {
    if (!this.ready('ratchet', .045)) return;
    this.noise({ type: 'bandpass', freq: rand(2600, 3400), q: 6, dur: .035, gain: .16, attack: .001, wet: .08, pan: .35 });
    this.tone({ type: 'square', freq: rand(170, 200), dur: .03, gain: .035, filter: { freq: 900 }, pan: .35 });
  }
  slotTick() { if (!this.ready('slot', .05)) return; this.tone({ type: 'square', freq: rand(880, 990), dur: .04, gain: .028, wet: .06, filter: { freq: 2600 } }); }
  slotStop() {
    if (!this.ready('slotStop', .3)) return;
    [72, 76, 79].forEach((m, i) => this.tone({ type: 'square', freq: hz(m), at: i * .07, dur: .14, gain: .04, wet: .15, filter: { freq: 3000 } }));
  }
  roll() {
    if (!this.ready('roll', .5)) return;
    this.noise({ type: 'lowpass', freq: 380, to: 160, dur: 1.4, gain: .14, attack: .15, wet: .15, pan: -.2 });
    for (let i = 0; i < 6; i++) this.noise({ type: 'bandpass', freq: rand(500, 900), q: 3, at: .15 + i * rand(.13, .2), dur: .05, gain: .05, attack: .002, pan: -.2 });
  }
  thunk() {
    if (!this.ready('thunk', .2)) return;
    this.tone({ freq: 140, to: 60, dur: .22, gain: .2, wet: .1 });
    this.noise({ type: 'lowpass', freq: 1500, dur: .07, gain: .1, attack: .001 });
    this.tone({ type: 'triangle', freq: 1046, at: .03, dur: .25, gain: .03, wet: .3 });
  }
  pickup() {
    if (!this.ready('pickup', .2)) return;
    this.noise({ type: 'bandpass', freq: 600, to: 3200, dur: .45, gain: .1, attack: .08, wet: .3 });
    this.tone({ type: 'sine', freq: 392, to: 784, dur: .4, gain: .06, wet: .4 });
  }
  flightLand() { if (!this.ready('land', .3)) return; this.bell(hz(84), 0, .05, 1.4, .7); }
  unlockClick() {
    if (!this.ready('unlockClick', .2)) return;
    this.noise({ type: 'highpass', freq: 2400, dur: .05, gain: .14, attack: .001 });
    this.tone({ type: 'square', freq: 660, at: .02, dur: .07, gain: .035, filter: { freq: 2000 } });
    this.tone({ type: 'sine', freq: 220, to: 880, at: .08, dur: .5, gain: .06, wet: .4 });
  }
  ballOpen() {
    if (!this.ready('open', .3)) return;
    this.noise({ type: 'highpass', freq: 1800, dur: .08, gain: .18, attack: .001 });
    this.noise({ type: 'bandpass', freq: 400, to: 6000, dur: .9, gain: .12, attack: .05, wet: .5 });
    this.tone({ freq: 196, to: 1568, dur: .7, gain: .07, wet: .6 });
  }
  reveal() {
    if (!this.ready('reveal', .5)) return;
    [72, 76, 79, 84, 88].forEach((m, i) => this.bell(hz(m), .05 + i * .07, .05, 1.6, .7, (i - 2) * .2));
  }
  cry(id = 25) {
    if (!this.ready('cry', .4)) return;
    const r = seeded(Number(id) || 25);
    const base = 280 + r() * 520, segments = 2 + Math.floor(r() * 3);
    let at = .25;
    for (let i = 0; i < segments; i++) {
      const dur = .12 + r() * .22, from = base * (.7 + r() * .9), to = base * (.5 + r() * 1.4);
      const type = r() < .5 ? 'square' : 'sawtooth';
      this.tone({ type, freq: from, to, at, dur, gain: .05, attack: .01, wet: .25, vibrato: 18 + r() * 30, filter: { freq: 2600 + r() * 2000, q: 2 } });
      this.tone({ type: 'square', freq: from * 1.5, to: to * 1.5, at, dur, gain: .018, attack: .01, wet: .2, filter: { freq: 3500 } });
      at += dur * (.75 + r() * .3);
    }
  }
  shiny() {
    if (!this.ready('shiny', 1)) return;
    for (let i = 0; i < 14; i++) this.bell(hz(84 + PENTA[i % 5] + 12 * Math.floor(i / 5)), i * .055, .035, 1.8, .8, Math.sin(i) * .7);
    this.noise({ type: 'highpass', freq: 5000, dur: 2.4, gain: .05, attack: .3, wet: .9 });
    this.tone({ freq: hz(60), dur: 2.6, gain: .05, attack: .4, wet: .8 });
  }
  card() {
    if (!this.ready('card', .5)) return;
    this.noise({ type: 'bandpass', freq: 900, to: 4500, dur: .6, gain: .1, attack: .1, wet: .4 });
    [79, 83, 86, 91].forEach((m, i) => this.bell(hz(m), .25 + i * .09, .045, 1.5, .7, (i - 1.5) * .25));
  }
  cardStore() {
    if (!this.ready('store', .3)) return;
    this.noise({ type: 'bandpass', freq: 3000, to: 600, dur: .5, gain: .1, attack: .02, wet: .3 });
    this.tone({ type: 'square', freq: hz(76), at: .3, dur: .08, gain: .035, filter: { freq: 2400 } });
    this.tone({ type: 'square', freq: hz(83), at: .38, dur: .14, gain: .035, filter: { freq: 2400 } });
  }
  close() {
    if (!this.ready('close', .25)) return;
    this.noise({ type: 'bandpass', freq: 3500, to: 500, dur: .35, gain: .08, attack: .02, wet: .25 });
    this.tone({ freq: 660, to: 220, dur: .3, gain: .04, wet: .3 });
  }
  dexOpen() {
    if (!this.ready('dex', .4)) return;
    this.noise({ type: 'lowpass', freq: 1200, dur: .09, gain: .14, attack: .001 });
    this.noise({ type: 'bandpass', freq: 2200, q: 4, at: .55, dur: .05, gain: .12, attack: .001 });
    // Handheld boot: two-note square chime.
    this.tone({ type: 'square', freq: hz(84), at: .7, dur: .09, gain: .04, filter: { freq: 3000 } });
    this.tone({ type: 'square', freq: hz(91), at: .79, dur: .32, gain: .04, filter: { freq: 3000 }, wet: .2 });
  }
  dexClose() {
    if (!this.ready('dexClose', .4)) return;
    this.tone({ type: 'square', freq: hz(88), dur: .07, gain: .03, filter: { freq: 2500 } });
    this.tone({ type: 'square', freq: hz(79), at: .08, dur: .12, gain: .03, filter: { freq: 2500 } });
    this.noise({ type: 'lowpass', freq: 1000, at: .7, dur: .1, gain: .16, attack: .001 });
  }
  cardSwitch() {
    if (!this.ready('switch', .06)) return;
    this.noise({ type: 'bandpass', freq: rand(2400, 3000), to: 1200, q: 1.4, dur: .16, gain: .07, attack: .01, wet: .1 });
    this.tone({ type: 'square', freq: 1568, dur: .03, gain: .02, filter: { freq: 3000 } });
  }
  select() { if (!this.ready('select', .2)) return; this.tone({ type: 'square', freq: hz(81), dur: .06, gain: .035, filter: { freq: 3000 } }); this.tone({ type: 'square', freq: hz(88), at: .06, dur: .12, gain: .035, filter: { freq: 3000 }, wet: .2 }); }
  receive() {
    if (!this.ready('receive', .5)) return;
    [76, 79, 84].forEach((m, i) => this.tone({ type: 'square', freq: hz(m), at: .5 + i * .08, dur: .12, gain: .035, filter: { freq: 3000 }, wet: .2 }));
  }
  capture() {
    if (!this.ready('capture', .6)) return;
    this.noise({ type: 'bandpass', freq: 500, to: 2500, dur: .35, gain: .1, attack: .03, wet: .2 });
    for (let i = 0; i < 3; i++) {
      this.noise({ type: 'bandpass', freq: 1400, q: 3, at: .45 + i * .55, dur: .06, gain: .12, attack: .001, wet: .15 });
      this.tone({ type: 'triangle', freq: 300, to: 240, at: .45 + i * .55, dur: .12, gain: .05 });
    }
    this.tone({ type: 'square', freq: hz(84), at: 2.1, dur: .08, gain: .04, filter: { freq: 3000 } });
    this.bell(hz(91), 2.2, .05, 1.4, .6);
  }
  box() {
    if (!this.ready('box', .4)) return;
    this.noise({ type: 'lowpass', freq: 700, dur: .18, gain: .14, attack: .005 });
    this.tone({ freq: 110, to: 80, dur: .2, gain: .08 });
    this.bell(hz(79), .2, .035, 1, .5);
  }
}

// Wire sounds to the app's objects by wrapping their methods (no game logic changes).
export function installSound({ machine, focus, pokedex, captureBalls = [], boxInteraction, shinyFX, camera, companions, isSceneActive }) {
  const fx = new SoundFX();
  const wildlife = new WildlifeAudio(fx, { camera, companions, isSceneActive });
  const wrap = (object, name, before, after) => {
    const original = object?.[name];
    if (typeof original !== 'function') return;
    object[name] = function wrapped(...args) {
      before?.call(this, ...args);
      const result = original.apply(this, args);
      after?.call(this, result, ...args);
      return result;
    };
  };
  const unlock = () => fx.unlock();
  for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, unlock, { capture: true, passive: true });

  // Generic UI.
  document.addEventListener('click', event => { if (event.target.closest?.('button, [role="button"], .side-action')) fx.ui(); }, true);
  document.addEventListener('pointerover', event => {
    const target = event.target.closest?.('button, [role="button"]');
    if (target && !target.contains(event.relatedTarget)) fx.hover();
  }, true);

  // Machine.
  wrap(machine, 'spin', null, accepted => (accepted ? fx.crankStart() : fx.denied()));
  wrap(machine, 'setDisplays', null, (_, indices, final) => (final ? fx.slotStop() : fx.slotTick()));
  wrap(machine, 'releaseOutputNow', function () { this._soundEjected = this.hasEjected; }, function () { if (!this._soundEjected && this.hasEjected) fx.roll(); });
  wrap(machine, 'finishOutput', null, () => fx.thunk());
  wrap(machine, 'collectOutput', null, ball => ball && fx.pickup());
  // The outlet backlight is deliberately silent.
  wrap(boxInteraction, 'play', null, () => fx.box());
  captureBalls.forEach(ball => wrap(ball, 'play', null, () => fx.capture()));

  // Ball close-up and cards.
  wrap(focus, 'openBall', function () { this._soundMode = this.mode; }, function () { if (this._soundMode === 'closed') fx.unlockClick(); });
  wrap(focus, 'beginOpenBall', function () { if (this.mode === 'unlocking') fx.ballOpen(); });
  wrap(focus, 'preparePokemon', function () { this._soundHad = Boolean(this.pokemon); }, function () {
    if (!this._soundHad && this.pokemon) { fx.reveal(); fx.cry(this.pokemonEntry?.dex || this.pokemonEntry?.id); }
  });
  wrap(focus, 'playPokemonInteraction', null, function () { fx.cry(this.pokemonEntry?.dex || this.pokemonEntry?.id); });
  wrap(focus, 'makeCard', function () { this._soundMode = this.mode; }, function () { if (this._soundMode === 'revealed') fx.card(); });
  wrap(focus, 'storeCard', null, () => fx.cardStore());
  wrap(focus, 'closeBall', null, () => fx.close());
  wrap(focus, 'minimize', null, () => fx.close());
  wrap(focus, 'openSavedCard', () => fx.card());

  // Pokédex.
  wrap(pokedex, 'openViewer', function () { this._soundViewer = this.viewer; }, function () { if (!this._soundViewer && this.viewer) fx.dexOpen(); });
  wrap(pokedex, 'closeViewer', function () { if (this.viewer) fx.dexClose(); });
  wrap(pokedex, 'switchCard', () => fx.cardSwitch());
  wrap(pokedex, 'selectCard', () => fx.select());
  wrap(pokedex, 'receiveCard', () => fx.receive());

  // Mute toggle.
  const button = document.createElement('button');
  button.className = 'sound-toggle';
  const paint = () => {
    button.textContent = fx.muted ? '♪̸' : '♪';
    button.setAttribute('aria-label', fx.muted ? '打开声音' : '关闭声音');
    button.setAttribute('aria-pressed', String(!fx.muted));
    button.title = fx.muted ? '声音：关' : '声音：开';
  };
  button.addEventListener('click', () => { fx.unlock(); fx.setMuted(!fx.muted); paint(); });
  paint();
  const style = document.createElement('style');
  style.textContent = `.sound-toggle { position: fixed; left: 18px; bottom: 18px; z-index: 60; width: 38px; height: 38px;
    border-radius: 50%; border: 1px solid rgba(160,210,255,.35); background: rgba(8,14,30,.55); color: #cfe8ff;
    font: 600 17px/1 system-ui, sans-serif; cursor: pointer; backdrop-filter: blur(6px);
    box-shadow: 0 0 14px rgba(90,170,255,.25), inset 0 0 8px rgba(120,190,255,.15); transition: transform .2s, box-shadow .2s; }
  .sound-toggle:hover { transform: translateY(-2px); box-shadow: 0 0 20px rgba(110,190,255,.45), inset 0 0 10px rgba(140,200,255,.25); }
  .sound-toggle[aria-pressed="false"] { color: #7f8aa3; }`;
  document.head.appendChild(style);
  document.body.appendChild(button);

  // Crank ratchet synced to the actual handle rotation.
  let lastAngle = null, travelled = 0;
  return {
    fx,
    wildlife,
    update(dt) {
      wildlife.update(dt);
      const crank = machine?.crank;
      if (!crank) return;
      const angle = crank.rotation.x + crank.rotation.y + crank.rotation.z;
      if (lastAngle !== null) {
        travelled += Math.abs(angle - lastAngle);
        if (travelled > .38) { travelled = 0; fx.ratchet(); }
      }
      lastAngle = angle;
    },
  };
}
