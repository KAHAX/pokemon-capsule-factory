import * as THREE from 'three';

// Removes the two middle hanging "Pokémon" signs (front-most and back-most stay).
// Their lettering is merged with other signs into shared static meshes, so the
// triangles are cut out by world-space region instead of hiding whole objects.
const REGIONS = [
  new THREE.Box3(new THREE.Vector3(-18.8, 6.0, -7.2), new THREE.Vector3(-12.0, 40, -2.6)),
  new THREE.Box3(new THREE.Vector3(-23.0, 9.4, -28.2), new THREE.Vector3(-16.6, 40, -24.9)),
];

export function removeMiddleSigns(scene) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), centre = new THREE.Vector3();
  let removed = 0;
  scene.updateMatrixWorld(true);
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || (!mesh.name.startsWith('V5_STATIC') && !mesh.name.startsWith('Suspension threads'))) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    if (!REGIONS.some(region => region.intersectsBox(box))) return;
    const position = geometry.attributes.position;
    const index = geometry.index ? geometry.index.array : null;
    const count = index ? index.length : position.count;
    const keep = [];
    let cut = 0;
    for (let i = 0; i < count; i += 3) {
      const i0 = index ? index[i] : i, i1 = index ? index[i + 1] : i + 1, i2 = index ? index[i + 2] : i + 2;
      a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
      centre.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      if (REGIONS.some(region => region.containsPoint(centre))) { cut++; continue; }
      keep.push(i0, i1, i2);
    }
    if (!cut) return;
    removed += cut;
    if (!keep.length) { mesh.visible = false; return; }
    const trimmed = geometry.clone();
    trimmed.setIndex(keep);
    trimmed.computeBoundingBox();
    trimmed.computeBoundingSphere();
    mesh.geometry = trimmed;
  });
  scene.userData.removedSignTriangles = removed;
  return removed;
}

// Hanging displays: raised and staggered so they float above the factory at varied heights.
// Several are merged into shared static meshes, so vertices are moved by world region.
export const HANGING = [
  { name: 'Back Pokémon sign', min: [-45.5, 10.6, -24.5], max: [-37.5, 16, -18.8], lift: 1.3 },
  { name: 'Bulbasaur medallion', min: [-40.6, 7.8, -12.3], max: [-36.6, 12.2, -8.7], lift: 2.1 },
  { name: 'Squirtle medallion', min: [-31.1, 6.9, -13.1], max: [-27.1, 11.2, -9.5], lift: 1.0 },
  // Kept in place horizontally; raised so that, seen from the main camera, its bottom lines up with
  // the top of the front Pokémon sign — it stands out above the sign by exactly its own height.
  { name: 'Pikachu medallion', min: [-15.5, 6.2, -12.6], max: [-11.5, 10.6, -9.0], lift: 9.1 },
  { name: 'Charmander medallion', min: [-11.3, 8.6, -13.6], max: [-7.3, 13.0, -10.4], lift: .7 },
  { name: 'Link station icon', min: [-36.8, 7.4, -22.6], max: [-34.4, 10.2, -20.3], lift: 1.7 },
  { name: 'Orbit energy icon', min: [-27.0, 10.3, -24.5], max: [-24.4, 13.1, -22.1], lift: .5 },
  { name: 'Fast transfer icon', min: [-21.7, 5.2, -7.8], max: [-19.3, 7.8, -5.6], lift: 2.6 },
  { name: 'Map icon', min: [-5.6, 6.4, -8.9], max: [-3.2, 9.0, -6.7], lift: 2.3 },
  { name: 'Link & Trade sign', min: [-10.4, 4.9, -6.6], max: [-7.0, 6.9, -4.8], lift: 1.9 },
].map(item => ({ ...item, box: new THREE.Box3(new THREE.Vector3(...item.min), new THREE.Vector3(...item.max)) }));

// Connected pieces of a mesh, welding vertices that share a position (split normals/UVs).
export function connectedPieces(geometry) {
  const position = geometry.attributes.position;
  const parent = new Int32Array(position.count);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const weld = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
    const other = weld.get(key);
    if (other === undefined) weld.set(key, i); else join(i, other);
  }
  const index = geometry.index?.array;
  const count = index ? index.length : position.count;
  for (let i = 0; i < count; i += 3) {
    const a = index ? index[i] : i, b = index ? index[i + 1] : i + 1, c = index ? index[i + 2] : i + 2;
    join(a, b); join(b, c);
  }
  const root = new Int32Array(position.count);
  for (let i = 0; i < position.count; i++) root[i] = find(i);
  return root;
}

export function raiseHangingDisplays(scene) {
  const world = new THREE.Vector3(), inverse = new THREE.Matrix4();
  const moved = new Map();
  scene.updateMatrixWorld(true);
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || /Dreamscape/.test(mesh.name)) return;
    if (!mesh.name.startsWith('V5_STATIC') && !/Suspension threads/.test(mesh.name)) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bounds = geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    const hits = HANGING.filter(item => item.box.intersectsBox(bounds));
    if (!hits.length) return;
    const source = geometry.attributes.position;
    const roots = connectedPieces(geometry);
    // World bounds of every piece.
    const pieces = new Map();
    for (let i = 0; i < source.count; i++) {
      world.fromBufferAttribute(source, i).applyMatrix4(mesh.matrixWorld);
      let piece = pieces.get(roots[i]);
      if (!piece) pieces.set(roots[i], piece = new THREE.Box3());
      piece.expandByPoint(world);
    }
    // A piece rises only if it lies wholly inside a display's (slightly padded) region.
    const lifts = new Map();
    for (const [root, box] of pieces) {
      let item = hits.find(entry => entry.box.clone().expandByScalar(.6).containsBox(box) && entry.box.intersectsBox(box));
      // Suspension strands are thin pieces that hang from a display and reach far above its
      // box: move every strand whose lower end is anchored on that display.
      if (!item && box.max.x - box.min.x < .3 && box.max.z - box.min.z < .3 && box.max.y - box.min.y > .4) {
        item = hits.find(entry => {
          const area = entry.box.clone().expandByScalar(.35);
          return box.min.x >= area.min.x && box.max.x <= area.max.x && box.min.z >= area.min.z && box.max.z <= area.max.z
            && box.min.y >= area.min.y && box.min.y <= area.max.y;
        });
      }
      if (item) lifts.set(root, item);
    }
    if (!lifts.size) return;
    mesh.geometry = geometry.clone();
    const positions = mesh.geometry.attributes.position;
    inverse.copy(mesh.matrixWorld).invert();
    for (let i = 0; i < source.count; i++) {
      const item = lifts.get(roots[i]);
      if (!item) continue;
      world.fromBufferAttribute(source, i).applyMatrix4(mesh.matrixWorld);
      if (item.offset) { world.x += item.offset[0]; world.y += item.offset[1]; world.z += item.offset[2]; }
      else world.y += item.lift;
      world.applyMatrix4(inverse);
      positions.setXYZ(i, world.x, world.y, world.z);
      moved.set(item.name, (moved.get(item.name) || 0) + 1);
    }
    positions.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
  return Object.fromEntries(moved);
}
