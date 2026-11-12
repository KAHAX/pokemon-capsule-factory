import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Merge rigid siblings only: the lid and lifting platform keep their own parents
// and animation pivots. Every vertex, UV, normal and material stays intact.
export function batchRigidSiblings(root, clips = []) {
  const groups = new Map(), entries = [], excluded = new Set();
  for (const clip of clips) for (const track of clip.tracks) {
    const nodeName = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    excluded.add(THREE.PropertyBinding.findNode(root, nodeName));
  }
  root.updateWorldMatrix(true, true);
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.children.length
      || Array.isArray(mesh.material) || mesh.geometry.morphAttributes.position?.length) return;
    const material = mesh.material, geometry = mesh.geometry;
    if (material.transparent || material.transmission > 0 || !material.isMeshStandardMaterial
      || mesh.layers.mask !== 1 || mesh.renderOrder !== 0 || geometry.groups.length > 1) return;
    if (excluded.has(mesh)) return;
    for (let p = mesh; p; p = p.parent) if (!p.visible || p.userData.action) return;
    const matrix = mesh.matrix;
    if (matrix.determinant() <= 0) return;
    const layout = Object.entries(geometry.attributes).sort(([a],[b]) => a.localeCompare(b))
      .map(([name,a]) => `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).join('|');
    const key = `${mesh.parent.uuid}/${material.uuid}/${mesh.castShadow}/${mesh.receiveShadow}/${!!geometry.index}/${layout}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ mesh, matrix: matrix.clone() });
  });
  for (const sources of groups.values()) {
    if (sources.length < 4) continue;
    const copies = sources.map(({ mesh, matrix }) => mesh.geometry.clone().applyMatrix4(matrix));
    const geometry = mergeGeometries(copies, false);
    copies.forEach(g => g.dispose());
    if (!geometry) continue;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const first = sources[0].mesh, batch = new THREE.Mesh(geometry, first.material);
    batch.name = `Rigid detail batch / ${first.material.name}`;
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    first.parent.add(batch);
    for (const { mesh } of sources) mesh.layers.set(31);
    entries.push({ batch, sources });
  }
  const result = {
    meshesBefore: entries.reduce((n,e) => n + e.sources.length, 0), meshesAfter: entries.length,
    setEnabled(enabled) {
      for (const { batch, sources } of entries) {
        batch.visible = enabled;
        for (const { mesh } of sources) mesh.layers.set(enabled ? 31 : 0);
      }
    },
  };
  root.userData.staticBatches = result;
  return result;
}
