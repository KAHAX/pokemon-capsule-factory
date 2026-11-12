import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Physical height: 1.5 times the conveyor deck's height above the wet ground.
export const ENERGY_PILLAR_HEIGHT = (2.5 - (-.69)) * 1.5;
export function addEnergyPillar(scene, time) {
  const root = new THREE.Group();
  root.name = 'Background / luminous energy charging pillar';
  root.position.set(-23, -.69, -16);
  root.rotation.y = -.28;
  const mat = (name, color, metalness, roughness, emission, intensity = 0) => new THREE.MeshStandardMaterial({
    name: `Energy pillar / ${name}`, color, metalness, roughness,
    emissive: emission || '#000000', emissiveIntensity: intensity,
  });
  const armor = mat('blue graphite armor', '#293742', .78, .31);
  const edge = mat('brushed titanium edging', '#788b96', .85, .26);
  const inset = mat('recessed charcoal insulation', '#121d25', .35, .55);
  const brass = mat('aged brass fasteners', '#ab9256', .8, .35);
  const cell = mat('yellow green energy cells', '#adc930', .1, .32, '#b3e52b', 1.65);
  const accent = mat('thin charge strips', '#829c37', .25, .38, '#a5d43b', .55);
  const red = mat('red connector cable', '#9e3b2c', .1, .5);
  const cyan = mat('ready status LED', '#65ecff', .1, .2, '#34cfff', 4);
  const amber = mat('power status LED', '#ffa354', .1, .25, '#ff6928', 3);
  const buckets = new Map();
  function add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), q, new THREE.Vector3(1, 1, 1)));
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(geometry);
  }
  const box = (w, h, d, material, position, radius = .035, rotation) => add(new RoundedBoxGeometry(w, h, d, material === cell ? 2 : 1, radius), material, position, rotation);
  const cylinder = (rt, rb, h, material, y, sides = 8) => add(new THREE.CylinderGeometry(rt, rb, h, sides), material, [0, y, 0], [0, Math.PI / 8, 0]);
  // Four splayed feet support a stepped octagonal base, not a floating simple box.
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    box(.65, .24, .8, armor, [x * 1.03, .12, z * 1.03], .07);
    box(.39, .45, .4, edge, [x * .98, .38, z * .98], .045, [z * .13, 0, -x * .13]);
    box(.44, .035, .3, inset, [x * 1.03, .251, z * 1.16], .01);
  }
  cylinder(1.48, 1.63, .29, armor, .47);
  cylinder(1.48, 1.48, .075, edge, .65);
  cylinder(1.3, 1.3, .065, accent, .7);
  cylinder(.48, .48, 3.28, inset, 2.37, 24);
  // Four slim light apertures sit deep inside individual dark cell casings.
  // The core and separators are opaque: only the recessed front strips emit.
  for (let i = 0; i < 4; i++) {
    const y = 1.5 + i * .57;
    cylinder(.63, .63, .075, armor, y - .19, 24);
    for (let face = 0; face < 4; face++) {
      const angle = face * Math.PI / 2, s = Math.sin(angle), c = Math.cos(angle);
      box(1.32, .36, .24, inset, [s * .53, y, c * .53], .055, [0, angle, 0]);
      box(1.13, .19, .09, cell, [s * .68, y, c * .68], .04, [0, angle, 0]);
      box(1.36, .055, .27, armor, [s * .56, y - .21, c * .56], .018, [0, angle, 0]);
    }
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    box(.28, 3.52, .28, armor, [x * 1.06, 2.47, z * 1.06], .045);
    box(.065, 2.57, .065, edge, [x * 1.215, 2.37, z * 1.215], .015);
    for (const y of [.95, 3.78]) add(new THREE.SphereGeometry(.043, 8, 6), brass, [x * 1.22, y, z * 1.1]);
  }
  for (let face = 0; face < 4; face++) {
    const angle = face * Math.PI / 2, s = Math.sin(angle), c = Math.cos(angle);
    const p = (x, y, z) => [x * c + z * s, y, z * c - x * s];
    for (const y of [.88, 3.89]) box(1.99, .2, .17, edge, p(0, y, 1.12), .04, [0, angle, 0]);
    // Deep window reveals visibly separate the lit cells from the outer armor.
    for (const x of [-.86, .86]) box(.19, 2.65, .55, armor, p(x, 2.35, .87), .025, [0, angle, 0]);
    box(1.97, .44, .24, armor, p(0, 3.57, 1.08), .045, [0, angle, 0]);
    box(1.97, .26, .24, armor, p(0, 1.1, 1.08), .04, [0, angle, 0]);
    // Small corner lugs and cooling slots in the upper armor band.
    box(1.97, .34, .2, armor, p(0, 4.12, 1.1), .04, [0, angle, 0]);
    for (let k = -3; k <= 3; k++) box(.055, .17, .025, inset, p(k * .16, 4.12, 1.215), .009, [0, angle, 0]);
    box(.49, .24, .12, edge, p(0, .87, 1.25), .025, [0, angle, 0]);
    for (const x of [-.86, .86]) for (const y of [.9, 3.88]) {
      add(new THREE.CylinderGeometry(.045, .045, .027, 8), brass, p(x, y, 1.22), [Math.PI / 2, 0, -angle]);
    }
  }
  cylinder(1.48, 1.48, .1, inset, 4.29);
  cylinder(1.34, 1.59, .31, armor, 4.49);
  cylinder(1.36, 1.36, .07, edge, 4.68);
  cylinder(1.25, 1.25, .04, inset, 4.735);
  for (let k = -2; k <= 2; k++) box(.13, .025, .83, accent, [k * .28, 4.77, 0], .01);
  for (const [x, m] of [[.69, cyan], [.47, amber]]) add(new THREE.SphereGeometry(.074, 12, 8), m, [x, 4.46, 1.28]);
  // A reinforced front connector, with a ribbed red charging lead and docked plug.
  box(.37, 2.3, .16, armor, [-1.08, 2.65, 1.19], .035);
  box(.24, .43, .13, inset, [-1.08, 2.18, 1.3], .025);
  const path = new THREE.CatmullRomCurve3([[-1.08, 2.25, 1.38], [-1.08, 1.65, 1.44], [-1.06, .57, 1.49], [-.8, .25, 1.7], [-.48, .29, 1.6], [-.35, .7, 1.4]].map(p => new THREE.Vector3(...p)));
  add(new THREE.TubeGeometry(path, 30, .075, 8, false), red);
  box(.18, .32, .18, inset, [-.35, .76, 1.4], .025);
  box(.1, .09, .1, edge, [-.35, .96, 1.4], .01);
  for (let i = 0; i < 9; i++) box(.17, .025, .14, brass, [-1.08, 2.05 - i * .14, 1.43], .005);
  let triangles = 0;
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = material.name; mesh.castShadow = !material.emissiveIntensity; mesh.receiveShadow = true;
    root.add(mesh); triangles += merged.attributes.position.count / 3;
    geometries.forEach(g => g.dispose());
  }
  // Crisp authored labels in a single small atlas, rather than another downloaded asset.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const c = canvas.getContext('2d'); c.fillStyle = '#18252d'; c.fillRect(0, 0, 512, 256);
    c.strokeStyle = '#cfe66b'; c.lineWidth = 6; c.strokeRect(8, 8, 496, 240);
    c.fillStyle = '#d5eb79'; c.font = 'bold 44px monospace'; c.fillText('CHARGE / 01', 28, 66);
    c.font = '20px monospace'; c.fillText('CAPSULE ENERGY SYSTEM', 28, 105);
    c.beginPath(); c.moveTo(80, 128); c.lineTo(38, 215); c.lineTo(122, 215); c.closePath(); c.stroke();
    c.fillStyle = '#e8f69c'; c.font = 'bold 54px monospace'; c.fillText('!', 63, 205);
    for (let i = 0; i < 55; i++) { c.fillRect(151 + i * 5.7, 145, i % 3 + 1, 54); }
    c.font = '14px monospace'; c.fillText('HIGH VOLTAGE / 480V', 157, 226);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.MeshStandardMaterial({name: 'Energy pillar / printed service plate', map: texture, roughness: .56, metalness: .2});
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(.8, .4), label);
    panel.position.set(0, 4.1, 1.217); panel.name = 'Energy pillar / charge specification'; root.add(panel);
  }
  const lamp = new THREE.PointLight('#b7df52', 7, 4.5, 2);
  lamp.name = 'Energy pillar / local green spill'; lamp.position.set(0, 2.5, .5); root.add(lamp);
  // Charging is driven by Raikou's visit, not by an unrelated timer.
  let charge = 0;
  const applyCharge = () => {
    const breath = .98 + .02 * Math.sin((time?.value || 0) * 1.25);
    cell.emissiveIntensity = THREE.MathUtils.lerp(1.65, 5.5, charge) * breath;
    accent.emissiveIntensity = THREE.MathUtils.lerp(.55, 3, charge);
    lamp.intensity = THREE.MathUtils.lerp(7, 32, charge) * breath;
    lamp.distance = THREE.MathUtils.lerp(4.5, 7, charge);
  };
  root.userData.chargeLevel = 0;
  root.userData.setCharge = (strength, dt) => {
    const target = THREE.MathUtils.clamp(strength, 0, 1);
    charge = THREE.MathUtils.damp(charge, target, target > charge ? 3.5 : 1.4, Math.max(0, dt));
    root.userData.chargeLevel = charge;
    applyCharge();
  };
  root.userData.chargeSocket = new THREE.Vector3(1.2, 3.63, 0);
  // Gentle breathing, without adding shadows or per-frame geometry work.
  const clock = root.children.find(o => o.isMesh);
  clock.onBeforeRender = applyCharge;
  root.scale.setScalar(ENERGY_PILLAR_HEIGHT / 4.7825);
  root.userData.statistics = {triangles, staticBatches: buckets.size, height: ENERGY_PILLAR_HEIGHT, conveyorHeight: 3.19};
  scene.add(root);
  return root;
}
