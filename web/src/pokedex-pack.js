import { mobileEdition, mobilePerformance } from './mobile-performance.js';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { findByKey } from './assets.js';
import { HoloCard } from './holo-card.js';
import './pokedex-pack.css';
import { repairPokedexDpad } from './pokedex-outline.js';

const smooth = (value) => THREE.MathUtils.smoothstep(value, 0, 1);

function roundedCard(width, height, radius, depth = 0) {
  const x = -width / 2, y = -height / 2, s = new THREE.Shape();
  s.moveTo(x + radius, y); s.lineTo(x + width - radius, y);
  s.quadraticCurveTo(x + width, y, x + width, y + radius);
  s.lineTo(x + width, y + height - radius);
  s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  s.lineTo(x + radius, y + height);
  s.quadraticCurveTo(x, y + height, x, y + height - radius);
  s.lineTo(x, y + radius); s.quadraticCurveTo(x, y, x + radius, y);
  const g = depth ? new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 }) : new THREE.ShapeGeometry(s, 8);
  if (depth) g.translate(0, 0, -depth / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + width / 2) / width, (p.getY(i) + height / 2) / height);
  return g;
}

export class PokedexPack {
  constructor({ asset, store, library, button, onSelect, onViewChange }) {
    this.store = store;
    this.button = button;
    this.library = library;
    this.button.setAttribute('aria-label', '打开宝可梦图鉴');
    this.dockHovered = false;
    this.dockHover = 0;
    this.button.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') this.dockHovered = true;
    });
    this.button.addEventListener('pointerleave', () => { this.dockHovered = false; });
    this.button.addEventListener('pointercancel', () => { this.dockHovered = false; });
    window.addEventListener('blur', () => { this.dockHovered = false; });
    this.tilt = new THREE.Vector2();
    this.tiltTarget = new THREE.Vector2();
    this.previewToken = 0;
    this.previewClock = 0;
    this.previewCache = new Map();
    this.thumbnailCache = new Map();
    this.previewPending = new Map();
    this.previewUse = 0;
    this.onSelect = onSelect;
    this.onViewChange = onViewChange;
    this.scene = new THREE.Scene();
    // The viewer lives around z=-12. A tighter phone depth range separates the
    // closely stacked card faces on WebViews with lower precision depth buffers.
    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 50);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobilePerformance ? 1 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .85;
    this.renderer.setClearColor(0, 0);
    this.renderer.domElement.className = 'pokedex-canvas';
    document.querySelector('#app').appendChild(this.renderer.domElement);
    const room = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = generator.fromScene(room, 0.04).texture;
    room.dispose();
    generator.dispose();
    this.scene.add(new THREE.HemisphereLight('#fff5eb', '#34313a', .65));
    const key = new THREE.DirectionalLight('#fff3e5', 2.4);
    key.position.set(-4, 6, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#e3edff', .65);
    fill.position.set(5, 3, 3);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffe5d0', 1.3);
    rim.position.set(-3, 3, -5);
    this.scene.add(rim);

    this.root = new THREE.Group();
    this.model = asset.scene;
    repairPokedexDpad(this.model);
    const treated = new Set();
    this.model.traverse(object => {
      if (!object.isMesh) return;
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (treated.has(material)) continue;
        treated.add(material); material.envMapIntensity = .8;
        if (/Vermilion|Raised red|Rear cover/.test(material.name)) {
          material.roughness = .28; material.metalness = .08;
          material.clearcoat = .38; material.clearcoatRoughness = .22;
        }
        if (/aluminium|Polished/.test(material.name)) { material.metalness = .85; material.roughness = .23; }
        if (/rubber|Charcoal/.test(material.name)) { material.roughness = .57; material.clearcoat = 0; }
        for (const key of ['map', 'normalMap', 'roughnessMap']) if (material[key]) material[key].anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      }
    });
    // Clone only the two lamp materials: the yellow logo and crown switch stay unchanged.
    for (const [key, color, intensity] of [
      ['domedcobaltscanner', '#168eff', 2.2],
      ['yellowactionkey', '#ffd34e', 2.0],
    ]) {
      const lamp = findByKey(this.model, key);
      if (lamp?.isMesh) {
        lamp.material = lamp.material.clone();
        lamp.material.emissive.set(color);
        lamp.material.emissiveIntensity = intensity;
        lamp.material.roughness = .24;
        lamp.material.metalness = .05;
      }
    }
    this.model.rotation.x = Math.PI / 2;
    this.root.add(this.model);
    this.scene.add(this.root);
    const clips = asset.animations;
    const sequence = clips.length === 1 ? clips[0] : new THREE.AnimationClip('Pokedex sequence', Math.max(...clips.map((clip) => clip.duration)), clips.flatMap((clip) => clip.tracks));
    this.mixer = new THREE.AnimationMixer(this.model);
    this.action = this.mixer.clipAction(sequence);
    this.action.setLoop(THREE.LoopOnce, 1);
    this.action.clampWhenFinished = true;
    this.action.play();
    this.openAmount = 0;
    this.setOpenAmount(1);
    this.root.updateMatrixWorld(true);
    const openBounds = new THREE.Box3().setFromObject(this.model);
    const openSize = openBounds.getSize(new THREE.Vector3());
    this.openWidth = openSize.x;
    this.openHeight = openSize.y;
    this.openCenter = openBounds.getCenter(new THREE.Vector3());
    this.setOpenAmount(0);
    this.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.model);
    this.closedOffset = bounds.getCenter(new THREE.Vector3()).sub(this.openCenter);
    // Fixed model origin throughout opening: the hinge moves, the chassis does not.
    this.model.position.copy(this.openCenter).negate();
    this.modelHeight = bounds.getSize(new THREE.Vector3()).y;
    this.cardStack = new THREE.Group();
    this.cardStack.name = 'Pokedex card stack';
    this.cardStack.position.set(-2.2, 1.38, .04);
    this.cardStack.rotation.x = -Math.PI / 2;
    const left = findByKey(this.model, 'leftunitfixedchassis');
    if (!left) throw new Error('图鉴左侧卡牌面板缺失');
    left.add(this.cardStack);
    this.cardStack.visible = false;
    this.selectedIndex = 0;
    this.viewer = false;
    this.fly = 0;
    this.receiving = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.wheelAccumulator = 0;
    this.closeButton = document.createElement('button');
    this.closeButton.className = 'side-action pokedex-close';
    this.closeButton.setAttribute('aria-label', '合上图鉴');
    this.closeButton.innerHTML = '<span>▣</span><strong>合上图鉴</strong><small>回到扭蛋工坊</small>';
    this.closeButton.addEventListener('click', () => this.closeViewer());
    document.querySelector('#app').appendChild(this.closeButton);
    this.hint = document.createElement('div');
    this.hint.className = 'pokedex-hint';
    document.querySelector('#app').appendChild(this.hint);
    this.nav = document.createElement('div');
    this.nav.className = 'pokedex-scroll-nav';this.nav.hidden=true;
    this.nav.innerHTML = '<button aria-label="上一张卡牌"><svg class="double-chevron" viewBox="0 0 32 36" aria-hidden="true"><path d="m7 15 9-9 9 9 M7 29l9-9 9 9"/></svg></button><svg class="scroll-mouse" viewBox="0 0 24 32" aria-hidden="true"><rect x="5" y="2" width="14" height="27" rx="7"/><path class="scroll-wheel" d="M12 7v6"/></svg>';
    [...this.nav.querySelectorAll('button')].forEach((b,i)=>b.addEventListener('click',()=>{if(this.cardSwitch)this.queuedCardDirection=i?1:-1;else this.switchCard(i?1:-1);}));
    document.querySelector('#app').appendChild(this.nav);
    this.bindPointerEvents();
    this.previewHost = document.createElement('div');
    this.previewHost.className = 'pokedex-live-preview';
    this.previewHost.setAttribute('aria-hidden', 'true');
    this.previewHost.inert = true;
    document.body.appendChild(this.previewHost);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  bindPointerEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('wheel', (event) => {
      if (!this.viewer || this.transition || this.opening || this.cardReveal || this.selection || this.openAmount < 0.98 || !this.store.cards.length) return;
      event.preventDefault();
      this.wheelAccumulator += event.deltaY;
      if (Math.abs(this.wheelAccumulator) < 30) return;
      const direction = Math.sign(this.wheelAccumulator);
      this.wheelAccumulator = 0;
      if (this.cardSwitch) { this.queuedCardDirection = direction; return; }
      this.switchCard(direction);
    }, { passive: false });
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.viewer || this.transition || this.selection) return;
      this.tiltTarget.copy(this.tilt);
      this.pointerStart = { x: event.clientX, y: event.clientY, tilt: this.tilt.clone(), moved: false };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.pointerStart || !this.viewer || this.transition || this.opening || this.selection) return;
      const dx = event.clientX - this.pointerStart.x, dy = event.clientY - this.pointerStart.y;
      if (Math.hypot(dx, dy) > 5) this.pointerStart.moved = true;
      this.tiltTarget.set(
        THREE.MathUtils.clamp(this.pointerStart.tilt.x + dy * .0028, -.24, .24),
        THREE.MathUtils.clamp(this.pointerStart.tilt.y + dx * .0028, -.36, .36));
    });
    canvas.addEventListener('pointerup', (event) => {
      const start = this.pointerStart;
      this.pointerStart = null;
      this.tiltTarget.set(0, 0);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!start || start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      if (!this.viewer || this.transition || this.opening || this.cardReveal || this.cardSwitch || this.selection || this.openAmount < 0.98 || !this.store.cards.length) return;
      const rect = canvas.getBoundingClientRect();
      this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObject(this.root, true);
      if (!hits.length) return;
      let object = hits[0].object;
      while (object && object !== this.root) {
        if (Number.isInteger(object.userData.cardIndex)) {
          if (this.selectedIndex !== object.userData.cardIndex) {
            this.selectedIndex = object.userData.cardIndex;
            this.updateStack();
          }
          this.selectCard();
          return;
        }
        object = object.parent;
      }
    });
    const returnToFront = () => { this.pointerStart = null; this.tiltTarget.set(0, 0); };
    canvas.addEventListener('pointercancel', returnToFront);
    canvas.addEventListener('lostpointercapture', returnToFront);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (!width || !height) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, mobilePerformance ? 1 : 1.75);
    if (this.renderer.getPixelRatio() !== pixelRatio) this.renderer.setPixelRatio(pixelRatio);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.forceDockRender=true;
  }

  setOpenAmount(value) {
    this.openAmount = THREE.MathUtils.clamp(value, 0, 1);
    // Blender frame 70 is fully shut; frame 128 is fully open (glTF starts at frame 1).
    const seconds = (69 + 58 * this.openAmount) / 30;
    this.mixer.setTime(seconds);
    if (this.cardStack) this.cardStack.visible = this.viewer && !this.cardDetached && this.store.cards.length > 0;
  }

  screenPosition(x, y) {
    const point = new THREE.Vector3(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0.5).unproject(this.camera);
    const direction = point.sub(this.camera.position);
    return direction.multiplyScalar((-12 - this.camera.position.z) / direction.z).add(this.camera.position);
  }

  updatePose() {
    const button = this.button.getBoundingClientRect();
    const packX = button.left + button.width / 2;
    // Match the adjacent ball icon: rise 5px and enlarge 8%. Apply this to
    // the 3D model, keeping the transparent click target stationary.
    const packY = button.top + button.height / 2 - 5 * this.dockHover;
    const x = THREE.MathUtils.lerp(packX, window.innerWidth * 0.5, this.fly);
    const y = THREE.MathUtils.lerp(packY, window.innerHeight * 0.5, this.fly);
    const centerPixels = Math.min(window.innerHeight * 0.74, 680, window.innerWidth * 0.80 * this.openHeight / this.openWidth);
    const pixels = THREE.MathUtils.lerp(56 * (1 + .08 * this.dockHover), centerPixels, this.fly);
    const worldHeight = 24 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * pixels / window.innerHeight;
    this.root.position.copy(this.screenPosition(x, y));
    const scale = worldHeight / this.modelHeight;
    this.root.scale.setScalar(scale);
    this.root.position.x -= this.closedOffset.x * scale * (1 - this.fly);
    this.root.position.z -= this.closedOffset.z * scale * (1 - this.fly);
    this.root.rotation.set(this.tilt.x * this.fly, this.tilt.y * this.fly, 0, 'YXZ');
  }

  updateStack() {
    this.clearLiveCard();
    while (this.cardStack.children.length) {
      const child = this.cardStack.children[0];
      child.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach((material) => {
          this.disposeStackTexture(material.map);
          material.dispose();
        });
      });
      child.removeFromParent();
    }
    const count = this.store.cards.length;
    if (!count) return;
    this.selectedIndex = THREE.MathUtils.clamp(this.selectedIndex, 0, count - 1);
    // Bound GPU work for a large collection while preserving its stack thickness.
    const visible = Math.min(count, 8);
    const spacing = .034;
    const thickness = .022;
    for (let depth = visible - 1; depth >= 0; depth--) {
      const index = (this.selectedIndex + depth) % count;
      const card = this.store.cards[index];
      const group = new THREE.Group();
      group.userData.cardIndex = index; group.userData.depth = depth;
      const step = Math.min(depth, 7) * .105 + Math.max(0, depth - 7) * .012;
      group.position.set(0, step, (visible - 1 - depth) * spacing);
      group.userData.stackY = step;
      const edge = new THREE.MeshStandardMaterial({ color: '#141921', roughness: 0.62, metalness: 0.05 });
      const body = new THREE.Mesh(roundedCard(3.16, 4.48, .15, thickness), edge);
      let image=this.thumbnailCache.get(card.image);
      if(!image){
        image=new THREE.TextureLoader().load(card.image);image.colorSpace=THREE.SRGBColorSpace;
        image.anisotropy=4;image.generateMipmaps=false;image.minFilter=THREE.LinearFilter;
      }
      this.thumbnailCache.delete(card.image);this.thumbnailCache.set(card.image,image);
      const face = new THREE.Mesh(roundedCard(3.08, 4.40, .12), new THREE.MeshBasicMaterial({ map: image, toneMapped: false }));
      face.material.polygonOffset=true;face.material.polygonOffsetFactor=-1;face.material.polygonOffsetUnits=-2;
      face.position.z = thickness / 2 + .008;
      group.add(body, face);
      this.cardStack.add(group);
      if (!depth) { this.selectedFace = face; this.selectedGroup = group; }
    }
    this.previewReady = this.loadLiveCard(this.store.cards[this.selectedIndex]);
    const used=new Set(this.cardStack.children.flatMap(g=>g.children.map(o=>o.material?.map)));
    for(const [key,texture] of this.thumbnailCache){
      if(this.thumbnailCache.size<=16)break;
      if(used.has(texture))continue;
      this.thumbnailCache.delete(key);texture.dispose();
    }
    this.cardStack.visible = this.viewer;
    this.hint.textContent = `滚轮切换 · 拖拽轻转图鉴 · 点击卡牌查看  ${this.selectedIndex + 1} / ${count}`;
  }

  switchCard(direction) {
    const count = this.store.cards.length;
    if (!this.viewer || this.transition || this.opening || this.selection || count < 2 || !this.selectedGroup || this.cardSwitch) return;
    const outgoing = this.selectedGroup;
    const oldIndex = this.selectedIndex;
    const start = outgoing.position.clone();
    const widthScale = outgoing.scale.x;
    // Freeze the displayed face, including saved thumbnails during fast scrolling.
    // The departing snapshot must survive cache eviction until its fade completes.
    const source = this.selectedFace.material.map?.image;
    if (source?.width && source?.height && source.complete !== false) {
      const canvas = document.createElement('canvas');
      canvas.width = source.width; canvas.height = source.height;
      canvas.getContext('2d').drawImage(source, 0, 0);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.generateMipmaps = false; map.minFilter = THREE.LinearFilter;
      this.selectedFace.material.map = map;
      this.selectedFace.material.needsUpdate = true;
    }
    outgoing.removeFromParent();
    this.selectedIndex = (oldIndex + direction + count) % count;
    this.updateStack();
    this.cardStack.children.forEach(group => { group.scale.x = widthScale; });
    const resting = this.cardStack.children.find(group => group.userData.cardIndex === oldIndex);
    if (resting) resting.visible = false;
    this.cardStack.add(outgoing);
    // The departing face is an opaque snapshot, then gently fades above the
    // stack. Never move a solid black card body through the incoming face.
    outgoing.children.forEach(o=>{
      if(!o.material?.map){o.visible=false;return;}
      o.material.transparent=true;o.material.depthWrite=false;o.material.depthTest=false;
      o.renderOrder=100;
    });
    this.cardSwitch = { elapsed:0,outgoing,resting,start,direction,incoming:this.selectedGroup,
      incomingY:this.selectedGroup.position.y };
    this.selectedGroup.position.y-=.18;
  }

  updateCardSwitch(dt) {
    const state=this.cardSwitch;if(!state)return;
    state.elapsed+=dt;
    const t=Math.min(1,state.elapsed/.42),eased=smooth(t);
    state.outgoing.position.copy(state.start);
    state.outgoing.position.y+=.55*eased;
    state.outgoing.position.z+=.07;
    state.outgoing.children.forEach(o=>{if(o.material?.map)o.material.opacity=1-eased;});
    state.incoming.position.y=state.incomingY-.18*(1-eased);
    if(t===1){
      if(state.resting)state.resting.visible=true;
      state.outgoing.removeFromParent();
      state.outgoing.traverse(o=>{o.geometry?.dispose();this.disposeStackTexture(o.material?.map);o.material?.dispose();});
      this.cardSwitch=null;
      const queued=this.queuedCardDirection;this.queuedCardDirection=0;
      if(queued)this.switchCard(queued);
    }
  }

  disposeStackTexture(texture){
    if(!texture)return;
    if([...this.previewCache.values()].some(entry=>entry.texture===texture))return;
    if([...this.thumbnailCache.values()].includes(texture))return;
    texture.dispose();
  }

  clearLiveCard() {
    this.previewToken++;
    clearTimeout(this.previewWarmTimer);
    // Cached previews are paused and bounded; switching no longer tears down
    // and recreates a WebGL context for the same nearby card.
    this.liveCard=null;this.liveTexture=null;this.liveModel=null;
  }

  disposePreview(entry){
    entry.card.dispose();entry.texture.dispose();
    entry.model.traverse(o=>{
      if(o.isMesh)for(const m of [].concat(o.material))m.dispose();
      if(o.isPoints && o.name==='Shiny / floating star glints'){o.geometry.dispose();o.material.dispose();}
    });
  }

  trimPreviewCache(keep){
    const limit=mobileEdition?2:3;
    const entries=[...this.previewCache.entries()].sort((a,b)=>a[1].used-b[1].used);
    for(const [key,entry] of entries){
      if(this.previewCache.size<=limit)break;
      if(entry===keep || entry.card===this.liveCard)continue;
      this.previewCache.delete(key);this.disposePreview(entry);
    }
  }

  async preparePreview(card){
    const key=String(card.pokemonId);
    if(this.previewCache.has(key))return this.previewCache.get(key);
    if(this.previewPending.has(key))return this.previewPending.get(key);
    const job=(async()=>{
      const loaded=await this.library.instantiate(card.pokemonId);
      const releaseModel=()=>loaded.model.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))m.dispose();});
      // Expensive first-time setup happens after the card slide, while the saved
      // thumbnail is already visible. Fast scrolling skips intermediate models.
      while(this.viewer && (this.cardSwitch||this.transition||this.opening||this.previewBuilding))await new Promise(r=>setTimeout(r,40));
      const current=String(this.store.cards[this.selectedIndex]?.pokemonId);
      const next=String(this.store.cards[(this.selectedIndex+1)%this.store.cards.length]?.pokemonId);
      if(!this.viewer || (key!==current&&key!==next) || (this.selection&&key!==current)){releaseModel();return null;}
      this.previewBuilding=true;
      let live;
      try{
        live=new HoloCard(this.previewHost,loaded.entry,loaded.model,loaded.model.userData.cardAnimation||loaded.animation,{manualPreview:true});
        live.setEntrance(1);live.scene.renderer.setPixelRatio(1);live.scene.resize();
        await live.surfaceReady;
        await live.scene.renderer.compileAsync(live.scene.scene,live.scene.camera);
        if(!this.viewer){live.dispose();releaseModel();return null;}
        const texture=new THREE.CanvasTexture(live.captureCanvas({preview:true}));
        texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
        texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
        const entry={card:live,model:loaded.model,texture,used:++this.previewUse};
        this.previewCache.set(key,entry);this.trimPreviewCache(entry);return entry;
      }catch(error){live?.dispose();releaseModel();throw error;}
      finally{this.previewBuilding=false;}
    })();
    this.previewPending.set(key,job);
    try{return await job;}finally{this.previewPending.delete(key);}
  }

  async loadLiveCard(card) {
    const token=this.previewToken;
    try{
      const entry=await this.preparePreview(card);
      if(!entry||token!==this.previewToken||!this.viewer)return;
      this.liveCard=entry.card;this.liveModel=entry.model;this.liveTexture=entry.texture;entry.used=++this.previewUse;
      this.previewClock=0;
      const ratio=this.liveCard.cardElement.offsetWidth/this.liveCard.cardElement.offsetHeight;
      this.cardStack.children.forEach(group=>{group.scale.x=4.48*ratio/3.16;});
      this.disposeStackTexture(this.selectedFace.material.map);
      this.selectedFace.material.map=this.liveTexture;
      this.selectedFace.material.needsUpdate=true;
      this.trimPreviewCache(entry);
      clearTimeout(this.previewWarmTimer);
      this.previewWarmTimer=setTimeout(()=>{
        if(!this.viewer||this.selection||this.cardSwitch||token!==this.previewToken)return;
        const next=this.store.cards[(this.selectedIndex+1)%this.store.cards.length];
        if(next)this.preparePreview(next).catch(error=>console.warn('图鉴相邻卡牌预热失败',error));
      },700);
    }catch(error){console.warn('图鉴动态卡牌暂不可用',error);}
  }

  openViewer() {
    if (this.viewer || this.transition || this.opening || this.receiving) return;
    this.receiving = null;
    this.viewer = true;
    this.nav.hidden = true;
    this.cardDetached = false;
    this.cardReveal = null;
    this.cardStack.scale.setScalar(.0001);
    document.body.classList.add('pokedex-open');
    this.tilt.set(0, 0); this.tiltTarget.set(0, 0);
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.store.cards.length - 1));
    this.updateStack();
    this.button.classList.add('pokedex-viewing');
    this.closeButton.classList.add('visible');
    this.hint.classList.add('visible');
    if (!this.store.cards.length) this.hint.textContent = '图鉴暂无收藏卡牌';
    this.renderer.domElement.style.pointerEvents = 'auto';
    this.preparing = true;
    Promise.resolve(this.previewReady).then(() => {
      this.preparing = false;
      this.transition = { kind: 'fly-in', elapsed: 0, duration: 0.72, from: this.fly, to: 1 };
    });
    this.onViewChange(true);
  }

  closeViewer(card = null) {
    if (!this.viewer || this.preparing || this.transition || this.opening || this.cardReveal || this.cardSwitch || this.selection) return;
    this.selectedCard = card;
    this.tiltTarget.set(0, 0);
    this.transition = { kind: 'return', elapsed: 0, duration: 0.72, from: this.fly, to: 0 };
  }

  async selectCard() {
    if (this.selection || this.preparing || this.cardSwitch) return;
    this.selection = { phase: 'preparing', elapsed: 0 };
    this.closeButton.classList.remove('visible'); this.hint.classList.remove('visible');
    this.tiltTarget.set(0, 0);
    await this.previewReady;
    if (!this.liveCard) { this.selection = null; this.closeViewer(this.store.cards[this.selectedIndex]); return; }
    this.selection = { phase: 'collapse', elapsed: 0, saved: this.store.cards[this.selectedIndex] };
  }

  updateSelection(dt) {
    const state = this.selection;
    if (!state || state.phase === 'preparing') return;
    state.elapsed += dt;
    if (state.phase === 'collapse') {
      const t = smooth(state.elapsed / .34);
      this.cardStack.children.forEach(group => {
        if (group !== this.selectedGroup) group.position.y = group.userData.stackY * (1 - t);
      });
      if (t < 1) return;
      this.cardStack.children.forEach(group => { if (group !== this.selectedGroup) group.visible = false; });
      this.scene.attach(this.selectedGroup);
      this.cardDetached = true; this.cardStack.visible = false;
      state.phase = 'flight'; state.elapsed = 0;
      state.from = this.selectedGroup.position.clone();
      state.scale = this.selectedGroup.scale.clone();
      state.rotation = this.selectedGroup.quaternion.clone();
      const height = this.liveCard.cardElement.offsetHeight;
      const size = 24 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * height / window.innerHeight / 4.48;
      const ratio = this.liveCard.cardElement.offsetWidth / height;
      state.toScale = new THREE.Vector3(size * 4.48 * ratio / 3.16, size, size);
      this.transition = { kind: 'return', elapsed: 0, duration: .82, from: this.fly, to: 0 };
      this.renderer.domElement.style.pointerEvents = 'none';
    } else {
      const t = smooth(state.elapsed / .82);
      this.selectedGroup.position.lerpVectors(state.from, this.screenPosition(window.innerWidth / 2, window.innerHeight / 2), t);
      this.selectedGroup.scale.lerpVectors(state.scale, state.toScale, t);
      this.selectedGroup.quaternion.slerpQuaternions(state.rotation, new THREE.Quaternion(), t);
      if (t >= 1) {
        // Hand over the same live card, preserving its model animation and avoiding a reload.
        const prepared = this.liveCard;
        this.previewCache.delete(String(state.saved.pokemonId));
        clearTimeout(this.previewWarmTimer);
        this.liveCard = null; this.liveModel = null;
        prepared.scene.setExternalDriving(false);
        this.selectedGroup.removeFromParent();
        this.selectedGroup.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
        this.liveTexture?.dispose(); this.liveTexture = null;
        this.selection = null;
        document.body.classList.remove('pokedex-open');
        this.onSelect(state.saved, prepared);
        this.onViewChange(false);
      }
    }
  }

  receiveCard() {
    if (!this.viewer) { this.setOpenAmount(0); this.receiving = { elapsed: 0 }; }
  }

  update(dt) {
    const dockIdle = !this.viewer && !this.receiving && !this.transition && !this.opening;
    // The dock is a separate full-screen WebGL canvas. On phones its resting
    // image needs no recurring render; opening, collecting and resize invalidate it.
    if (mobileEdition && dockIdle && this.mobileDockCached && !this.forceDockRender) return;
    if (!dockIdle) this.mobileDockCached=false;
    const hoverTarget = dockIdle && (this.dockHovered || this.button.matches(':focus-visible')) ? 1 : 0;
    this.dockHover = THREE.MathUtils.damp(this.dockHover, hoverTarget, 16, Math.min(dt, .05));
    if (Math.abs(this.dockHover - hoverTarget) < .001) this.dockHover = hoverTarget;
    const tiltDamping = this.pointerStart ? 12 : 6;
    this.tilt.lerp(this.tiltTarget, 1 - Math.exp(-tiltDamping * Math.min(dt, .05)));
    if (!this.pointerStart && this.tilt.lengthSq() < 1e-8) this.tilt.set(0, 0);
    if (this.liveCard && this.liveTexture && !this.cardSwitch && (this.cardStack.visible || this.cardDetached)) {
      this.liveCard.scene.target.set(this.tilt.y * 1.5, -this.tilt.x * 1.5);
      this.previewClock += dt;
      if (this.previewClock >= 1 / (mobileEdition ? 15 : 20)) {
        const delta=this.previewClock;this.previewClock = 0;
        this.liveCard.captureCanvas({preview:true,delta});
        this.liveTexture.needsUpdate = true;
      }
    }
    if (this.cardReveal) {
      const t = Math.min(1, (this.cardReveal.elapsed += dt) / .72);
      const u = t - 1;
      // Ease-out back: rise from zero, overshoot by about 10%, then settle at full size.
      const scale = 1 + 2.70158 * u * u * u + 1.70158 * u * u;
      this.cardStack.scale.setScalar(Math.max(.0001, scale));
      if (t === 1) { this.cardStack.scale.setScalar(1); this.cardReveal = null; }
    }
    this.updateCardSwitch(dt);
    this.updateSelection(dt);
    if (this.receiving) {
      const time = this.receiving.elapsed += dt;
      let amount = 0;
      if (time < .65) amount = smooth(time / .65);
      else if (time < 1.1) amount = 1;
      else if (time < 1.8) amount = 1 - smooth((time - 1.1) / .7);
      else this.receiving = null;
      this.setOpenAmount(amount);
    }
    if (this.transition) {
      const transition = this.transition;
      transition.elapsed += dt;
      this.fly = THREE.MathUtils.lerp(transition.from, transition.to, smooth(transition.elapsed / transition.duration));
      if (transition.elapsed >= transition.duration) {
        this.fly = transition.to;
        this.transition = null;
        if (transition.kind === 'fly-in') this.opening = { elapsed: 0, from: this.openAmount, to: 1 };
        else if (transition.kind === 'return') this.opening = { elapsed: 0, from: this.openAmount, to: 0 };
      }
    }
    if (this.opening) {
      const animation = this.opening;
      animation.elapsed += dt;
      const progress = Math.min(1, animation.elapsed / 0.9);
      this.setOpenAmount(THREE.MathUtils.lerp(animation.from, animation.to, smooth(progress)));
      if (animation.to === 1 && progress >= .32 && !animation.revealStarted) {
        animation.revealStarted = true;
        if (this.viewer && this.store.cards.length) this.cardReveal = { elapsed: 0 };
      }
      if (progress >= 1) {
        this.opening = null;
        if (!animation.to && this.viewer) {
          this.viewer = false;
          document.body.classList.remove('pokedex-open');
          this.cardStack.visible = false;
          this.clearLiveCard();
          this.button.classList.remove('pokedex-viewing');
          this.closeButton.classList.remove('visible');
          this.hint.classList.remove('visible');
          this.renderer.domElement.style.pointerEvents = 'none';
          this.onViewChange(false);
          if (this.selectedCard) this.onSelect(this.selectedCard);
          this.selectedCard = null;
        }
      }
    }
    this.updatePose();
    // Loading a newly collected card precedes the fly-in. Keep the hint hidden
    // until the entire opening/reveal finishes, then anchor it in the same frame.
    this.nav.hidden = !this.viewer || !!this.preparing || !!this.receiving
      || !!this.selection || !!this.transition || !!this.opening || !!this.cardReveal
      || this.openAmount < .98 || !this.cardStack.visible || !this.store.cards.length
      || !this.selectedFace;
    if(!this.nav.hidden){
      // Follow the left edge of the actual card, not the viewport edge.
      this.selectedFace.updateWorldMatrix(true,false);
      const point=new THREE.Vector3(-1.54,0,0).applyMatrix4(this.selectedFace.matrixWorld).project(this.camera);
      const rect=this.renderer.domElement.getBoundingClientRect();
      this.nav.style.left=`${Math.max(22,rect.left+(point.x+1)*rect.width/2-30)}px`;
      this.nav.style.top=`${rect.top+(1-point.y)*rect.height/2}px`;
    }
    this.dockRenderTime = (this.dockRenderTime || 0) + dt;
    if (!mobilePerformance || !dockIdle || (mobileEdition && !this.mobileDockCached) || this.dockHover !== hoverTarget || this.dockRenderTime >= 1 / 12 || this.forceDockRender) {
      this.renderer.render(this.scene, this.camera);
      if (mobileEdition) this.mobileDockCached=dockIdle;
      this.dockRenderTime=0; this.forceDockRender=false;
    }
  }
}

