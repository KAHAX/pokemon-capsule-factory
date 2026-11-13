import { playCardRecall } from './card-recall.js';
import { mobileEdition } from './mobile-performance.js';
import { MobileCardSurface } from './card/mobile-card-surface.js';
import { prepareCardSurface } from './card-surface.js';
import * as THREE from 'three';
import { PokemonCardScene } from './card/pokemon-card-scene.js';
import { POKEMON_CARDS } from './card/pokemon-card-data.js';
import { measureModelBounds, fitCardBounds } from './card-framing.js';
import './holo-card.css';
import { getDisplaySettings } from './debug-settings.js';

const TYPE_BY_NUMBER = {
  '001': 'grass', '003': 'grass', '004': 'fire', '006': 'fire', '007': 'water', '009': 'water',
  '012': 'grass', '023': 'dark', '024': 'dark', '025': 'electric', '027': 'fighting', '035': 'fairy',
  '037': 'fire', '043': 'grass', '052': 'colorless', '054': 'water', '059': 'fire', '062': 'water',
  '080': 'psychic', '087': 'water', '093': 'dark', '094': 'dark', '123': 'grass', '130': 'water',
  '131': 'water', '132': 'colorless', '133': 'colorless', '134': 'water', '135': 'electric',
  '143': 'colorless', '144': 'water', '145': 'electric', '149': 'dragon', '150': 'psychic',
  '151': 'psychic', '175': 'fairy', '196': 'psychic', '197': 'dark', '245': 'water',
  '249': 'psychic', '250': 'fire', '251': 'grass', '257': 'fighting', '282': 'fairy',
  '384': 'dragon', '385': 'steel', '448': 'steel', '488': 'psychic', '493': 'colorless', '570': 'dark',
};

function characterFor(entry) {
  const dex = String(entry.dex || entry.id).padStart(3, '0');
  const type = TYPE_BY_NUMBER[dex] || 'colorless';
  const template = POKEMON_CARDS.find((item) => item.id === type) || POKEMON_CARDS[0];
  return {
    ...template,
    number: dex,
    name: entry.english || entry.name,
    chinese: entry.name,
    shiny: Boolean(entry.shiny),
    rarity: entry.shiny ? 'SECRET RARE · AURORA EDITION' : template.rarity,
  };
}

class AdoptedCardScene extends PokemonCardScene {
  createModel() {
    this.modelSize = 2.2;
    this.modelDepth = 12;
    this.bodyCenterOffset = 0;
    this.loadToken = 0;
    this.displaySettings = getDisplaySettings();
    this.cardZoom = this.cardZoomTarget = 1;
  }

  bindEvents() {
    super.bindEvents();
    this.card.addEventListener('wheel', event => {
      if (!this.cardInteractive) return;
      event.preventDefault(); event.stopPropagation();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
      this.cardZoomTarget = THREE.MathUtils.clamp(this.cardZoomTarget * Math.exp(-delta * .0013), .8, 1.5);
    }, { passive: false, signal: this.abortController.signal });
  }

  clearModel() {
    this.mixer = null;
    if (this.model) this.scene.remove(this.model);
    this.model = null;
  }

