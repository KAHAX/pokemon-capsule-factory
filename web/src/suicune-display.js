import * as THREE from 'three';

// Suicune's exported action set contains straight bind-pose ribbon tracks in
// several body actions. Use its own secondary-motion loop for those bones.
export function prepareSuicuneDisplay(source, clips, entry) {
  if (String(entry.dex || entry.id) !== '245') return null;
  const donor = clips.find(clip => /_08300_loop01_loop/.test(clip.name));
  if (!donor) throw new Error('Suicune ribbon motion is missing');
  const ribbonTrack = name => /^(left|right)_(tail_\d+|feeler)\./.test(name);
  const ribbons = donor.tracks.filter(track => ribbonTrack(track.name));
  const animations = clips.map(clip => {
    const duration = Math.max(clip.duration, .001);
    const tracks = clip.tracks.filter(track => !ribbonTrack(track.name));
    for (const original of ribbons) {
      const track = original.clone();
      track.scale(duration / donor.duration);
      tracks.push(track);
    }
    return new THREE.AnimationClip(clip.name, duration, tracks, clip.blendMode);
  });
  const animation = animations.find(clip => clip.name === entry.animation) || animations[0];
  const mixer = new THREE.AnimationMixer(source);
  mixer.clipAction(animation).play();
  mixer.setTime(0);
  source.updateMatrixWorld(true);
  // Frame the actual standing body, not the long ribbons or rest-pose bones.
  const bounds = new THREE.Box3();
  source.traverse(object => {
    if (!object.isMesh || /tail_mesh/.test(object.name)) return;
    object.skeleton?.update();
    bounds.union(new THREE.Box3().setFromObject(object, true));
  });
  // Preserve this valid pose as the animation fallback, including during fades.
  const pose = [];
  source.traverse(object => pose.push([object, object.position.clone(), object.quaternion.clone(), object.scale.clone()]));
  mixer.stopAllAction();
  mixer.uncacheRoot(source);
  for (const [object, position, quaternion, scale] of pose) {
    object.position.copy(position); object.quaternion.copy(quaternion); object.scale.copy(scale);
  }
  source.updateMatrixWorld(true);
  return { animations, animation, bounds };
}
