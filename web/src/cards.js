import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cloneStyledMaterial } from './collection-effects.js';

const palettes = [
  ['#29223f', '#8d4564', '#e5b969'],
  ['#173c46', '#28777c', '#e9cd82'],
  ['#42231f', '#a65438', '#f1ce7a'],
  ['#252f26', '#55774b', '#dbc27d'],
  ['#252943', '#485eaa', '#d8c3f0'],
];

function landscapeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 1064;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 780);
  sky.addColorStop(0, '#101a38');
  sky.addColorStop(0.38, '#38537a');
  sky.addColorStop(0.72, '#d38b73');
  sky.addColorStop(1, '#f2c48d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 768, 1064);

  const halo = ctx.createRadialGradient(540, 270, 8, 540, 270, 190);
  halo.addColorStop(0, 'rgba(255,244,196,.9)');
  halo.addColorStop(0.16, 'rgba(255,215,157,.38)');
  halo.addColorStop(1, 'rgba(255,190,140,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(320, 50, 440, 440);
  ctx.fillStyle = '#ffe8b0';
  ctx.beginPath();
  ctx.arc(540, 270, 42, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 54; i += 1) {
    const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * 720 + 24;
    const y = (Math.sin(i * 47.3 + 2) * 0.5 + 0.5) * 480 + 28;
    const alpha = 0.18 + (i % 4) * 0.1;
    ctx.fillStyle = `rgba(255,244,214,${alpha})`;
    ctx.fillRect(x, y, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2);
  }

  const ranges = [
    { y: 610, color: '#60627a', peaks: [[0, 610], [125, 420], [240, 590], [370, 360], [520, 565], [660, 430], [768, 580]] },
    { y: 710, color: '#343f54', peaks: [[0, 690], [150, 515], [280, 680], [455, 480], [590, 650], [710, 540], [768, 620]] },
    { y: 790, color: '#233c3e', peaks: [[0, 760], [135, 650], [265, 745], [420, 610], [575, 745], [700, 665], [768, 720]] },
  ];
  ranges.forEach(({ y, color, peaks }) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 1064);
    peaks.forEach(([x, peakY]) => ctx.lineTo(x, peakY));
    ctx.lineTo(768, y);
    ctx.lineTo(768, 1064);
    ctx.closePath();
    ctx.fill();
  });

  const ground = ctx.createLinearGradient(0, 760, 0, 1064);
  ground.addColorStop(0, '#294843');
  ground.addColorStop(1, '#101f25');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 790, 768, 274);
  ctx.strokeStyle = 'rgba(238,202,139,.12)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i += 1) {
    ctx.beginPath();
    ctx.moveTo(384, 770);
    ctx.lineTo(i * 86 - 90, 1064);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function namePlateTexture(entry) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const palette = palettes[Number(entry.dex ?? entry.id) % palettes.length];
  const gradient = ctx.createLinearGradient(0, 0, 768, 160);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.5, palette[1]);
  gradient.addColorStop(1, palette[0]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 768, 160);
  ctx.strokeStyle = palette[2];
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 756, 148);
  ctx.fillStyle = '#f4d992';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(entry.name, 384, 70);
  ctx.font = '20px monospace';
  ctx.fillStyle = '#d4bb8c';
  ctx.fillText(`NO.${entry.id}  ·  HOLOGRAPHIC COLLECTION`, 384, 118);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function glareTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 512, 512, 0);
  gradient.addColorStop(0, 'rgba(255,120,160,0)');
  gradient.addColorStop(0.32, 'rgba(114,220,255,.1)');
  gradient.addColorStop(0.47, 'rgba(255,244,180,.58)');
  gradient.addColorStop(0.53, 'rgba(255,255,255,.7)');
  gradient.addColorStop(0.64, 'rgba(188,140,255,.12)');
  gradient.addColorStop(0.82, 'rgba(255,160,120,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(canvas);
}

function portalMaterial(material) {
  material.stencilWrite = true;
  material.stencilRef = 1;
  material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilFuncMask = 0xff;
  material.stencilWriteMask = 0x00;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
  return material;
}