  adoptModel(model, mixer) {
    this.clearModel();
    this.updateModelEffects = model.userData.updateEffects;
    this.model = new THREE.Group();
    this.model.position.set(0, 0, -this.modelDepth);
    this.scene.add(this.model);
    model.removeFromParent();
    model.scale.setScalar(1);
    model.position.set(0, 0, 0);
    mixer?.update(0);
    model.updateMatrixWorld(true);
    model.traverse((object) => {
      object.layers.set(0);
      if (!object.isMesh) return;
      if (/tuta|vine/i.test(object.name)) { object.visible = false; if (object.parent?.userData.vineVisibilityGate) object.parent.visible = false; }
      object.frustumCulled = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.envMapIntensity = 0.7;
        material.depthWrite = !material.transparent;
      }
    });
    const rawBounds = model.userData.cardBounds || measureModelBounds(model);
    const yaw = (Number(this.character.number) % 2 ? -1 : 1) * Math.PI / 6;
    const turn = new THREE.Group(); turn.rotation.y = yaw; turn.add(model);
    const rotation = new THREE.Matrix4().makeRotationY(yaw);
    const points = rawBounds.outline || [rawBounds.min, rawBounds.max];
    const outline = points.map(p => new THREE.Vector3().fromArray(p).applyMatrix4(rotation).toArray());
    const rotated = new THREE.Box3().setFromPoints(outline.map(p => new THREE.Vector3().fromArray(p)));
    this.frameBounds = { min: rotated.min.toArray(), max: rotated.max.toArray(), outline };
    this.portraitYaw = yaw;
    const pivot = new THREE.Group();
    pivot.add(turn);
    this.model.add(pivot);
    this.centerPivot = pivot;
    this.cameraTarget.set(0, 0, -this.modelDepth);
    this.fitModel();
    this.mixer = mixer;
    this.card.dataset.modelReady = 'true';
  }

  fitModel() {
    if (!this.frameBounds || !this.centerPivot) return;
    const fit = fitCardBounds(this.frameBounds, this.camera.fov, this.camera.aspect, this.cameraBase.z + this.modelDepth);
    this.centerPivot.position.copy(fit.center).negate();
    this.fittedScale = fit.scale;
    this.model.scale.setScalar(fit.scale * this.displaySettings.modelScale);
  }
  resize() { if(this.mobileSurface)this.mobileSurface.resize();else super.resize();this.fitModel(); }

  updatePortraitView(delta) {
    this.updateModelEffects?.(this.elapsed);
    const desired = getDisplaySettings();
    this.displaySettings.parallaxDepth = THREE.MathUtils.damp(this.displaySettings.parallaxDepth, desired.parallaxDepth, 10, delta);
    this.displaySettings.modelScale = THREE.MathUtils.damp(this.displaySettings.modelScale, desired.modelScale, 10, delta);
    this.cardZoom = THREE.MathUtils.damp(this.cardZoom, this.cardZoomTarget, 10, Math.min(delta, .05));
    this.card.style.setProperty('--card-zoom', this.cardZoom*(this.mobileSurface?.fit||1));
    const x = this.current.x, y = this.current.y;
    this.card.style.setProperty('--rotate-x', `${-y * 24}deg`);
    this.card.style.setProperty('--rotate-y', `${x * 36}deg`);
    this.card.style.setProperty('--glare-x', `${50 + x * 30}%`);
    this.card.style.setProperty('--glare-y', `${35 + y * 25}%`);
    // The card viewport is a fixed window at z=0. A parallel, off-axis camera
    // preserves that window while depth separates the portrait and star layers.
    const depth = this.displaySettings.parallaxDepth;
    const eyeX = -x * .8 * depth, eyeY = y * .55 * depth;
    this.camera.position.set(eyeX, eyeY, this.cameraBase.z);
    this.camera.quaternion.identity();
    this.camera.updateProjectionMatrix();
    const halfHeight = this.cameraBase.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.projectionMatrix.elements[8] = -eyeX / (halfHeight * this.camera.aspect);
    this.camera.projectionMatrix.elements[9] = -eyeY / halfHeight;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    if (this.model) {
      this.model.rotation.set(0, 0, 0);
      if (this.fittedScale) this.model.scale.setScalar(this.fittedScale * this.displaySettings.modelScale);
    }
  }
}

