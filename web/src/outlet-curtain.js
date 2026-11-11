import * as THREE from 'three';

const RADIUS = .405;
const MAX_ANGLE = Math.PI * .49;

// Split only the existing outlet strips out of their merged static batch.
// Original vertices, bevels, UVs and materials are retained.
export class OutletCurtain {
  constructor(scene) {
    this.flaps = [];
    scene.updateMatrixWorld(true);
    const sources = [];
    scene.traverse(o => { if (o.isMesh && o.name.includes('WEB_STATIC_hero_120')) sources.push(o); });
    for (const source of sources) this.extract(scene, source);
    this.position = new THREE.Vector3();
  }

  extract(scene, source) {
    const geometry = source.geometry;
    const attribute = geometry.attributes.position;
    const indices = geometry.index?.array || Array.from({length: attribute.count}, (_, i) => i);
    const points = Array.from({length: attribute.count}, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(source.matrixWorld));
    const inside = p => Math.abs(p.x) < 1.1 && p.y > 1.69 && p.y < 1.92 && p.z > 1.32 && p.z < 1.43;
    const selected = [], keep = [];
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = [indices[i], indices[i + 1], indices[i + 2]];
      (triangle.every(index => inside(points[index])) ? selected : keep).push(...triangle);
    }
    if (!selected.length) return;
    // The glTF has split normal/UV vertices. Weld positions for connectivity only.
    const parent = new Map(), keys = new Map();
    function root(i) { while (parent.get(i) !== i) { parent.set(i, parent.get(parent.get(i))); i = parent.get(i); } return i; }
    const union = (a, b) => parent.set(root(a), root(b));
    for (const i of selected) {
      if (parent.has(i)) continue;
      parent.set(i, i);
      const key = points[i].toArray().map(v => Math.round(v * 1e5)).join(',');
      if (keys.has(key)) union(i, keys.get(key)); else keys.set(key, i);
    }
    for (let i = 0; i < selected.length; i += 3) { union(selected[i], selected[i + 1]); union(selected[i], selected[i + 2]); }
    const groups = new Map();
    for (let i = 0; i < selected.length; i += 3) {
      const key = root(selected[i]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(...selected.slice(i, i + 3));
    }
    for (const group of groups.values()) {
      const bounds = new THREE.Box3().setFromPoints(group.map(i => points[i]));
      const center = bounds.getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.name = 'Outlet safety flap hinge';
      pivot.position.set(center.x, bounds.max.y, center.z);
      const part = geometry.clone();
      part.setIndex(group);
      part.applyMatrix4(source.matrixWorld);
      part.translate(-pivot.position.x, -pivot.position.y, -pivot.position.z);
      const mesh = new THREE.Mesh(part, source.material);
      mesh.name = 'Contact-driven outlet safety flap';
      mesh.castShadow = true; mesh.receiveShadow = true;
      pivot.add(mesh); scene.add(pivot);
      this.flaps.push({pivot, angle: 0, velocity: 0, halfWidth: (bounds.max.x - bounds.min.x) / 2,
        length: bounds.max.y - bounds.min.y, halfThickness: (bounds.max.z - bounds.min.z) / 2});
    }
    source.geometry = geometry.clone();
    source.geometry.setIndex(keep);
  }

  distance(flap, point, angle) {
    const x = point.x - flap.pivot.position.x;
    const y = point.y - flap.pivot.position.y;
    const z = point.z - flap.pivot.position.z;
    // Inverse of the outward hinge rotation (rotation.x = -angle).
    const localY = Math.cos(angle) * y - Math.sin(angle) * z;
    const localZ = Math.sin(angle) * y + Math.cos(angle) * z;
    return Math.hypot(Math.max(0, Math.abs(x) - flap.halfWidth),
      Math.max(0, localY, -flap.length - localY),
      Math.max(0, Math.abs(localZ) - flap.halfThickness));
  }

  update(dt, balls) {
    // Baked ejection is kept, with a small contact correction under the fixed hinge.
    // Without it, the original trajectory intersects the hinge even with the flap open.
    for (const ball of balls) {
      for (const flap of this.flaps) {
        const p = ball.position, h = flap.pivot.position;
        const dx = Math.max(0, Math.abs(p.x - h.x) - flap.halfWidth);
        const dz = Math.max(0, Math.abs(p.z - h.z) - flap.halfThickness - flap.length);
        const r2 = (RADIUS + .006) ** 2 - dx ** 2 - dz ** 2;
        if (r2 > 0 && p.y < h.y + .05 && Math.abs(p.z - h.z) < RADIUS + flap.length + flap.halfThickness) {
          p.y = Math.min(p.y, h.y - Math.sqrt(r2) - flap.halfThickness - .016);
        }
      }
    }
    for (const flap of this.flaps) {
      flap.velocity += (-65 * flap.angle - 9 * flap.velocity) * dt;
      const proposed = THREE.MathUtils.clamp(flap.angle + flap.velocity * dt, 0, MAX_ANGLE);
      let angle = proposed;
      const clear = a => balls.every(ball => this.distance(flap, ball.position, a) >= RADIUS + .003);
      if (!clear(angle)) {
        let high = angle;
        while (high < MAX_ANGLE && !clear(high)) high = Math.min(MAX_ANGLE, high + .025);
        let low = angle;
        for (let i = 0; i < 12; i++) { const mid = (low + high) / 2; if (clear(mid)) high = mid; else low = mid; }
        angle = high;
        flap.velocity = Math.max(0, Math.min(5, (angle - flap.angle) / dt));
      }
      flap.angle = angle;
      if (angle < .0001 && Math.abs(flap.velocity) < .01) { flap.angle = 0; flap.velocity = 0; }
      flap.pivot.rotation.x = -flap.angle;
    }
  }
}
