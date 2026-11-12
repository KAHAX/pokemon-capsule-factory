import * as THREE from 'three';

const viewport = new THREE.Vector4();
export const companionOutlines = new Set();
const ink = new THREE.MeshBasicMaterial({ color: new THREE.Color(.033, .038, .045), side: THREE.BackSide, depthWrite: false });
ink.name = 'Companion / scene charcoal outline';
ink.userData.noToon = true;
const resolution = { value: new THREE.Vector2(1, 1) };
const width = { value: 2 };
ink.onBeforeCompile = shader => {
  shader.uniforms.inkResolution = resolution;
  shader.uniforms.inkWidth = width;
  shader.vertexShader = 'uniform vec2 inkResolution; uniform float inkWidth;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )', '#if 1');
  shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    // BackSide reverses transformedNormal; expand along the original outward normal.
    vec2 direction = (projectionMatrix * vec4(-transformedNormal, 0.0)).xy;
    float magnitude = length(direction);
    if (magnitude > .00001) gl_Position.xy += direction / magnitude * inkWidth * 2.0 / inkResolution * gl_Position.w;`);
};
ink.customProgramCacheKey = () => 'companion-charcoal-silhouette-v1';

// Each skinned vertex is a convex combination of its bone-transformed positions.
// Union the per-bone influence spheres, so culling remains safe even with spread
// wings, attacks or a completely different pose (no guessed rest-pose radius).
function skinEnvelope(mesh) {
  if (mesh.geometry.morphAttributes.position?.length) return null;
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  if (!skinIndex || !skinWeight) return null;
  const boxes = new Map(), p = new THREE.Vector3(), local = new THREE.Vector3();
  // r160 has getX/Y/Z/W, but not BufferAttribute.getComponent. These also
  // decode normalized/interleaved attributes emitted by the asset optimizer.
  const components = ['getX', 'getY', 'getZ', 'getW'];
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix);
    for (let j = 0; j < 4; j++) {
      if (skinWeight[components[j]](i) <= 0) continue;
      const index = skinIndex[components[j]](i);
      if (!boxes.has(index)) boxes.set(index, new THREE.Box3());
      local.copy(p).applyMatrix4(mesh.skeleton.boneInverses[index]);
      boxes.get(index).expandByPoint(local);
    }
  }
  const influences = [...boxes].map(([index, box]) => ({ index, sphere: box.getBoundingSphere(new THREE.Sphere()) }));
  const box = new THREE.Box3(), sphere = new THREE.Sphere(), transform = new THREE.Matrix4(), radius = new THREE.Vector3();
  mesh.boundingSphere = new THREE.Sphere();
  return () => {
    box.makeEmpty();
    for (const influence of influences) {
      transform.multiplyMatrices(mesh.bindMatrixInverse, mesh.skeleton.bones[influence.index].matrixWorld);
      sphere.copy(influence.sphere).applyMatrix4(transform);
      radius.setScalar(sphere.radius);
      box.expandByPoint(local.copy(sphere.center).sub(radius));
      box.expandByPoint(local.copy(sphere.center).add(radius));
    }
    box.getBoundingSphere(mesh.boundingSphere);
    mesh.boundingSphere.radius += .001;
  };
}

export function prepareCompanionRendering(root, { outlines: enabled = true } = {}) {
  const meshes = [], updates = [], outlines = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  root.updateMatrixWorld(true);
  for (const mesh of meshes) {
    if (mesh.isSkinnedMesh) {
      const update = skinEnvelope(mesh);
      if (update) { updates.push(update); update(); mesh.frustumCulled = true; }
    } else mesh.frustumCulled = true;
    if (!enabled) continue;
    // Alpha-cut face/eye planes are decals, not part of the outer silhouette.
    const materials = [].concat(mesh.material);
    if (materials.some(m => m.transparent || m.alphaTest > 0 || /eye|mouth/i.test(m.name))) continue;
    const outline = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(mesh.geometry, ink) : new THREE.Mesh(mesh.geometry, ink);
    outline.name = 'Scene charcoal silhouette';
    outline.userData.companionOutline = true;
    outline.frustumCulled = mesh.frustumCulled;
    if (mesh.isSkinnedMesh) {
      outline.skeleton = mesh.skeleton;
      outline.bindMode = mesh.bindMode;
      outline.bindMatrix.copy(mesh.bindMatrix);
      outline.bindMatrixInverse.copy(mesh.bindMatrixInverse);
      outline.boundingSphere = mesh.boundingSphere;
    }
    outline.morphTargetInfluences = mesh.morphTargetInfluences;
    outline.onBeforeRender = renderer => {
      renderer.getCurrentViewport(viewport);
      resolution.value.set(viewport.z, viewport.w);
      width.value = renderer.getPixelRatio() * 2;
    };
    mesh.add(outline);
    outlines.push(outline);
    companionOutlines.add(outline);
  }
  root.userData.companionOutlines = outlines;
  return () => {
    root.updateMatrixWorld(true);
    updates.forEach(update => update());
  };
}