const icons = `
  <symbol id="holo-type-electric" viewBox="0 0 40 40"><path d="M24 1 6 23h11l-3 16 21-25H23l1-13Z" /></symbol>
  <symbol id="holo-type-grass" viewBox="0 0 40 40"><path d="M33 3C17 4 5 13 6 26c1 12 15 14 23 6 7-7 6-20 4-29ZM10 34c5-12 11-18 20-24-7 8-11 15-14 25l-6-1Z" /></symbol>
  <symbol id="holo-type-fire" viewBox="0 0 40 40"><path d="M22 2c3 8-4 10-1 17 3-3 6-5 8-10 7 7 9 15 5 22-4 8-13 10-20 6C2 32 1 21 10 11c-1 7 1 10 5 11-3-9 2-15 7-20Z" /></symbol>
  <symbol id="holo-type-water" viewBox="0 0 40 40"><path d="M20 2c-4 8-13 16-13 24a13 13 0 0 0 26 0c0-8-9-16-13-24Z" /></symbol>
  <symbol id="holo-type-fighting" viewBox="0 0 40 40"><rect x="4" y="8" width="6" height="17" rx="3" /><rect x="11" y="4" width="6" height="20" rx="3" /><rect x="18" y="4" width="6" height="20" rx="3" /><rect x="25" y="7" width="6" height="18" rx="3" /><path d="M6 19h24v7c0 7-4 12-11 12h-4c-6 0-10-4-10-10v-4c0-3 1-5 1-5Z" /></symbol>
  <symbol id="holo-type-colorless" viewBox="0 0 40 40"><path d="M20 1c2 11 8 17 19 19-11 2-17 8-19 19-2-11-8-17-19-19C12 18 18 12 20 1Z" /></symbol>
  <symbol id="holo-type-steel" viewBox="0 0 40 40"><path d="M5 7h30l-4 17-11 14L9 24 5 7Zm9 7 3 12h6l3-12H14Z" /></symbol>
  <symbol id="holo-type-psychic" viewBox="0 0 40 40"><path fill-rule="evenodd" d="M2 20c5-8 11-12 18-12s13 4 18 12c-5 8-11 12-18 12S7 28 2 20Zm18 7a7 7 0 1 0 0-14 7 7 0 0 1 0 6Zm0-4a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" /></symbol>
  <symbol id="holo-type-dark" viewBox="0 0 40 40"><path d="M28 3A17 17 0 1 0 36 33 19 19 0 0 1 28 3Z" /></symbol>
  <symbol id="holo-type-dragon" viewBox="0 0 40 40"><path fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" d="M29 5C16 2 5 10 6 22c1 10 12 14 20 8 6-4 5-12-1-15-5-3-11 0-10 5 1 4 6 4 8 1" /></symbol>
  <symbol id="holo-type-fairy" viewBox="0 0 40 40"><path d="m20 2 4 11 12-4-4 11 7 9-12 1-7 10-7-10-12-1 7-9-4-11 12 4 4-11Z" /></symbol>
`;

function markup() {
  const icon = (id) => `<svg class="type-glyph"><use data-icon="${id}" href="#holo-type-colorless" /></svg>`;
  return `
    <article class="pokemon-card" tabindex="0">
      <header class="card-header"><span class="basic-pill" data-field="basic">BASIC</span><h1><span data-field="name"></span> <em>ex</em></h1><div class="card-hp"><span>HP</span><strong data-field="hp"></strong><i class="energy-icon">${icon('type')}</i></div></header>
      <div class="card-viewport"><div class="viewport-sheen"></div><span class="art-label" data-field="art"></span><span class="rarity-mark">✦</span></div>
      <section class="attack-panel"><div class="attack-heading"><div class="attack-cost"><i>${icon('type')}</i><i>${icon('type')}</i></div><h2 data-field="attack"></h2><strong data-field="damage"></strong></div><p><span data-field="attackText"></span> <span>${icon('type')}</span></p></section>
      <div class="card-stats"><div><span>weakness</span><strong><i class="fighting-icon">${icon('weakness')}</i> +20</strong></div><div><span>retreat</span><strong><i class="retreat-icon">${icon('retreat')}</i></strong></div></div>
      <div class="ex-rule"><strong>EX rule</strong><span>When your Pokémon ex is Knocked Out, your opponent gets 2 points.</span></div>
      <footer class="card-footer"><span data-field="number"></span><span data-field="rarity"></span></footer>
      <div class="shiny-flow"></div><div class="shiny-stars"></div><div class="card-glare"></div>
    </article>
  `;
}

