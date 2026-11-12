import { consumeNextPokemon } from './next-pokemon.js';
import * as THREE from 'three';
import { findAllByKey, findByKey } from './assets.js';
import { makeIconTexture, ICONS } from './icons.js';
import { OutputAnimator } from './output-animation.js';
import { ChamberOneShot } from './chamber.js';
import { FeedSupply } from './feed-supply.js';

import { prizeFlash, prepareReservoirBands, addRareGlow } from './prize-effects.js';
import { choosePrizeIcon } from './debug-settings.js';
export function chooseFinalIcon(random = Math.random) { return choosePrizeIcon(random); }

export class CapsuleMachine {
  constructor({ scene, model, ballTemplate, outputAnimation, chamberAnimation, supplyRoute, replacedParts = [], onQueue, onStatus, onOutputReady, onOutputCollected }) {
    this.scene = scene;
    this.root = model.scene;
    this.ballTemplate = ballTemplate;
    this.outputAnimator = new OutputAnimator(scene, outputAnimation);
    this.chamber = new ChamberOneShot(scene, chamberAnimation);
    this.onQueue = onQueue;
    this.onStatus = onStatus;
    this.onOutputReady = onOutputReady;
    this.onOutputCollected = onOutputCollected;
    this.scene.add(this.root);
    this.globe = [];
    this.outputs = [];
    this.spinning = false;
    this.dispensing = false;
    this.awaitingSupply = false;
    this.supplyHandedOff = false;
    this.spinTime = 0;
    this.spinCount = 0;
    this.beltOffset = 0;
    this.displayIndices = [];
    this.replacedParts = new Set(replacedParts);
    this.prepareModel();
    this.reservoirBands = prepareReservoirBands(this.scene);
    this.rareGlows = new Map();
    this.supply = new FeedSupply({
      scene,
      ballTemplate,
      routeData: supplyRoute,
      onCount: (count, full, supply) => this.onQueue(count, full, supply),
      onBelt: (offset) => {
        this.beltOffset = offset;
        this.updateBelt();
      },
      onHandoff: (mesh) => this.handleSupplyHandoff(mesh),
    });
  }