function addInterior(group, object) {
  object.renderOrder = 2;
  object.traverse((child) => {
    if (!child.isMesh && !child.isPoints && !child.isLine) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(portalMaterial);
    child.renderOrder = 2;
  });
  group.add(object);
  return object;
}

function cloneModelMaterials(model) {
  const clones = new Map();
  model.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    const cloneMaterial = (material) => {
      if (!clones.has(material)) clones.set(material, portalMaterial(cloneStyledMaterial(material)));
      return clones.get(material);
    };
    child.material = Array.isArray(child.material)
      ? child.material.map(cloneMaterial)
      : cloneMaterial(child.material);
    child.renderOrder = 2;
  });
}

function mountainGeometry(peaks, bottom = -1.28) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.7, bottom);
  peaks.forEach(([x, y]) => shape.lineTo(x, y));
  shape.lineTo(1.7, bottom);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export function createCard(model, entry) {
  const group = new THREE.Group();
  group.name = 'HolographicCard';
  const palette = palettes[Number(entry.dex ?? entry.id) % palettes.length];
  const landscape = landscapeTexture();

  const backplane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.18, 4.42),
    new THREE.MeshBasicMaterial({ map: landscape, side: THREE.DoubleSide }),
  );
  backplane.position.z = -0.62;
  backplane.renderOrder = 0;
  group.add(backplane);

  const windowMask = new THREE.Mesh(
    new THREE.PlaneGeometry(2.92, 3.42),
    new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: THREE.ReplaceStencilOp,
      stencilZFail: THREE.ReplaceStencilOp,
      stencilZPass: THREE.ReplaceStencilOp,
    }),
  );
  windowMask.position.set(0, 0.26, 0.085);
  windowMask.renderOrder = 1;
  group.add(windowMask);

  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(3.16, 4.38),
    portalMaterial(new THREE.MeshBasicMaterial({ map: landscape })),
  );
  sky.position.z = -0.59;
  addInterior(group, sky);

  const farMountains = new THREE.Mesh(
    mountainGeometry([[-1.7, -0.2], [-1.25, 0.48], [-0.78, 0.02], [-0.2, 0.78], [0.28, 0.08], [0.88, 0.58], [1.7, -0.12]]),
    portalMaterial(new THREE.MeshStandardMaterial({ color: '#586177', roughness: 1, metalness: 0 })),
  );
  farMountains.position.z = -0.49;
  addInterior(group, farMountains);

  const nearMountains = new THREE.Mesh(
    mountainGeometry([[-1.7, -0.55], [-1.12, 0.04], [-0.55, -0.35], [0.05, 0.28], [0.55, -0.28], [1.12, 0.13], [1.7, -0.48]]),
    portalMaterial(new THREE.MeshStandardMaterial({ color: '#293f46', roughness: 1, metalness: 0 })),
  );
  nearMountains.position.z = -0.39;
  addInterior(group, nearMountains);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3.15, 1.08, 1, 1),
    portalMaterial(new THREE.MeshStandardMaterial({ color: '#294a40', roughness: 0.92, metalness: 0.02 })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -1.18, -0.15);
  addInterior(group, ground);

  cloneModelMaterials(model);
  model.position.set(0, -1.15, -0.16);
  model.scale.multiplyScalar(1.08);
  model.renderOrder = 2;
  group.add(model);

  const particlePositions = new Float32Array(36 * 3);
  for (let i = 0; i < 36; i += 1) {
    particlePositions[i * 3] = Math.sin(i * 73.17) * 1.34;
    particlePositions[i * 3 + 1] = Math.sin(i * 31.73 + 1.4) * 1.42 + 0.22;
    particlePositions[i * 3 + 2] = -0.12 - (Math.sin(i * 19.19) * 0.5 + 0.5) * 0.32;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particles = new THREE.Points(
    particleGeometry,
    portalMaterial(new THREE.PointsMaterial({
      color: '#ffe7ae',
      size: 0.025,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })),
  );
  addInterior(group, particles);

  const warmLight = new THREE.PointLight('#ffd6a0', 1.8, 4, 2);
  warmLight.position.set(-0.8, 1.2, 0.25);
  group.add(warmLight);
  const rimLight = new THREE.PointLight('#8dcfff', 1.25, 3.5, 2);
  rimLight.position.set(0.9, 0.4, -0.28);
  group.add(rimLight);

  const surroundShape = new THREE.Shape();
  surroundShape.moveTo(-1.65, -2.3);
  surroundShape.lineTo(1.65, -2.3);
  surroundShape.lineTo(1.65, 2.3);
  surroundShape.lineTo(-1.65, 2.3);
  surroundShape.closePath();
  const windowHole = new THREE.Path();
  windowHole.moveTo(-1.46, -1.45);
  windowHole.lineTo(-1.46, 1.97);
  windowHole.lineTo(1.46, 1.97);
  windowHole.lineTo(1.46, -1.45);
  windowHole.closePath();
  surroundShape.holes.push(windowHole);
  const surround = new THREE.Mesh(
    new THREE.ShapeGeometry(surroundShape),
    new THREE.MeshPhysicalMaterial({
      color: palette[0],
      metalness: 0.52,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.2,
      side: THREE.DoubleSide,
    }),
  );
  surround.position.z = 0.1;
  surround.renderOrder = 3;
  group.add(surround);

  const namePlate = new THREE.Mesh(
    new THREE.PlaneGeometry(3.02, 0.58),
    new THREE.MeshBasicMaterial({ map: namePlateTexture(entry) }),
  );
  namePlate.position.set(0, -1.94, 0.115);
  namePlate.renderOrder = 4;
  group.add(namePlate);

  const frameMaterial = new THREE.MeshPhysicalMaterial({ color: '#e5bd70', metalness: 0.85, roughness: 0.24, clearcoat: 1 });
  [-1.59, 1.59].forEach((x) => {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(0.055, 4.4, 0.055, 2, 0.018), frameMaterial);
    rail.position.set(x, 0, 0.125);
    rail.renderOrder = 4;
    group.add(rail);
  });
  [-2.17, 2.17].forEach((y) => {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(3.2, 0.055, 0.055, 2, 0.018), frameMaterial);
    rail.position.set(0, y, 0.125);
    rail.renderOrder = 4;
    group.add(rail);
  });

  const glare = new THREE.Mesh(
    new THREE.PlaneGeometry(3.12, 4.38),
    new THREE.MeshBasicMaterial({ map: glareTexture(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glare.position.z = 0.16;
  glare.renderOrder = 5;
  group.add(glare);
  group.userData.glare = glare;
  return group;
}

export class CardStore {
  constructor({ onSelect, onChange, onOpen }) {
    this.key = 'capsule-works-cards-v1';
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.onOpen = onOpen;
    this.dialog = document.querySelector('#pack-dialog');
    this.grid = document.querySelector('#card-grid');
    this.empty = document.querySelector('#empty-pack');
    this.cards = [];
    try { localStorage.removeItem(this.key); } catch { /* Storage may be disabled. */ }
    document.querySelector('#pack-button').addEventListener('click', () => {
      if (this.onOpen) this.onOpen();
      else this.open();
    });
    document.querySelector('#pack-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.dialog.close();
    });
    this.render();
  }

  add(entry) {
    if (this.cards.some(card => card.key === entry.key)) return false;
    this.cards.unshift(entry);
    this.render();
    this.onChange?.(this.cards.length);
  }

  open() {
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
  }

  render() {
    this.grid.replaceChildren();
    this.empty.hidden = this.cards.length > 0;
    this.cards.forEach((card) => {
      const button = document.createElement('button');
      button.className = 'card-item';
      const image = document.createElement('img');
      image.src = card.image;
      image.alt = `${card.name} 3D 收藏卡`;
      const name = document.createElement('strong');
      name.textContent = card.name;
      const id = document.createElement('small');
      id.textContent = `NO.${card.id} / CAPSULE WORKS`;
      button.append(image, name, id);
      button.addEventListener('click', () => {
        this.dialog.close();
        this.onSelect(card);
      });
      this.grid.appendChild(button);
    });
    document.querySelector('#pack-count').textContent = this.cards.length;
    this.onChange?.(this.cards.length);
  }
}
