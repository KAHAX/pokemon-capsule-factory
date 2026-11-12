import * as THREE from 'three';
import { createGalaxyFrame, createGalaxySky, createStarField } from './sky.js';
import { createWetGround } from './wet-ground.js';
import { createLightShaft, createFireflies, addMoonlight, createDust, createHorizonMist } from './atmosphere.js';
import { applyPrintedGlass } from './glass-print.js';
import { upgradeScreens } from './screens.js';
import { enhanceCrank } from './crank.js';
import { ShinyOutletFX } from './shiny-outlet.js';
import { removeMiddleSigns, raiseHangingDisplays } from './cleanup.js';
import { restoreMedallionGlow } from './medallion-glow.js';
import './dreamscape.css';

/**
 * "Dreamscape": the night-garden look for the capsule factory.
 * Galaxy sky, rain-soaked mirror ground, light shafts, fireflies and a dreamy bloom.
 */
export function installDreamscape({ scene, renderer, camera, controls, bloom, time, machine }) {
  const center = new THREE.Vector2(-.5, -.3);

  // Retire the warm plush cyclorama and its painted stars: the real sky replaces them.
  let groundY = -.69;
  scene.traverse(object => {
    if (!object.isMesh && !object.isPoints) return;
    const materials = [].concat(object.material || []);
    if (materials.some(m => /FLEECE \/ honey apricot dyed plush/i.test(m.name))) {
      object.geometry.computeBoundingBox();
      groundY = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld).min.y;
      object.visible = false;
    }
    if (object.name === 'Muted distant night stars') object.visible = false;
  });

  const horizon = new THREE.Color().setRGB(.026, .048, .084);
  scene.background = horizon.clone();
  scene.fog.color.copy(horizon);
  scene.fog.near = 20;
  scene.fog.far = 125;
  const fogColor = scene.fog.color;

  const viewDirection = new THREE.Vector3().subVectors(controls.target, camera.position);
  const frame = createGalaxyFrame({ viewDirection });
  // Light for the Tyndall rays and dust scattering: from the galaxy core, raised above the frame.
  const forward = new THREE.Vector3(viewDirection.x, 0, viewDirection.z).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const lightDirection = forward.multiplyScalar(Math.cos(.16)).addScaledVector(right, Math.sin(.16))
    .multiplyScalar(Math.cos(.17)).add(new THREE.Vector3(0, Math.sin(.17), 0)).normalize();
  scene.userData.dreamLightDirection = lightDirection;
  const stars = createStarField({ frame, time });
  scene.add(stars);

  const noDepth = scene.userData.dreamNoDepth ||= new Set();
  noDepth.add(stars);

  const ground = createWetGround({ renderer, camera, time, center, groundY: groundY - .002 });
  scene.add(ground);
  const mist = createHorizonMist({ center, fogColor, time });
  scene.add(mist);
  noDepth.add(mist);

  const heroFrom = new THREE.Vector3(-8, 12, 10);
  const heroTarget = new THREE.Vector3(0, 2.8, .8);
  const heroDir = heroTarget.clone().sub(heroFrom);
  const heroEnd = heroFrom.clone().addScaledVector(heroDir, (groundY - heroFrom.y) / heroDir.y);
  const warmShaft = createLightShaft({ from: heroFrom.clone().addScaledVector(heroDir, -.6), to: heroEnd,
    radiusTop: .35, radiusBottom: 7.2, color: '#ffdcae', intensity: .018, time });
  const moonShaft = createLightShaft({ from: new THREE.Vector3(-30, 34, -34), to: new THREE.Vector3(-14, groundY, -12),
    radiusTop: 1.2, radiusBottom: 11, color: '#7fa8ff', intensity: .045, time });
  const motes = createFireflies({ center, time });
  const dust = createDust({ center, time, lightDirection });
  scene.add(warmShaft, moonShaft, motes, dust);
  [warmShaft, moonShaft, motes, dust].forEach(object => noDepth.add(object));
  if (machine?.screens) upgradeScreens(machine.screens, time);
  enhanceCrank(machine?.crank);
  removeMiddleSigns(scene);
  scene.userData.raisedDisplays = raiseHangingDisplays(scene);
  restoreMedallionGlow(scene);
  const printedGlassReady = applyPrintedGlass(scene).catch(error => console.warn('Dreamscape glass:', error));

  const lights = addMoonlight(scene);

  // Wider, softer bloom with violet-blue large-scale halation.
  bloom.threshold = .92;
  bloom.strength = .36;
  bloom.radius = .62;
  const tints = [[1.0, .96, .9], [1.0, .92, .92], [.88, .86, 1.05], [.72, .78, 1.15], [.66, .62, 1.2]];
  bloom.bloomTintColors.forEach((tint, i) => tint.set(...tints[i]));

  const sky = { mesh: null };
  new THREE.TextureLoader().loadAsync('/assets/milky-way-4k.jpg').then(texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    sky.mesh = createGalaxySky({ texture, frame, fogColor, time });
    scene.add(sky.mesh);
    noDepth.add(sky.mesh);
  }).catch(error => console.warn('Dreamscape sky:', error));

  const shinyFX = new ShinyOutletFX(scene, machine);
  const api = { printedGlassReady, ground, stars, sky, lights, shafts: [warmShaft, moonShaft], motes, dust, bloom, frame, lightDirection, shinyFX,
    update(dt) { shinyFX.update(dt); } };
  window.__dreamscape = api;
  return api;
}