  prepareModel() {
    const groundMaterials = new Set();
    this.root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = !object.material?.transparent;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        material.envMapIntensity = 0.85;
        const isGround = /background|ground|apricot|fleece|floor|vanilla|butter/i.test(material.name);
        if (isGround && !groundMaterials.has(material)) {
          groundMaterials.add(material);
          material.color.multiplyScalar(1.12);
          if (material.map) {
            material.emissiveMap = material.map;
            material.emissive.set('#ffffff');
            material.emissiveIntensity = 0.07;
          }
        }
        [material.map, material.emissiveMap].forEach((texture) => {
          if (!texture) return;
          texture.anisotropy = isGround ? 16 : 8;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
        });
        if (material.transparent) material.depthWrite = false;
      });
      if (object.material?.transparent) object.castShadow = false;
    });
    this.replacedParts.forEach((name) => {
      if (/^OPT \/ (?:conveyor drive motor|motor cooling ring|motor terminal|conveyor pickup bell mouth|conveyor pickup seal|glass union clamp|clamp gasket)/.test(name)) return;
      if (['WEB / end roller.001', 'WEB / end bearing.002', 'WEB / end bearing.003'].includes(name)) return;
      findAllByKey(this.root, name).forEach((object) => { object.visible = false; });
    });
    ['cart', 'beacon', 'spare bin fitted liner'].forEach((key) => {
      findAllByKey(this.root, key).forEach((object) => { object.removeFromParent(); });
    });
    [
      'agitatorspindle', 'agitatorpaddle', 'meteringrotor', 'rotorindexingrib',
      'sealedlowercollector', 'lowercollectormountingfoot', 'lowercollectorscrew',
      'internaldropchannel',
    ].forEach((key) => {
      findAllByKey(this.root, key).forEach((object) => { object.visible = false; });
    });
    this.crank = findByKey(this.root, 'CrankPivot') || this.createCrankPivot();
    if (this.crank) this.crank.userData.action = 'spin';
    this.screens = [...findAllByKey(this.root, 'displayscreen'), ...findAllByKey(this.root, 'OLED')]
      .filter((object) => object.isMesh)
      .slice(0, 3);
    this.screens.forEach((screen, index) => {
      const texture = makeIconTexture(index);
      screen.material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.75, roughness: 0.3, metalness: 0.1 });
    });
    this.displayIndices = this.screens.map((_, index) => index);
    [...findAllByKey(this.root, 'rounddisplayicon'), ...findAllByKey(this.root, 'displaynumber')].forEach((object) => { object.visible = false; });
    this.indicator = findByKey(this.root, 'circularpushbutton001');
    if (this.indicator?.isMesh) {
      this.indicator.material = this.indicator.material.clone();
      this.indicator.material.emissive = new THREE.Color('#75f5df');
      this.indicator.material.emissiveIntensity = 0.8;
    }
    this.prepareBelt();
  }

  createCrankPivot() {
    const parts = findAllByKey(this.root, 'crank').concat(findAllByKey(this.root, 'handwheel')).filter((object, index, all) => all.indexOf(object) === index && !object.name.toLowerCase().includes('bearing'));
    if (!parts.length) return null;
    this.root.updateMatrixWorld(true);
    const pivot = new THREE.Group();
    pivot.name = 'CrankPivot';
    pivot.position.set(2.08, 2.74, 0.25);
    this.scene.add(pivot);
    parts.forEach((part) => pivot.attach(part));
    return pivot;
  }

  prepareBelt() {
    const slats = findAllByKey(this.root, 'webbeltslat').filter((object) => object.isMesh);
    if (!slats.length) return;
    this.root.updateMatrixWorld(true);
    this.slatData = slats.map((slat) => {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      slat.matrixWorld.decompose(position, quaternion, scale);
      return { position, quaternion, scale, source: slat };
    });
    this.slatMin = Math.min(...this.slatData.map((item) => item.position.x));
    this.slatMax = Math.max(...this.slatData.map((item) => item.position.x));
    // Keep Blender's dark/light material assignments while retaining instancing.
    const batches = new Map();
    for (const item of this.slatData) {
      const materials = Array.isArray(item.source.material) ? item.source.material : [item.source.material];
      const key = materials.map(material => material.uuid).join('/');
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(item);
    }
    this.slatBatches = [...batches.values()].map(items => {
      const source = items[0].source;
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, items.length);
      mesh.name = `Conveyor slats / ${Array.isArray(source.material) ? 'materials' : source.material.name}`;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      items.forEach((item, index) => { item.batch = mesh; item.instanceIndex = index; delete item.source; });
      return mesh;
    });
    slats.forEach((slat) => slat.removeFromParent());
    this.updateBelt();
  }

  get queue() { return this.supply.balls.filter((ball) => ball.admitted && !ball.releasing); }
  get incoming() { return this.supply.balls.filter((ball) => ball.admitted && ball.s < this.supply.route.headS - 0.002); }
  get track() { return this.supply.balls.filter((ball) => !ball.admitted); }
  get reserved() { return this.supply.count; }
  get busy() { return this.spinning || this.dispensing || this.awaitingSupply || this.chamber.playing || this.outputs.length >= 3; }

  spin() {
    this.onSpinInteraction?.();
    if (this.busy) {
      if (this.outputs.length >= 3) this.onStatus('出口已满 3 颗 · 请先取走一颗');
      return false;
    }
    if (!this.supply.count || this.supply.releaseRequested) {
      this.onStatus(this.supply.count ? '上一颗精灵球仍在交接中' : '顶部精灵球尚未就位 · 请稍候');
      return false;
    }
    this.spinning = true;
    this.dispensing = false;
    this.awaitingSupply = false;
    this.supplyHandedOff = false;
    this.spinTime = 0;
    this.topReleaseRequested = false;
    this.spinCount += 1;
    this.hasEjected = false;
    this.lastIconTick = -1;
    this.iconsAligned = false;
    this.shinyOutletStarted = false;
    this.forcedPokemon = consumeNextPokemon();
    this.finalIcon = this.forcedPokemon ? (this.forcedPokemon.shiny ? 1 : choosePrizeIcon(Math.random, 0)) : chooseFinalIcon();
    this.nextFocusRecord = { resultIcon: this.finalIcon, pokemonId: this.forcedPokemon?.id };
    this.onPrizeSelected?.(this.nextFocusRecord);
    this.chamber.start({
      onOutput: () => this.releaseOutputNow(),
      onComplete: () => this.completeChamber(),
    });
    this.onStatus(this.supply.headReady ? '把手转动中 · 正在选择宝可梦' : '把手转动中 · 等待队首停稳后释放');
    return true;
  }

  setDisplays(indices, final = false) {
    this.screens.forEach((screen, screenIndex) => {
      const oldMap = screen.material.map;
      const texture = makeIconTexture(indices[screenIndex], final);
      screen.material.map = texture;
      screen.material.emissiveMap = texture;
      screen.material.needsUpdate = true;
      oldMap?.dispose();
    });
    this.displayIndices = [...indices];
  }

  collectOutput(ball) {
    const index = this.outputs.indexOf(ball);
    if (index < 0 || index !== this.outputs.length - 1) return null;
    this.outputs.splice(index, 1);
    this.rareGlows.get(ball)?.dispose();
    this.rareGlows.delete(ball);
    const next = this.outputs[this.outputs.length - 1];
    if (next) next.userData.action = 'collect';
    // Chamber and outlet motion use authored collision clips; no live Rapier
    // bodies are created. Avoid downloading/initializing an unused physics world.
    ball.removeFromParent();
    this.onOutputCollected(ball);
    this.onStatus(this.outputs.length ? `出口已有 ${this.outputs.length} 颗 · 可继续扭蛋` : '输送带运行中');
    return ball;
  }

  detachOutput(ball) {
    const detached = this.collectOutput(ball);
    if (detached) this.scene.add(detached);
    return detached;
  }

  raycast(raycaster) {
    const ball = this.outputs[this.outputs.length - 1];
    if (ball) {
      ball.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(ball);
      const center = bounds.getCenter(new THREE.Vector3());
      const radius = Math.max(0.55, bounds.getSize(new THREE.Vector3()).length() * 0.5);
      if (raycaster.ray.intersectSphere(new THREE.Sphere(center, radius), new THREE.Vector3())) return { action: 'collect', ball };
    }
    if (this.crank) {
      const hits = raycaster.intersectObject(this.crank, true);
      if (hits.length) return { action: 'spin', ball: null };
    }
    return null;
  }

  notifyQueue() {
    this.supply.notifyCount();
  }

  update(dt) {
    this.supply.update(dt);
    this.updateSpin(dt);
    this.chamber.update(dt);
    this.outputAnimator.update(dt);
    this.rareGlows.forEach(effect => effect.update(dt));
  }

  handleSupplyHandoff(mesh) {
    if (!this.chamber.prepareIncoming(mesh)) throw new Error('顶部交接时玻璃舱尚未就绪');
    this.supplyHandedOff = true;
    this.awaitingSupply = false;
    if (this.chamber.outputFired) this.releaseOutputNow();
  }

  beginShinyOutlet() {
    if (this.shinyOutletStarted || this.finalIcon !== 1) return;
    this.shinyOutletStarted = true;
    this.onShinyOutletStart?.();
  }

  releaseOutputNow() {
    if (this.hasEjected) return;
    if (!this.supplyHandedOff && this.spinCount > 1) {
      this.awaitingSupply = true;
      this.onStatus('等待队首进入遮挡交接区');
      return;
    }
    this.awaitingSupply = false;
    this.hasEjected = true;
    this.dispensing = true;
    const shiny = this.finalIcon === 1;
    const ball = this.outputAnimator.play(this.outputs.length, (output) => this.finishOutput(output), shiny ? {
      lead: .45,
      onApproach: () => this.beginShinyOutlet(),
      onExit: () => this.onShinyOutletClear?.(),
    } : undefined);
    if (ball) {
      ball.userData.focusRecord = this.nextFocusRecord;
      ball.userData.resultIcon = this.finalIcon;
      ball.userData.pokemonId = this.forcedPokemon?.id;
      if (this.finalIcon === 1) this.rareGlows.set(ball, addRareGlow(ball));
    }
    this.onStatus('舱内扭蛋已落出 · 正在滚向出口');
  }

  completeChamber() {
    this.spinning = false;
    this.hasEjected = false;
    this.awaitingSupply = false;
  }

  finishOutput(ball) {
    ball.userData.focusRecord = this.nextFocusRecord;
    ball.userData.resultIcon = this.finalIcon;
    ball.userData.pokemonId = this.forcedPokemon?.id;
    this.outputs.forEach((output) => { delete output.userData.action; });
    if (!this.outputs.includes(ball)) this.outputs.push(ball);
    ball.userData.action = 'collect';
    this.dispensing = false;
    this.spinning = false;
    this.onOutputReady(ball);
    this.onStatus(this.outputs.length >= 3 ? '出口已满 3 颗 · 请先取走一颗' : `出口已有 ${this.outputs.length} 颗 · 点击精灵球查看`);
  }

  updateBelt() {
    if (!this.slatBatches) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const length = this.slatMax - this.slatMin;
    this.slatData.forEach((item, index) => {
      position.copy(item.position);
      position.x = this.slatMin + ((item.position.x - this.slatMin + this.beltOffset) % length);
      matrix.compose(position, item.quaternion, item.scale);
      item.batch.setMatrixAt(item.instanceIndex, matrix);
    });
    this.slatBatches.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
  }

  updateSpin(dt) {
    if (!this.spinning) return;
    this.spinTime += dt;
    const t = this.spinTime;
    if (t >= 7.2 && !this.topReleaseRequested) {
      this.topReleaseRequested = true;
      this.supply.requestRelease();
    }
    const speed = t < 1.2 ? 17 : Math.max(0, 17 * (1 - (t - 1.2) / 0.8));
    if (this.crank) this.crank.rotation.x += speed * dt;
    const tick = Math.floor(t / 0.095);
    if (t < 2.0 && tick !== this.lastIconTick) {
      this.lastIconTick = tick;
      this.setDisplays(this.screens.map(() => Math.floor(Math.random() * ICONS.length)));
    }
    if (t >= 2.0 && !this.iconsAligned) {
      this.iconsAligned = true;
      this.setDisplays(this.screens.map(() => this.finalIcon), true);
    }
    const gold = this.iconsAligned && this.finalIcon === 1;
    const { level: flash, flashing } = prizeFlash(t, gold);
    if (gold && !flashing) this.beginShinyOutlet();
    this.reservoirBands.update(flash * .85, gold);
    this.screens.forEach((screen) => { screen.material.emissiveIntensity = flash; });
    if (this.indicator?.material) this.indicator.material.emissiveIntensity = flash;
  }
}
