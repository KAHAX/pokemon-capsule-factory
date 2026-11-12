import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ParallaxCard } from './parallax-card.js';
import { POKEMON_CARDS } from './pokemon-card-data.js';
import { StudioRenderEffect } from './studio-render-effect.js';

function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials.filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}

function visualCenter(model, bounds) {
  const center = bounds.getCenter(new THREE.Vector3());
  const xValues = [];
  const point = new THREE.Vector3();
  model.traverse((object) => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position;
    const step = Math.max(1, Math.floor(positions.count / 2000));
    for (let i = 0; i < positions.count; i += step) {
      point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      xValues.push(point.x);
    }
  });
  if (xValues.length) {
    xValues.sort((a, b) => a - b);
    const middle = Math.floor(xValues.length / 2);
    center.x = xValues.length % 2 ? xValues[middle] : (xValues[middle - 1] + xValues[middle]) / 2;
  }
  return center;
}

function rgb(hexColor) {
  const hex = new THREE.Color(hexColor).getHex();
  return `${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}`;
}

export class PokemonCardScene extends ParallaxCard {
  init() {
    super.init();
    this.studioEffect = new StudioRenderEffect(this.renderer);
  }

  createSpace() {
    this.particles = new THREE.Group();
    this.scene.add(this.particles);
    this.applyTheme(this.character || POKEMON_CARDS[0]);
  }

  applyTheme(character) {
    this.theme = character.theme;
    if (this.scene.background?.isTexture) this.scene.background.dispose();
    this.scene.background = this.createElectricStarTexture();
    this.scene.backgroundIntensity = character.shiny ? 1.4 : 1.15;
    this.renderer.toneMappingExposure = character.shiny ? 0.9 : 2 ** -0.75;
    this.scene.fog = new THREE.Fog(this.theme.dark, 17, 38);
    this.particles.children.forEach((child) => disposeObject(child));
    this.particles.clear();

    const primaryStars = this.createStarLayer(character.shiny ? 340 : 210, 0.065, 0.9);
    primaryStars.material.color.set(this.theme.primary);
    const secondaryStars = this.createStarLayer(character.shiny ? 220 : 140, 0.038, 0.72);
    secondaryStars.material.color.set(this.theme.secondary);
    this.particles.add(primaryStars, secondaryStars);
  }

  createElectricStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const context = canvas.getContext('2d');
    const baseColor = new THREE.Color(this.theme.dark);
    const midColor = baseColor.clone().multiplyScalar(1.45);
    const edgeColor = baseColor.clone().multiplyScalar(0.62);
    const base = context.createLinearGradient(0, 0, 1024, 1024);
    if (this.character?.shiny) {
      base.addColorStop(0, '#50bce9');
      base.addColorStop(0.48, '#a88ae6');
      base.addColorStop(1, '#eda4d4');
    } else {
      base.addColorStop(0, `#${edgeColor.getHexString()}`);
      base.addColorStop(0.5, `#${midColor.getHexString()}`);
      base.addColorStop(1, `#${edgeColor.getHexString()}`);
    }
    context.fillStyle = base;
    context.fillRect(0, 0, 1024, 1024);