// Idle loop, interrupted every few seconds by one randomly chosen action (never the same
// one twice running), cross-faded in and back out.
function performOccasionally(mixer, idle, clips) {
  const actions = clips.map(clip => {
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true; // hold the last frame while blending back to idle
    return action;
  });
  let wait = .9 + Math.random() * .8, current = null, last = null;
  mixer.addEventListener('finished', event => {
    if (event.action !== current) return;
    idle.reset().play();
    idle.crossFadeFrom(current, .45, false);
    current = null;
    wait = 4.5 + Math.random() * 4.5;
  });
  const update = mixer.update.bind(mixer);
  mixer.update = delta => {
    if (!current && (wait -= delta) <= 0) {
      const choices = actions.length > 1 ? actions.filter(action => action !== last) : actions;
      current = last = choices[Math.floor(Math.random() * choices.length)];
      current.reset().play();
      current.crossFadeFrom(idle, .35, false);
    }
    return update(delta);
  };
}

export class HoloCard {
  constructor(container, entry, model, animation, { manualPreview = false } = {}) {
    this.entry = entry;
    this.element = document.createElement('div');
    this.element.className = 'holo-card-host';
    this.element.innerHTML = `<svg class="svg-sprite"><defs>${icons}</defs></svg><div class="holo-card-positioner">${markup()}<div class="holo-card-back" aria-hidden="true"><span>CAPSULE WORKS</span><i></i><span>POKÉMON COLLECTION</span></div></div>`;
    container.appendChild(this.element);
    this.positioner = this.element.querySelector('.holo-card-positioner');
    this.cardElement = this.element.querySelector('.pokemon-card');
    const character = characterFor(entry);
    this.character = character;
    this.element.style.setProperty('--type-primary', character.theme.primary);
    this.element.style.setProperty('--type-secondary', character.theme.secondary);
    this.element.style.setProperty('--type-dark', character.theme.dark);
    this.element.style.setProperty('--gold', character.theme.primary);
    this.cardElement.classList.toggle('is-shiny', Boolean(entry.shiny));
    const field = (name, value) => { this.element.querySelector(`[data-field="${name}"]`).textContent = value; };
    field('basic', entry.shiny ? 'SHINY ✦' : 'BASIC');
    field('name', character.name);
    field('hp', character.hp);
    field('art', `${entry.shiny ? 'AURORA' : character.type.toUpperCase()} SPACE / ${character.number}`);
    field('attack', character.attack);
    field('damage', character.damage);
    field('attackText', character.attackText);
    field('number', `${character.number} / COLLECTION`);
    field('rarity', character.rarity || 'HOLOGRAPHIC · TYPE SERIES');
    this.element.querySelectorAll('[data-icon="type"]').forEach((node) => node.setAttribute('href', `#holo-type-${character.type}`));
    this.element.querySelector('[data-icon="weakness"]').setAttribute('href', `#holo-type-${character.weakness}`);
    this.element.querySelector('[data-icon="retreat"]').setAttribute('href', '#holo-type-colorless');
    this.cardElement.setAttribute('aria-label', `${entry.name}三维全息卡牌。按住鼠标左键或触摸拖动以倾斜卡牌。`);
    for (let index = 0; index < 18; index += 1) {
      const star = document.createElement('span');
      star.style.left = `${6 + ((index * 37) % 88)}%`;
      star.style.top = `${5 + ((index * 53) % 89)}%`;
      star.style.setProperty('--star-size', `${7 + (index % 4) * 4}px`);
      star.style.animationDelay = `${(index % 6) * -0.31}s`;
      this.element.querySelector('.shiny-stars').appendChild(star);
    }
    this.scene = new AdoptedCardScene(this.cardElement, this.element.querySelector('.card-viewport'));
    this.scene.character = character;
    this.scene.externallyDriven = manualPreview;
    this.scene.init();
    const mixer = new THREE.AnimationMixer(model);
    const idle = animation ? mixer.clipAction(animation).play() : null;
    const actions = (model.userData.cardActions || []).filter(clip => clip && clip !== animation);
    if (idle && actions.length) performOccasionally(mixer, idle, actions);
    this.scene.adoptModel(model, mixer);
    this.setInteractive(false);
    this.setEntrance(0);
    this.surfaceReady = prepareCardSurface(this).then(surface => {
      if(this.disposed)return;
      this.cardSurface = surface;
      if(mobileEdition&&!this.scene.externallyDriven)this.enableMobileSurface();
    }).catch(error => console.warn('卡面缓存准备失败', error));
  }

