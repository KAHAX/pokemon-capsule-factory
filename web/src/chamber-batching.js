import * as THREE from 'three';

// Keep every authored animation node. Only replace its draw with instances of the
// exact same geometry/material, so collisions, timing and ball count stay intact.
export function batchChamberBalls(chamber) {
  const groups = new Map();
  chamber.root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || Array.isArray(mesh.material)) return;
    let ball = mesh.parent;
    while (ball && ball !== chamber.root && !/^SIM_Ball_\d+$/.test(ball.name)) ball = ball.parent;
    if (!ball || ball === chamber.root) return;
    const key = `${mesh.geometry.uuid}/${mesh.material.uuid}/${mesh.castShadow}/${mesh.receiveShadow}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  });
  const batches = [];
  for (const sources of groups.values()) {
    if (sources.length < 2) continue;
    const first = sources[0];
    const batch = new THREE.InstancedMesh(first.geometry, first.material, sources.length);
    batch.name = `Chamber batch / ${first.material.name}`;
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.frustumCulled = false; // tiny single chamber; all instances share this draw
    chamber.root.add(batch);
    for (const source of sources) source.layers.set(31);
    batches.push({ batch, sources });
  }
  const inverse = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  let dirty = true, wasPlaying = false;
  return {
    batches,
    update() {
      if (!dirty && !chamber.playing && !wasPlaying) return;
      dirty = false; wasPlaying = chamber.playing;
      chamber.root.updateWorldMatrix(true, true);
      inverse.copy(chamber.root.matrixWorld).invert();
      for (const { batch, sources } of batches) {
        let count = 0;
        for (const source of sources) {
          let visible = true;
          for (let p = source; p; p = p.parent) if (!p.visible) { visible = false; break; }
          if (!visible) continue;
          matrix.multiplyMatrices(inverse, source.matrixWorld);
          batch.setMatrixAt(count++, matrix);
        }
        batch.count = count;
        batch.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
