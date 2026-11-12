import { mobileEdition, mobilePerformance } from './mobile-performance.js';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { addNightStars } from './night-stars.js';

// A light cookie, not a surface decal: the same window pattern projects onto
// every surface and is occluded by the machine's real shadow map.
function createWindowLightCookie() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 512);
  ctx.save();
  ctx.translate(256, 256);
  ctx.rotate(-.4);
  ctx.filter = 'blur(3px)';
  ctx.fillStyle = '#fff';
  for (const x of [-208, -120, -32, 56, 144]) ctx.fillRect(x, -224, 62, 448);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'Soft window light bands';
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function applyBlenderLighting(scene, renderer, settings) {
  scene.children.filter((object) => object.isLight).forEach((light) => light.removeFromParent());
  const worldColor = new THREE.Color().setRGB(...settings.worldColor, THREE.LinearSRGBColorSpace);
  const background = new THREE.Color().setRGB(.014, .020, .032);
  scene.background = background;
  scene.fog.color.copy(background);
  addNightStars(scene);
  // Per-material environment intensity is used by Three r160.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = settings.exposure * 1.0;

  RectAreaLightUniformsLib.init();
  (mobileEdition ? [] : settings.lights).forEach((config) => {
    const color = new THREE.Color().setRGB(...config.color, THREE.LinearSRGBColorSpace);
    const position = new THREE.Vector3().fromArray(config.position);
    const direction = new THREE.Vector3().fromArray(config.direction);
    let light;
    if (config.type === 'AREA') {
      const width = config.size || 1;
      const height = config.name === 'Glass highlight ribbon' ? .65 : config.shape === 'DISK' ? width : config.sizeY || width;
      const balance = { 'Warm key softbox': .32, 'Cream frontal fill': .32,
        'Golden upper rim': .66, 'Soft rear factory light': .7,
        'Apricot cyclorama wash': .75, 'Glass highlight ribbon': .5 };
      const intensity = config.energy / (width * height * Math.PI) * 0.14 * (balance[config.name] ?? 1);
      light = new THREE.RectAreaLight(color, intensity, width, height);
    } else {
      light = new THREE.PointLight(color, config.energy / (4 * Math.PI), 0, 2);
    }
    light.name = config.name;
    light.position.copy(position);
    light.lookAt(position.clone().add(direction));
    scene.add(light);
  });
  if (mobileEdition) {
    const soft = new THREE.HemisphereLight('#fff0d8', '#27354c', .9);
    const keyLight = new THREE.DirectionalLight('#ffdbac', 1.5);
    keyLight.position.set(-8,12,10);
    const rim = new THREE.DirectionalLight('#9bbdff', .8);
    rim.position.set(5,9,-8);
    scene.add(soft,keyLight,rim);
  }

  const key = settings.lights.find((light) => light.name === 'Warm key softbox');
  if (key && !mobileEdition) {
    const shadow = new THREE.DirectionalLight('#fff0d8', .35);
    shadow.name = 'Soft ambient key shadows';
    shadow.position.fromArray(key.position);
    shadow.target.position.copy(shadow.position).add(new THREE.Vector3().fromArray(key.direction));
    shadow.castShadow = !mobileEdition;
    const shadowSize = mobilePerformance ? 1024 : window.innerWidth >= 800 ? Math.min(4096, renderer.capabilities.maxTextureSize) : 2048;
    shadow.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(shadow.shadow.camera, { left: -13, right: 13, top: 16, bottom: -10, near: 1, far: 55 });
    shadow.shadow.bias = -0.0003;
    shadow.shadow.normalBias = 0.012;
    shadow.shadow.radius = 2;
    scene.add(shadow, shadow.target);
  }

  // A broad local portrait softbox lifts the machine without flattening the factory.
  const heroFill = new THREE.RectAreaLight('#e1ebff', .8, 8, 10);
  heroFill.name = 'Hero portrait softbox';
  heroFill.position.set(5, 7, 10);
  heroFill.lookAt(0, 4, 0);
  if (!mobileEdition) scene.add(heroFill);

  // Dedicated feathered key: keeps illumination concentrated on the gacha machine.
  const heroSpot = new THREE.SpotLight('#ffdfad', 1800, 48, .58, .45, 2);
  heroSpot.name = 'Gacha dedicated warm-white spotlight';
  heroSpot.position.set(-8, 12, 10);
  heroSpot.target.position.set(0, 2.8, .8);
  heroSpot.map = createWindowLightCookie();
  heroSpot.castShadow = true;
  heroSpot.shadow.mapSize.set(mobilePerformance ? 1024 : 2048, mobilePerformance ? 1024 : 2048);
  heroSpot.shadow.camera.near = .5;
  heroSpot.shadow.camera.far = 48;
  heroSpot.shadow.bias = -.00015;
  heroSpot.shadow.normalBias = .015;
  heroSpot.shadow.radius = 2;
  scene.add(heroSpot, heroSpot.target);
}