    context.globalCompositeOperation = 'screen';
    const positions = [[250, 400, 560], [820, 260, 480], [680, 830, 520]];
    this.theme.nebula.forEach((color, index) => {
      const [x, y, radius] = positions[index];
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.08)'));
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 1024, 1024);
    });

    const starColors = ['255, 255, 255', rgb(this.theme.secondary), rgb(this.theme.primary)];
    const starCount = this.character?.shiny ? 1350 : 950;
    for (let i = 0; i < starCount; i += 1) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const radius = Math.random() < 0.08 ? 1.2 + Math.random() : 0.25 + Math.random() * 0.7;
      const alpha = 0.25 + Math.random() * 0.75;
      const color = starColors[Math.floor(Math.random() * starColors.length)];
      context.fillStyle = `rgba(${color}, ${alpha})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      if (radius > 1.65) {
        context.strokeStyle = `rgba(${color}, ${alpha * 0.55})`;
        context.lineWidth = 0.8;
        context.beginPath();
        context.moveTo(x - radius * 3.5, y);
        context.lineTo(x + radius * 3.5, y);
        context.moveTo(x, y - radius * 3.5);
        context.lineTo(x, y + radius * 3.5);
        context.stroke();
      }
    }

    const constellation = [[120, 310], [245, 220], [355, 325], [480, 245], [610, 345]];
    context.strokeStyle = `rgba(${rgb(this.theme.primary)}, 0.28)`;
    context.lineWidth = 2;
    context.beginPath();
    constellation.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.stroke();
    for (const [x, y] of constellation) {
      context.fillStyle = `rgba(${rgb(this.theme.primary)}, 0.85)`;
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  createModel() {
    this.modelSize = 2.2;
    this.modelDepth = 12;
    this.bodyCenterOffset = 0;
    this.loadToken = 0;
    this.loadCharacter(this.character || POKEMON_CARDS[0]);
  }

  clearModel() {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.draco?.dispose();
    this.draco = null;
    if (this.model) {
      this.scene.remove(this.model);
      disposeObject(this.model);
      this.model = null;
    }
  }

  loadCharacter(character) {
    this.character = character;
    if (this.theme !== character.theme) this.applyTheme(character);
    const token = ++this.loadToken;
    this.clearModel();
    this.model = new THREE.Group();
    this.normalizedScale = null;
    this.bodyCenterOffset = 0;
    this.model.position.set(this.bodyCenterOffset * this.modelSize, 0, -this.modelDepth);
    this.model.rotation.set(0, 0, 0);
    this.scene.add(this.model);
    this.card.dataset.modelReady = 'false';
    this.card.dispatchEvent(new CustomEvent('modelloading', { detail: character }));

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    this.draco = draco;
    draco.setDecoderPath('/assets/draco/');
    draco.setWorkerLimit(2);
    loader.setDRACOLoader(draco);
    loader.load(`/assets/pokemon/models/${character.model}`, (gltf) => {
      if (token !== this.loadToken) {
        disposeObject(gltf.scene);
        draco.dispose();
        return;
      }
      const model = gltf.scene;
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.frustumCulled = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.emissiveMap]) {
            if (texture) texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          }
          material.envMapIntensity = 0.7;
          if (character.shiny) material.emissiveIntensity = 0;
          material.depthWrite = !material.transparent;
        }
      });

      this.mixer = new THREE.AnimationMixer(model);
      const defaultClip = gltf.animations.find((clip) => clip.name.includes('defaultwait')) || gltf.animations[0];
      if (defaultClip) this.mixer.clipAction(defaultClip).play();
      this.mixer.update(0);
      model.updateMatrixWorld(true);

      const bounds = new THREE.Box3().setFromObject(model);
      const center = visualCenter(model, bounds);
      const size = bounds.getSize(new THREE.Vector3());
      this.normalizedScale = character.frameSize / Math.max(size.x, size.y, size.z);
      model.position.sub(center);
      this.model.scale.setScalar(this.normalizedScale * this.modelSize);
      this.model.add(model);
      draco.dispose();
      if (this.draco === draco) this.draco = null;
      this.card.dataset.modelReady = 'true';
      this.card.dispatchEvent(new CustomEvent('modelready', { detail: character }));
    }, undefined, (error) => {
      if (token !== this.loadToken) return;
      console.error(`${character.chinese}模型加载失败：`, error);
      draco.dispose();
      if (this.draco === draco) this.draco = null;
      this.card.dataset.modelError = 'true';
      this.card.dispatchEvent(new CustomEvent('modelerror', { detail: character }));
    });
  }

  setDepth(value) {
    const depth = Number(value);
    if (!Number.isFinite(depth)) return;
    this.modelDepth = Math.min(16, Math.max(2.2, depth));
    if (this.model) this.model.position.z = -this.modelDepth;
  }

  setScale(value) {
    const scale = Number(value);
    if (!Number.isFinite(scale)) return;
    this.modelSize = Math.min(3, Math.max(0.5, scale));
    if (this.model) this.model.position.x = this.bodyCenterOffset * this.modelSize;
    if (this.normalizedScale) this.model.scale.setScalar(this.normalizedScale * this.modelSize);
  }

  createLighting() {
    const environment = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = generator.fromScene(environment, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    environment.dispose();
    generator.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x343043, 1));
    const key = new THREE.DirectionalLight(0xfff4e8, 2.2);
    key.position.set(-3, 5, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd8e5ff, 1);
    fill.position.set(3, 2, -3);
    this.scene.add(fill);
  }

  tick() {
    if (this.externallyDriven) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.renderFrame(delta);
    this.frame = requestAnimationFrame(this.tick);
  }

  renderFrame(delta = 0) {
    this.elapsed += delta;
    const damping = this.reducedMotion.matches ? 1 : 1 - Math.exp(-delta * 8);
    this.current.lerp(this.target, damping);

    if (this.updatePortraitView) this.updatePortraitView(delta);
    else {
    this.card.style.setProperty('--rotate-x', `${(-this.current.y * 22).toFixed(3)}deg`);
    this.card.style.setProperty('--rotate-y', `${(this.current.x * 34).toFixed(3)}deg`);
    this.card.style.setProperty('--glare-x', `${(50 + this.current.x * 35).toFixed(2)}%`);
    this.card.style.setProperty('--glare-y', `${(35 + this.current.y * 30).toFixed(2)}%`);

    this.camera.position.set(
      this.cameraBase.x - this.current.x * 1.4,
      this.cameraBase.y + this.current.y * 0.9,
      this.cameraBase.z,
    );
    this.camera.lookAt(this.cameraTarget);
    if (this.model) {
      this.model.rotation.x = -this.current.y * 0.06;
      this.model.rotation.y = this.current.x * 0.12;
    }

    }
    if (!this.reducedMotion.matches) {
      this.particles.rotation.z = this.elapsed * 0.012;
      this.mixer?.update(delta);
    }
    this.studioEffect.render(this.scene, this.camera, { rainbow: this.character?.shiny, time: this.elapsed });
  }

  dispose() {
    this.loadToken += 1;
    this.clearModel();
    this.studioEffect?.dispose();
    this.environmentTarget?.dispose();
    super.dispose();
  }
}
