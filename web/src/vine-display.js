import * as THREE from 'three';

// The GLBs include attack-only vine meshes, but no mesh-visibility animation.
// Their straight fallback pose must not be displayed during everyday body clips.
export function prepareVineDisplay(source, clips, entry) {
  const dex = Number(entry.dex ?? String(entry.id).split('-')[0]);
  if (dex !== 1 && dex !== 3) return clips;
  const vines = [];
  source.traverse(object => {
    if (object.isMesh && /(?:tuta|vine)_mesh/i.test(object.name)) vines.push(object);
  });
  if (!vines.length) return clips;
  for (const mesh of vines) {
    const gate = new THREE.Group();
    gate.name = 'Vine portrait visibility';
    gate.userData.vineVisibilityGate = true;
    mesh.parent.add(gate);
    gate.add(mesh); // identity parent: keep skin binding and authored transforms
    mesh.visible = false;
  }
  return clips.map(original => {
    // These clips actually animate the vine chains; ordinary gestures only move
    // the body. Venusaur also uses its vines in its happy gesture.
    const usesVines = /_00410_attack02\./.test(original.name)
      || (dex === 3 && /_00550_glad01\./.test(original.name));
    const duration = original.duration;
    const times = usesVines
      ? [0, Math.min(.12, duration * .08), duration - Math.min(.2, duration * .1), duration]
      : [0, duration];
    const values = usesVines ? [false, true, false, false] : [false, false];
    const tracks = vines.map(mesh => new THREE.BooleanKeyframeTrack(`${mesh.uuid}.visible`, times, values));
    return new THREE.AnimationClip(original.name, duration, [...original.tracks, ...tracks], original.blendMode);
  });
}
