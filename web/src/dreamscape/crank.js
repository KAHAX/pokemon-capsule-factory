import * as THREE from 'three';

// A larger, more mechanical hand-wheel: the authored wheel is scaled up and gains
// chrome spokes, a domed hub cap, a brass inner ring, rim studs (the original handle knob is kept).
// Everything is parented to the crank pivot, so it turns with the spin animation.
export function enhanceCrank(crank) {
  if (!crank || crank.userData.enhanced) return;
  crank.userData.enhanced = true;
  crank.scale.set(1.2, 1.55, 1.55);
  const chrome = new THREE.MeshPhysicalMaterial({ color: '#dfe6ee', metalness: 1, roughness: .14, clearcoat: .6, clearcoatRoughness: .08 });
  const brass = new THREE.MeshPhysicalMaterial({ color: '#d8a64a', metalness: 1, roughness: .24, clearcoat: .4 });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: '#d4232b', metalness: .05, roughness: .3, clearcoat: 1, clearcoatRoughness: .05 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#1d1f24', roughness: .75 });
  [chrome, brass, lacquer, rubber].forEach(material => { material.name = `Crank detail / ${material.color.getHexString()}`; });
  const face = .062;            // just proud of the wheel face (+x)
  const detail = new THREE.Group();
  detail.name = 'Crank detail';

  // Domed chrome hub cap and a brass collar behind it.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.085, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), chrome);
  cap.rotation.z = -Math.PI / 2;
  cap.position.x = face + .01;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(.115, .125, .03, 40), brass);
  collar.rotation.z = Math.PI / 2;
  collar.position.x = face;
  detail.add(cap, collar);

  // Five chrome spokes.
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(.018, .026, .26, 12), chrome);
    spoke.position.set(face - .005, Math.cos(angle) * .19, Math.sin(angle) * .19);
    spoke.rotation.x = angle;
    detail.add(spoke);
  }
  // Brass inner ring and chrome studs around the rim.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.32, .014, 10, 72), brass);
  ring.rotation.y = Math.PI / 2;
  ring.position.x = face;
  detail.add(ring);
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(.016, 12, 8), chrome);
    stud.position.set(face + .004, Math.cos(angle) * .375, Math.sin(angle) * .375);
    detail.add(stud);
  }
  // Rubber grip band on the outer rim.
  const grip = new THREE.Mesh(new THREE.TorusGeometry(.405, .024, 12, 96), rubber);
  grip.rotation.y = Math.PI / 2;
  grip.position.x = .015;
  detail.add(grip);
  // The original crank already carries its own handle knob, so none is added here.

  detail.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  // Undo the pivot's non-uniform scale so the details keep true proportions at the larger size.
  detail.scale.set(1 / 1.2 * 1.3, 1, 1);
  crank.add(detail);
}