  enableMobileSurface(){
    if(!mobileEdition||!this.cardSurface||this.scene.mobileSurface||this.disposed)return;
    this.scene.onMobileSurfaceResize=()=>{if(this.scene.cardInteractive)this.setEntrance(1);};
    this.scene.mobileSurface=new MobileCardSurface(this.scene,this.cardSurface,this.cardElement);
    this.scene.renderFrame(0);
  }

  setInteractive(enabled) {
    if(enabled)this.enableMobileSurface();
    this.scene.cardInteractive = enabled;
    this.cardElement.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  setEntrance(progress, start = null) {
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const spin = 1 - Math.pow(1 - t, 2.2);
    const yaw = -1080 * (1 - spin);
    // Explicit face selection also works when compositing/opacity flattens CSS 3D.
    const frontFacing = Math.cos(THREE.MathUtils.degToRad(yaw)) >= 0;
    this.cardElement.style.visibility = frontFacing ? 'visible' : 'hidden';
    this.positioner.querySelector('.holo-card-back').style.visibility = frontFacing ? 'hidden' : 'visible';
    const x = start ? start.x + (window.innerWidth * 0.5 - start.x) * eased : window.innerWidth * 0.5;
    const y = (start ? start.y + (window.innerHeight * 0.5 - start.y) * eased : window.innerHeight * 0.5)
      - Math.sin(Math.PI * t) ** 2 * Math.min(45, window.innerHeight * .06);
    this.positioner.style.left = `${x}px`;
    this.positioner.style.top = `${y}px`;
    this.positioner.style.opacity = String(THREE.MathUtils.smoothstep(t, 0, .12));
    this.positioner.style.transform = `translate(-50%, -50%) perspective(900px) scale(${.025 + eased * .975}) rotateY(${yaw}deg) rotateX(${12 * Math.sin(Math.PI * t)}deg) rotateZ(${-8 * Math.sin(Math.PI * t)}deg)`;
  }

  beginReturn() {
    const rect = this.positioner.getBoundingClientRect();
    const target = document.querySelector('#pack-button').getBoundingClientRect();
    this.returnPath = {
      x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
      targetX: target.left + target.width / 2, targetY: target.top + target.height / 2,
    };
    this.setInteractive(false);
    this.recallEffect = playCardRecall(this.returnPath, Boolean(this.entry.shiny));
  }

  setReturn(progress) {
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    this.recallEffect?.setProgress(t);
    const eased = t * t * (3 - 2 * t);
    // Three quick turns over the existing flight, easing into the Pokédex.
    const yaw = 1080 * eased;
    const frontFacing = Math.cos(THREE.MathUtils.degToRad(yaw)) >= 0;
    this.cardElement.style.visibility = frontFacing ? 'visible' : 'hidden';
    this.positioner.querySelector('.holo-card-back').style.visibility = frontFacing ? 'hidden' : 'visible';
    const path = this.returnPath;
    this.positioner.style.left = `${path.x + (path.targetX - path.x) * eased}px`;
    this.positioner.style.top = `${path.y + (path.targetY - path.y) * eased}px`;
    this.positioner.style.opacity = String(1 - THREE.MathUtils.smoothstep(progress, .84, 1));
    this.positioner.style.transform = `translate(-50%, -50%) perspective(900px) scale(${1 - eased * 0.94}) rotateY(${yaw}deg) rotateX(${10 * Math.sin(Math.PI * t)}deg) rotateZ(${-12 * eased}deg)`;
  }

  captureCanvas({ preview = false, delta = 0 } = {}) {
    const scene = this.scene;
    if(scene.mobileSurface){
      scene.renderFrame(delta);
      const canvas=this.captureSurface||=document.createElement('canvas');
      const f=this.cardSurface,scale=preview?1:2;
      if(canvas.width!==f.width*scale||canvas.height!==f.height*scale){canvas.width=f.width*scale;canvas.height=f.height*scale;}
      canvas.getContext('2d').drawImage(scene.renderer.domElement,0,0,canvas.width,canvas.height);
      return canvas;
    }
    if (scene.externallyDriven) scene.renderFrame(delta);
    else scene.studioEffect.render(scene.scene, scene.camera, { rainbow: this.entry.shiny, time: scene.elapsed });
    const canvas = this.captureSurface ||= document.createElement('canvas');
    const scale = preview ? 1 : 2;
    const targetWidth = this.cardSurface ? Math.round(this.cardSurface.width * scale) : 600;
    const targetHeight = this.cardSurface ? Math.round(this.cardSurface.height * scale) : 850;
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) { canvas.width = targetWidth; canvas.height = targetHeight; }
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (this.cardSurface) {
      const f = this.cardSurface;

      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.drawImage(f.frame, 0, 0, f.width, f.height);
      context.save(); context.beginPath(); context.roundRect(f.x, f.y, f.w, f.h, 4); context.clip();
      context.drawImage(scene.renderer.domElement, f.x, f.y, f.w, f.h);
      context.restore();
      context.drawImage(f.overlay, f.x - 2, f.y - 2, f.w + 4, f.h + 4);
      context.setTransform(1, 0, 0, 1, 0, 0);
      return canvas;
    }
    const theme = this.character.theme;
    const border = context.createLinearGradient(0, 0, 600, 850);
    border.addColorStop(0, theme.primary);
    border.addColorStop(0.5, theme.secondary);
    border.addColorStop(1, theme.primary);
    context.fillStyle = border;
    context.beginPath();
    context.roundRect(0, 0, 600, 850, 32);
    context.fill();
    context.fillStyle = theme.dark;
    context.fillRect(12, 12, 576, 826);
    context.fillStyle = '#f7f4ed';
    context.font = '34px Paytone, sans-serif';
    context.fillText(this.character.name, 32, 66);
    context.fillStyle = theme.primary;
    context.font = '22px sans-serif';
    context.fillText(this.entry.shiny ? 'SHINY ✦' : this.character.type.toUpperCase(), 32, 102);
    context.drawImage(scene.renderer.domElement, 28, 122, 544, 510);
    context.fillStyle = '#f7f4ed';
    context.font = '28px Paytone, sans-serif';
    context.fillText(this.character.attack, 36, 692);
    context.fillStyle = theme.primary;
    context.font = '26px sans-serif';
    context.fillText(this.character.damage, 470, 692);
    context.fillStyle = '#c4cbd5';
    context.font = '16px sans-serif';
    context.fillText(this.character.attackText, 36, 734, 520);
    context.fillStyle = '#9aa9b8';
    context.font = '15px monospace';
    context.fillText(`${this.character.number} · HOLOGRAPHIC COLLECTION`, 36, 802);
    return canvas;
  }

  capture() {
    return this.captureCanvas().toDataURL('image/jpeg', 0.88);
  }

  dispose() {
    this.disposed=true;
    this.recallEffect?.stopIfIncomplete();
    this.scene.dispose();
    this.scene.renderer.forceContextLoss();
    this.element.remove();
  }
}

