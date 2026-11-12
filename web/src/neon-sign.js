import * as THREE from 'three';
import { connectedPieces } from './dreamscape/cleanup.js';

// Replace complete connected components, including pieces in shared static meshes.
// The medallions are further back; the feeder stays below this volume.
export function replaceMainSign(scene, asset, renderer) {
  const region = new THREE.Box3(new THREE.Vector3(-9.65, 11.55, -7.1), new THREE.Vector3(.15, 100, -2.7));
  const point = new THREE.Vector3();
  let removedTriangles = 0;
  scene.updateMatrixWorld(true);
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || !mesh.name.startsWith('V5_STATIC')) return;
    const source = mesh.geometry;
    source.computeBoundingBox();
    if (!region.intersectsBox(source.boundingBox.clone().applyMatrix4(mesh.matrixWorld))) return;
    const roots = connectedPieces(source), boxes = new Map(), p = source.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let box = boxes.get(roots[i]);
      if (!box) boxes.set(roots[i], box = new THREE.Box3());
      box.expandByPoint(point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
    }
    const remove = new Set([...boxes].filter(([,box]) => region.containsBox(box)).map(([root]) => root));
    if (!remove.size) return;
    const ix = source.index?.array, keep = [];
    for (let i = 0, n = ix?.length ?? p.count; i < n; i += 3) {
      const a = ix ? ix[i] : i;
      if (remove.has(roots[a])) { removedTriangles++; continue; }
      keep.push(a, ix ? ix[i + 1] : i + 1, ix ? ix[i + 2] : i + 2);
    }
    if (!keep.length) { mesh.visible = false; return; }
    mesh.geometry = source.clone();
    mesh.geometry.setIndex(keep);
    mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  });
  asset.scene.name = 'Main sign / Blender cyberpunk neon';
  asset.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.castShadow = false; mesh.receiveShadow = true;
    const material = mesh.material;
    // Keep the directional cue subordinate to the logo; preserve its yellow hue.
    if (material.name === 'NEON / jade arrow luminous face') material.emissiveIntensity = 1.35;
    material.envMapIntensity = .8;
    if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (material.name.includes('fading suspension wires')) {
      material.transparent = true; material.depthWrite = false;
      material.onBeforeCompile = shader => {
        shader.vertexShader = 'varying float signWireHeight;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nsignWireHeight = (modelMatrix * vec4(position,1.0)).y;');
        shader.fragmentShader = 'varying float signWireHeight;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= 1.0-smoothstep(16.55,19.3,signWireHeight);\n#include <opaque_fragment>');
      };
      material.customProgramCacheKey = () => 'neon-sign-wire-fade-v1';
    }
  });
  // The original Blender sign is kept as authored; its arrow additionally gets a bright
  // yellow neon outline traced around its luminous face.
  scene.add(asset.scene);
  asset.scene.updateMatrixWorld(true);
  const arrow = asset.scene.getObjectByName('NeonSign__jade_arrow_luminous_face');
  if (arrow) {
    try {
      const outline = arrowNeonOutline(arrow);
      if (outline) scene.add(outline);
    } catch (error) { console.warn('Sign arrow outline skipped:', error); }
  }
  scene.userData.neonSign = { removedTriangles, source: 'Pokemon_Cyberpunk_Neon_Sign.blend' };
}

// Trace the outer boundary of the arrow's front face and run a glowing tube along it.
function arrowNeonOutline(arrow) {
  const g = arrow.geometry, pos = g.attributes.position, ix = g.index?.array;
  const world = [], ids = new Int32Array(pos.count), keys = new Map(), p = new THREE.Vector3();
  let front = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(arrow.matrixWorld);
    front = Math.max(front, p.z);
    const key = `${Math.round(p.x * 2000)},${Math.round(p.y * 2000)},${Math.round(p.z * 2000)}`;
    if (!keys.has(key)) { keys.set(key, world.length); world.push(p.clone()); }
    ids[i] = keys.get(key);
  }
  // Boundary edges of the front-facing cap: edges used by exactly one front triangle.
  const edges = new Map();
  for (let i = 0, n = ix?.length ?? pos.count; i < n; i += 3) {
    const t = [0, 1, 2].map(k => ids[ix ? ix[i + k] : i + k]);
    if (t.some(id => world[id].z < front - .012)) continue;
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3]; if (a === b) continue;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  const next = new Map();
  for (const [key, count] of edges) {
    if (count !== 1) continue;
    const [a, b] = key.split('_').map(Number);
    (next.get(a) || next.set(a, []).get(a)).push(b); (next.get(b) || next.set(b, []).get(b)).push(a);
  }
  const loops = [], seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [start]; seen.add(start);
    let previous = -1, current = start;
    for (;;) {
      const step = next.get(current).find(id => id !== previous && (!seen.has(id) || (id === start && loop.length > 2)));
      if (step === undefined || step === start) break;
      loop.push(step); seen.add(step); previous = current; current = step;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  if (!loops.length) return null;
  const material = new THREE.MeshStandardMaterial({ name: 'NEON / arrow yellow neon outline', color: '#fff0b0', emissive: '#ffe04a', emissiveIntensity: 6.5, roughness: .3, metalness: 0 });
  const group = new THREE.Group(); group.name = 'Main sign / arrow neon outline';
  for (const loop of loops) {
    // Resample along the polygon so the tube hugs straight edges and turns crisply at corners.
    const points = [];
    let length = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = world[loop[i]], b = world[loop[(i + 1) % loop.length]], d = a.distanceTo(b);
      length += d;
      const steps = Math.max(1, Math.ceil(d / .07));
      for (let k = 0; k < steps; k++) points.push(new THREE.Vector3().lerpVectors(a, b, k / steps).setZ(front + .035));
    }
    if (length < 1.5) continue; // ignore tiny inner details
    const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', .2);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 2, .05, 8, true), material);
    tube.name = material.name; tube.castShadow = false;
    group.add(tube);
  }
  return group.children.length ? group : null;
}
