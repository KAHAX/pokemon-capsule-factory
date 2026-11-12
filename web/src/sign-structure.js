import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Billboard structure for the main sign, after a classic roadside neon sign:
// a tilted logo board with a neon outline, carried by a level steel truss with a catwalk and
// railing, a row of hooded downlights, a lit banner hanging below and a chunky bent arrow.
// Everything is generated here and merged into one mesh per material.
const TILT = .07;                        // logo board tilt (rises to the right)
// A compact frame, tucked behind the board: narrower and lower than the board itself and
// ending well left of the feeder pipe, so the two never overlap on screen.
const FRONT = -4.05, BACK = -4.55;       // truss planes (world z)
const X0 = -8.3, X1 = -1.6, BAYS = 5;    // truss span
const LEVELS = [11.1, 11.7, 14.55];      // truss chords

// Closed polygon with rounded corners.
function roundedShape(points, radius) {
  const shape = new THREE.Shape(), n = points.length, a = new THREE.Vector2(), b = new THREE.Vector2();
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n], cur = points[i], next = points[(i + 1) % n];
    const r = Math.min(radius, cur.distanceTo(prev) * .45, cur.distanceTo(next) * .45);
    a.copy(prev).sub(cur).setLength(r).add(cur);
    b.copy(next).sub(cur).setLength(r).add(cur);
    if (i === 0) shape.moveTo(a.x, a.y); else shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
  }
  shape.closePath();
  return shape;
}

// Move every edge of a counter-clockwise polygon inwards by `distance` (outwards if negative).
function inset(points, distance) {
  const n = points.length, lines = [];
  for (let i = 0; i < n; i++) {
    const p = points[i], q = points[(i + 1) % n], d = q.clone().sub(p).normalize();
    const normal = new THREE.Vector2(-d.y, d.x);
    lines.push({ p: p.clone().addScaledVector(normal, distance), d });
  }
  return lines.map((line, i) => {
    const before = lines[(i + n - 1) % n];
    const cross = before.d.x * line.d.y - before.d.y * line.d.x;
    if (Math.abs(cross) < 1e-6) return line.p.clone();
    const delta = line.p.clone().sub(before.p), t = (delta.x * line.d.y - delta.y * line.d.x) / cross;
    return before.p.clone().addScaledVector(before.d, t);
  });
}

const P = pairs => pairs.map(([x, y]) => new THREE.Vector2(x, y));
// The earlier, livelier silhouette: an irregular four-sided panel — low on the left, tall on the
// right, with a raked right-hand edge and generously rounded corners (counter-clockwise).
const BOARD = P([[-5.05, -1.95], [4.35, -1.6], [5.75, 2.15], [-5.55, 1.3]]);
// Block arrow: straight shaft that bends 45° and ends in a broad head (pointing down-right).
const ARROW = P([[0, 3.6], [0, 1.145], [1.029, .116], [.728, -.185], [2, -.326], [1.86, .947], [1.559, .646], [.75, 1.455], [.75, 3.6]]);

