import * as THREE from 'three';

export const normalizeName = (name = '') => name.toLowerCase().replace(/[^a-z0-9]/g, '');

export function findByKey(root, key) {
  const normalized = normalizeName(key);
  let result;
  root.traverse((object) => {
    if (!result && normalizeName(object.name).includes(normalized)) result = object;
  });
  return result;
}

export function findAllByKey(root, key) {
  const normalized = normalizeName(key);
  const result = [];
  root.traverse((object) => {
    if (normalizeName(object.name).includes(normalized)) result.push(object);
  });
  return result;
}

export function instantiateBall(template, scale = 0.39) {
  let source = template.scene;
  source.traverse((object) => {
    if (normalizeName(object.name) === 'pokeballstandard') source = object;
  });
  const ball = source.clone(true);
  ball.scale.setScalar(scale);
  ball.visible = true;
  ball.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return ball;
}

export function loadManifest() {
  return fetch('/assets/pokemon-v5/manifest.json').then((response) => {
    if (!response.ok) throw new Error('宝可梦清单加载失败');
    return response.json();
  });
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}
