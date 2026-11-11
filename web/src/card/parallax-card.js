import { mobilePerformance } from '../mobile-performance.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class ParallaxCard {
  constructor(card, viewport) {
    this.card = card;
    this.viewport = viewport;
    this.target = new THREE.Vector2();
    this.current = new THREE.Vector2();
    this.cameraBase = new THREE.Vector3(0, 0, 7.4);
    this.cameraTarget = new THREE.Vector3(0, -0.08, -2.35);
    this.clock = new THREE.Clock();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.abortController = new AbortController();
    this.frame = 0;
    this.elapsed = 0;
    this.tick = this.tick.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobilePerformance ? 1 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.viewport.prepend(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020713);
    this.scene.fog = new THREE.Fog(0x020713, 14, 26);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(this.cameraTarget);

    this.createSpace();
    this.createModel();
    this.createLighting();
    this.bindEvents();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
    this.card.dataset.ready = 'true';
  }

  createSpace() {
    this.scene.background = this.createStarTexture();
    this.scene.backgroundIntensity = 1.1;
    this.particles = new THREE.Group();
    this.particles.add(
      this.createStarLayer(520, 0.026, 0.7),
      this.createStarLayer(140, 0.052, 0.95),
    );
    this.scene.add(this.particles);
  }

  createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const context = canvas.getContext('2d');
    const base = context.createLinearGradient(0, 0, 1024, 1024);
    base.addColorStop(0, '#02040e');
    base.addColorStop(0.45, '#07142f');
    base.addColorStop(1, '#030718');
    context.fillStyle = base;
    context.fillRect(0, 0, 1024, 1024);

    context.globalCompositeOperation = 'screen';
    const nebulas = [
      [270, 480, 520, 'rgba(32, 100, 190, 0.42)'],
      [780, 300, 440, 'rgba(116, 56, 180, 0.34)'],
      [570, 880, 470, 'rgba(20, 128, 160, 0.24)'],
    ];
    for (const [x, y, radius, color] of nebulas) {
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.45, color.replace(/[\d.]+\)$/, '0.12)'));
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 1024, 1024);
    }

    for (let i = 0; i < 850; i += 1) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const radius = Math.random() < 0.08 ? 1.2 + Math.random() : 0.25 + Math.random() * 0.65;
      const alpha = 0.25 + Math.random() * 0.7;
      context.fillStyle = `rgba(${210 + Math.floor(Math.random() * 45)}, 225, 255, ${alpha})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      if (radius > 1.65) {
        context.strokeStyle = `rgba(185, 215, 255, ${alpha * 0.45})`;
        context.lineWidth = 0.7;
        context.beginPath();
        context.moveTo(x - radius * 3.5, y);
        context.lineTo(x + radius * 3.5, y);
        context.moveTo(x, y - radius * 3.5);
        context.lineTo(x, y + radius * 3.5);
        context.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  createStarLayer(count, size, opacity) {
    const positions = [];
    const colors = [];
    const palette = [new THREE.Color(0xffffff), new THREE.Color(0xa9c9ff), new THREE.Color(0xcdbbff), new THREE.Color(0x91e9ff)];
    for (let i = 0; i < count; i += 1) {
      positions.push(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
        2 - Math.random() * 20,
      );
      const color = palette[Math.floor(Math.random() * palette.length)];
      colors.push(color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({
      size,
      opacity,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
  }

  createModel() {
    this.model = new THREE.Group();
    this.modelSize = 1;
    this.model.position.set(0, 0, -5.2);
    this.model.rotation.set(0.22, 0.55, 0.03);
    this.scene.add(this.model);

    new GLTFLoader().load('/assets/pokeball.glb', (gltf) => {
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      this.normalizedScale = 3.65 / Math.max(size.x, size.y, size.z);
      model.position.sub(center);
      this.model.scale.setScalar(this.normalizedScale * this.modelSize);
      this.model.add(model);
      this.card.dataset.modelReady = 'true';
      this.card.dispatchEvent(new CustomEvent('modelready'));
    }, undefined, (error) => {
      console.error('精灵球模型加载失败：', error);
      this.card.dataset.modelError = 'true';
      this.card.dispatchEvent(new CustomEvent('modelerror'));
    });
  }

  createLighting() {
    this.scene.add(new THREE.HemisphereLight(0xb9fff4, 0x07131c, 1.65));
    const key = new THREE.DirectionalLight(0xd9fff8, 3.2);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const cyan = new THREE.PointLight(0x34f5df, 18, 12, 2);
    cyan.position.set(2.5, -0.5, 0.5);
    this.scene.add(cyan);
    const violet = new THREE.PointLight(0x8f5cff, 14, 11, 2);
    violet.position.set(-2.5, 1.4, -0.8);
    this.scene.add(violet);
  }

  bindEvents() {
    const { signal } = this.abortController;
    let origin;
    const updatePointer = (event) => {
      if (!origin) return;
      this.target.set(
        clamp(origin.tx + (event.clientX - origin.x) / origin.width * 2, -1, 1),
        clamp(origin.ty + (event.clientY - origin.y) / origin.height * 2, -1, 1),
      );
    };
    let dragging = false;
    const stopDragging = () => {
      dragging = false;
      this.reset();
    };
    this.card.addEventListener('pointermove', (event) => {
      if (dragging) updatePointer(event);
    }, { signal });
    this.card.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      const rect = this.card.getBoundingClientRect();
      origin = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, tx: this.current.x, ty: this.current.y };
      this.card.setPointerCapture(event.pointerId);
      updatePointer(event);
    }, { signal });
    this.card.addEventListener('pointerup', (event) => {
      if (!dragging) return;
      if (this.card.hasPointerCapture(event.pointerId)) this.card.releasePointerCapture(event.pointerId);
      stopDragging();
    }, { signal });
    this.card.addEventListener('pointercancel', stopDragging, { signal });
    this.card.addEventListener('lostpointercapture', stopDragging, { signal });
    this.card.addEventListener('blur', stopDragging, { signal });
    this.card.addEventListener('keydown', (event) => {
      const step = 0.16;
      if (event.key === 'ArrowLeft') this.target.x -= step;
      else if (event.key === 'ArrowRight') this.target.x += step;
      else if (event.key === 'ArrowUp') this.target.y -= step;
      else if (event.key === 'ArrowDown') this.target.y += step;
      else if (event.key === 'Home') this.reset();
      else return;
      event.preventDefault();
      this.target.clampScalar(-1, 1);
    }, { signal });
    this.reducedMotion.addEventListener('change', () => this.reset(), { signal });
    document.addEventListener('visibilitychange', this.onVisibilityChange, { signal });
  }

  resize() {
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setDepth(value) {
    const depth = Number(value);
    if (Number.isFinite(depth)) this.model.position.z = -clamp(depth, 2.2, 8);
  }

  setScale(value) {
    const scale = Number(value);
    if (!Number.isFinite(scale)) return;
    this.modelSize = clamp(scale, 0.5, 1.8);
    if (this.normalizedScale) this.model.scale.setScalar(this.normalizedScale * this.modelSize);
  }

  reset() {
    this.target.set(0, 0);
  }

  onVisibilityChange() {
    if (document.hidden) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    } else if (!this.frame) {
      this.clock.getDelta();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  tick() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += delta;
    const damping = this.reducedMotion.matches ? 1 : 1 - Math.exp(-delta * 8);
    this.current.lerp(this.target, damping);

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
    this.model.rotation.x = 0.22 - this.current.y * 0.08;
    this.model.rotation.y = 0.55 + this.current.x * 0.12;

    if (!this.reducedMotion.matches) {
      this.particles.rotation.z = this.elapsed * 0.008;
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  }

  getDebugState() {
    return {
      target: this.target.toArray(),
      current: this.current.toArray(),
      modelRotation: this.model.rotation.toArray().slice(0, 3),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.abortController.abort();
    this.resizeObserver?.disconnect();
    this.scene.background?.dispose?.();
    this.scene.traverse((object) => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