function bannerTexture(renderer) {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 280;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const draw = font => {
    const c = canvas.getContext('2d');
    const gradient = c.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, '#ff6a36'); gradient.addColorStop(.55, '#f4481f'); gradient.addColorStop(1, '#d93514');
    c.fillStyle = gradient; c.fillRect(0, 0, 2048, 280);
    c.strokeStyle = '#3a1208'; c.lineWidth = 14; c.strokeRect(7, 7, 2034, 266);
    c.strokeStyle = 'rgba(255,214,170,.55)'; c.lineWidth = 4; c.strokeRect(24, 24, 2000, 232);
    c.fillStyle = '#1a1438'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `170px ${font}`;
    c.fillText('CAPSULE WORKS', 1024, 150);
    // Pokéball bullets at both ends.
    for (const x of [150, 1898]) {
      c.lineWidth = 12; c.strokeStyle = '#1a1438';
      c.beginPath(); c.arc(x, 140, 58, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(x - 58, 140); c.lineTo(x + 58, 140); c.stroke();
      c.fillStyle = '#ffe3c4'; c.beginPath(); c.arc(x, 140, 20, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#1a1438';
    }
    texture.needsUpdate = true;
  };
  draw('"Arial Black", Impact, sans-serif');
  // Use the project's display face once it is available.
  if (typeof FontFace !== 'undefined') {
    new FontFace('Paytone Sign', 'url(/assets/paytone-one.ttf)').load().then(face => {
      document.fonts.add(face); draw('"Paytone Sign", "Arial Black", sans-serif');
    }).catch(() => {});
  }
  return texture;
}

export function buildSignStructure(center, renderer) {
  const root = new THREE.Group(); root.name = 'Main sign / roadside neon billboard structure';
  const board = new THREE.Group(); board.name = 'Main sign / tilted logo board';
  board.position.set(center.x, center.y, 0); board.rotation.z = TILT;
  root.add(board);

  const std = (name, color, metalness, roughness, emissive, intensity = 0) => new THREE.MeshStandardMaterial({
    name: `SIGN / ${name}`, color, metalness, roughness, emissive: emissive || '#000000', emissiveIntensity: intensity, envMapIntensity: .8,
  });
  const steel = std('blackened truss steel', '#1c2431', .8, .46);
  const housing = std('petrol enamel housing', '#0d1830', .55, .38);
  const face = std('deep cobalt enamel face', '#0c1c46', .3, .42, '#0a1d5c', .55);
  const bezel = std('champagne bezel', '#bfae8a', .9, .3);
  const amber = std('amber neon tube', '#ffe7b0', 0, .3, '#ffd27a', 7.5);
  const arrowFace = std('arrow luminous face', '#ffd95a', 0, .45, '#ffcf1f', 1.25);
  const arrowTube = std('arrow neon outline', '#fff0b0', 0, .3, '#ffe04a', 6.5);
  const lampGlow = std('downlight lens', '#fff1d6', 0, .3, '#ffc27a', 4.5);
  const deck = std('catwalk grating', '#262f3c', .7, .6);
  const bannerMap = bannerTexture(renderer);
  const banner = new THREE.MeshStandardMaterial({ name: 'SIGN / lit banner face', map: bannerMap, emissiveMap: bannerMap, emissive: '#ffffff', emissiveIntensity: 1.15, roughness: .5, metalness: 0 });

  const buckets = new Map([[root, new Map()], [board, new Map()]]);
  const add = (parent, geometry, material, matrix) => {
    if (matrix) geometry.applyMatrix4(matrix);
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    const list = buckets.get(parent);
    if (!list.has(material)) list.set(material, []);
    list.get(material).push(geometry);
  };
  const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const extrude = (shape, depth, bevel = 0) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  const outlineTube = (points, radius, corner, z) => {
    const samples = roundedShape(points, corner).getSpacedPoints(160).map(p => new THREE.Vector3(p.x, p.y, z));
    samples.pop();
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(samples, true, 'centripetal'), 320, radius, 8, true);
  };
  const Y = new THREE.Vector3(0, 1, 0);
  const beam = (a, b, thickness, material = steel, parent = root) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from), length = direction.length();
    const matrix = new THREE.Matrix4().compose(from.add(to).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(Y, direction.normalize()), new THREE.Vector3(1, 1, 1));
    add(parent, new THREE.BoxGeometry(thickness, length, thickness), material, matrix);
  };
  const box = (w, h, d, x, y, z, material, parent = root) => add(parent, new THREE.BoxGeometry(w, h, d), material, at(x, y, z));

  // ---- Logo board (local to the tilted group; z is world depth) ----
  add(board, extrude(roundedShape(BOARD, .62), .42, .03), housing, at(0, 0, -3.97));
  const rim = roundedShape(inset(BOARD, -.13), .72);
  rim.holes.push(new THREE.Path(roundedShape(inset(BOARD, .11), .52).getPoints(12).reverse()));
  add(board, extrude(rim, .16, .015), bezel, at(0, 0, -3.6));
  add(board, new THREE.ShapeGeometry(roundedShape(inset(BOARD, .1), .52), 10), face, at(0, 0, -3.5));
  add(board, outlineTube(inset(BOARD, .3), .052, .4, -3.42), amber);
  // Rivets around the bezel.
  const rivets = roundedShape(inset(BOARD, -.02), .66).getSpacedPoints(44);
  for (const p of rivets.slice(0, -1)) add(board, new THREE.SphereGeometry(.03, 6, 4), bezel, at(p.x, p.y, -3.43));

  // ---- Truss (level) ----
  const xs = Array.from({ length: BAYS + 1 }, (_, i) => X0 + (X1 - X0) * i / BAYS);
  for (const z of [FRONT, BACK]) {
    for (const y of LEVELS) beam([X0 - .05, y, z], [X1 + .05, y, z], .1);
    for (const x of xs) beam([x, LEVELS[0], z], [x, LEVELS[2], z], .09);
    // Zig-zag web in the lower girder, cross bracing above.
    for (let i = 0; i < BAYS; i++) {
      const [a, b] = i % 2 ? [LEVELS[0], LEVELS[1]] : [LEVELS[1], LEVELS[0]];
      beam([xs[i], a, z], [xs[i + 1], b, z], .055);
      if (z === BACK) {
        beam([xs[i], LEVELS[1], z], [xs[i + 1], LEVELS[2], z], .05);
        beam([xs[i], LEVELS[2], z], [xs[i + 1], LEVELS[1], z], .05);
      }
    }
  }
  for (const x of xs) for (const y of LEVELS) beam([x, y, FRONT], [x, y, BACK], .07);
  for (const x of [X0, X1]) { beam([x, LEVELS[0], FRONT], [x, LEVELS[1], BACK], .05); beam([x, LEVELS[1], FRONT], [x, LEVELS[2], BACK], .05); }
  // Gusset plates at the main joints.
  for (const x of xs) for (const y of LEVELS) box(.24, .24, .03, x, y, FRONT + .06, steel);
  // Stand-offs carrying the board.
  for (const x of [-7.6, -4.9, -2.2]) for (const y of [12.6, 14.3]) beam([x, y, FRONT], [x, y, -3.95], .08);

  // ---- Catwalk, railing and downlights ----
  const deckY = 11.74, lip = -3.08;
  box(X1 - X0 + .2, .06, lip - BACK, (X0 + X1) / 2, deckY, (lip + BACK) / 2, deck);
  beam([X0 - .1, deckY - .06, lip], [X1 + .1, deckY - .06, lip], .09);
  for (const x of xs) {
    beam([x, deckY, lip], [x, deckY + .56, lip], .05);
    beam([x, deckY - .06, lip], [x, LEVELS[1] - .05, FRONT], .045);
  }
  for (const y of [deckY + .3, deckY + .56]) beam([X0, y, lip], [X1, y, lip], .04);
  for (const y of [deckY + .3, deckY + .56]) beam([X1, y, lip], [X1, y, BACK], .04);
  beam([X1, deckY, BACK], [X1, deckY + .56, BACK], .05);
  for (let i = 0; i < 5; i++) {
    const x = -7.5 + i * 1.28, y = deckY - .2, z = lip + .02;
    add(root, new THREE.CylinderGeometry(.09, .15, .2, 12), steel, at(x, y, z));
    add(root, new THREE.CylinderGeometry(.118, .118, .02, 12), lampGlow, at(x, y - .105, z));
    beam([x, y + .1, z], [x, deckY - .05, z], .035);
  }

  // ---- Banner under the catwalk ----
  const bannerSize = [6.3, .86], bannerAt = [-4.95, 10.98, -3.3];
  box(bannerSize[0] + .14, bannerSize[1] + .14, .12, bannerAt[0], bannerAt[1], bannerAt[2] - .07, steel);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(...bannerSize), banner);
  plate.name = 'Main sign / CAPSULE WORKS lit banner'; plate.position.set(bannerAt[0], bannerAt[1], bannerAt[2]);
  root.add(plate);
  for (const x of [bannerAt[0] - 2.5, bannerAt[0], bannerAt[0] + 2.5]) {
    beam([x, bannerAt[1] + bannerSize[1] / 2, bannerAt[2] - .07], [x, deckY - .08, bannerAt[2] - .07], .05);
    beam([x, bannerAt[1], bannerAt[2] - .13], [x, bannerAt[1], FRONT], .05);
  }

  // ---- Arrow ----
  const arrowScale = 1.2, arrowAt = [-12.0, 11.55];
  const arrowMatrix = z => new THREE.Matrix4().makeTranslation(arrowAt[0], arrowAt[1], z).multiply(new THREE.Matrix4().makeScale(arrowScale, arrowScale, 1));
  add(root, extrude(roundedShape(ARROW, .1), .34, .025), housing, arrowMatrix(-3.84));
  add(root, new THREE.ShapeGeometry(roundedShape(inset(ARROW, .07), .07), 8), arrowFace, arrowMatrix(-3.465));
  add(root, outlineTube(inset(ARROW, .1), .05 / arrowScale, .06, 0), arrowTube, arrowMatrix(-3.43));
  // Brackets tying the arrow back to the truss.
  for (const y of [14.4, 13.2]) { beam([-11.4, y, -3.8], [-11.4, y, -4.4], .07); beam([-11.4, y, -4.4], [X0, y, -4.4], .07); }
  

  for (const [parent, list] of buckets) for (const [material, geometries] of list) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.name = material.name; mesh.castShadow = false; mesh.receiveShadow = true;
    parent.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  }
  // A little warm light from the lamps and neon onto the structure itself.
  const glow = new THREE.PointLight('#ffc88a', 9, 7, 2);
  glow.name = 'Main sign / downlight spill'; glow.position.set(-4.95, 11.3, -2.4);
  root.add(glow);
  return { root, board };
}
