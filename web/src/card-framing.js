import * as THREE from 'three';

const tailBones=new WeakMap();
export function isTailVertex(mesh,index){
  if(/tail|sippo/i.test(mesh.name))return true;
  const skeleton=mesh.skeleton,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
  if(!skeleton||!indices||!weights)return false;
  if(!tailBones.has(skeleton))tailBones.set(skeleton,skeleton.bones.map(bone=>{
    for(let p=bone;p?.isBone;p=p.parent)if(/tail|sippo/i.test(p.name))return true;
    return false;
  }));
  const flags=tailBones.get(skeleton);let influence=0;
  for(let c=0;c<4;c++)if(flags[indices.getComponent(index,c)])influence+=weights.getComponent(index,c);
  return influence>.2;
}

// Adaptive extent along one axis. Short appendages (a modest tail, ears, fins) stay part of
// the silhouette; an extension that reaches out further than ~0.8× the core body (a very
// long tail, Bulbasaur's vines, streamers) is treated as outside and the body edge is used.
export function adaptiveExtent(sorted, { floorSide = false } = {}) {
  const q = p => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
  const coreLo = q(.1), coreHi = q(.9);
  const core = Math.max(coreHi - coreLo, 1e-4);
  let lo = floorSide ? q(.01) : q(.003), hi = q(.997);
  const longLo = !floorSide && coreLo - lo > core * .8;
  const longHi = hi - coreHi > core * .8;
  if (longLo) lo = Math.max(q(.04), coreLo - core * .3);
  if (longHi) hi = Math.min(q(.96), coreHi + core * .3);
  return { lo, hi, center: (lo + hi) / 2, size: hi - lo, long: longLo || longHi };
}

// Measure deformed vertices, rather than cached rest-pose bounding boxes or bones.
export function measureModelBounds(root, animation = null, { robust = false } = {}) {
  const box = new THREE.Box3();
  const samples = [];
  const inverse = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const mixer = animation ? new THREE.AnimationMixer(root) : null;
  if (animation) mixer.clipAction(animation).play();
  const times = animation ? [0, .25, .5, .75, .98].map(t => t * animation.duration) : [0];
  for (const time of times) {
    mixer?.setTime(time);
    root.updateWorldMatrix(true, false);
    // SkinnedMesh updates its bind-matrix inverse in updateMatrixWorld, not updateWorldMatrix.
    root.updateMatrixWorld(true);
    inverse.copy(root.matrixWorld).invert();
    root.traverseVisible(object => {
      if (!object.isMesh || !object.geometry.attributes.position) return;
      // Retracted attack-only vines should not shrink the resting card portrait.
      if (/tuta|vine/i.test(object.name)) return;
      if ((Array.isArray(object.material) ? object.material : [object.material]).every(m => m?.visible === false || m?.opacity === 0)) return;
      object.skeleton?.update();
      const positions = object.geometry.attributes.position;
      const stride = Math.max(1, Math.floor(positions.count / 2000));
      for (let i = 0; i < positions.count; i += stride) {
        if(object.userData.frameWithoutTail&&isTailVertex(object,i))continue;
        object.getVertexPosition(i, point);
        point.applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
        if (Number.isFinite(point.x + point.y + point.z)) {
          box.expandByPoint(point); samples.push(point.toArray());
        }
      }
    });
  }
  mixer?.stopAllAction();
  mixer?.uncacheRoot(root);
  root.updateMatrixWorld(true);
  if (box.isEmpty()) throw new Error('Cannot frame an empty character');
  if (robust) {
    // Keep short appendages in frame; leave very long extensions outside it.
    const lo = [], hi = [];
    for (let axis = 0; axis < 3; axis++) {
      const extent = adaptiveExtent(samples.map(p => p[axis]).sort((a, b) => a - b), { floorSide: axis === 1 });
      const pad = extent.long ? extent.size * .04 : 1e-4;
      lo.push(extent.lo - pad); hi.push(extent.hi + pad);
    }
    const kept = samples.filter(p => p.every((v, axis) => v >= lo[axis] && v <= hi[axis]));
    if (kept.length > 50) {
      samples.length = 0; samples.push(...kept);
      box.makeEmpty();
      kept.forEach(p => box.expandByPoint(point.fromArray(p)));
    }
  }
  const stride = Math.max(1, Math.floor(samples.length / 2500));
  const outline = samples.filter((_, i) => i % stride === 0);
  for (let axis = 0; axis < 3; axis++) {
    outline.push(samples.reduce((a, b) => a[axis] < b[axis] ? a : b));
    outline.push(samples.reduce((a, b) => a[axis] > b[axis] ? a : b));
  }
  return { min: box.min.toArray(), max: box.max.toArray(), outline };
}

// Full-bleed portrait: fill the limiting image axis and allow a small edge crop.
// Perspective is included, so a deep body is not sized as a flat bounding box.
export function fitCardBounds(bounds, fov, aspect, distance, fill = 1.04) {
  const box = new THREE.Box3(new THREE.Vector3().fromArray(bounds.min), new THREE.Vector3().fromArray(bounds.max));
  const size = box.getSize(new THREE.Vector3());
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const center = box.getCenter(new THREE.Vector3());
  const outline = bounds.outline || [bounds.min, bounds.max];
  const project = (scale) => {
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
    for (const p of outline) {
      const depth=distance-(p[2]-center.z)*scale;
      const x=(p[0]-center.x)*scale/(depth*tan*aspect),y=(p[1]-center.y)*scale/(depth*tan);
      left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);
    }
    return {left,right,bottom,top};
  };
  let scale;
  for (let pass=0; pass<12; pass++) {
    let low=0,high=distance/Math.max(size.z/2,.001)*.9;
    for (let i=0;i<25;i++) {
      const mid=(low+high)/2,p=project(mid);
      if (Math.max(Math.abs(p.left),Math.abs(p.right),Math.abs(p.bottom),Math.abs(p.top))>fill) high=mid;
      else low=mid;
    }
    scale=low;
    const p=project(scale);
    if(Math.max(Math.abs(p.left+p.right),Math.abs(p.bottom+p.top))<.001) break;
    // A full correction overshoots deep portraits (e.g. Dewgong), alternating
    // above/below the centre. Half steps converge without changing the camera.
    if(pass<11){center.x+=(p.left+p.right)/4*distance*tan*aspect/scale;center.y+=(p.bottom+p.top)/4*distance*tan/scale;}
  }
  return { center, scale, size };
}

// Body framing for the observation view: posed (skinned) vertices, median-centred,
// percentile-sized, so tails or long appendages never pull the body off-centre.
export function measureBodyFrame(root, animation = null) {
  const point = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  const samples = [[], [], []];
  const mixer = animation ? new THREE.AnimationMixer(root) : null;
  if (animation) mixer.clipAction(animation).play();
  const times = animation ? [0, .33, .66].map(t => t * animation.duration) : [0];
  for (const time of times) {
    mixer?.setTime(time);
    root.updateMatrixWorld(true);
    inverse.copy(root.matrixWorld).invert();
    root.traverseVisible(object => {
      if (!object.isMesh || !object.geometry.attributes.position) return;
      if ((Array.isArray(object.material) ? object.material : [object.material]).every(m => m?.visible === false || m?.opacity === 0)) return;
      object.skeleton?.update();
      const positions = object.geometry.attributes.position;
      const stride = Math.max(1, Math.floor(positions.count / 3000));
      for (let i = 0; i < positions.count; i += stride) {
        if(object.userData.frameWithoutTail&&isTailVertex(object,i))continue;
        object.getVertexPosition(i, point);
        point.applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
        if (!Number.isFinite(point.x + point.y + point.z)) continue;
        samples[0].push(point.x); samples[1].push(point.y); samples[2].push(point.z);
      }
    });
  }
  mixer?.stopAllAction();
  mixer?.uncacheRoot(root);
  root.updateMatrixWorld(true);
  if (!samples[0].length) return null;
  samples.forEach(values => values.sort((a, b) => a - b));
  const [x, y, z] = [adaptiveExtent(samples[0]), adaptiveExtent(samples[1], { floorSide: true }), adaptiveExtent(samples[2])];
  const center = new THREE.Vector3(x.center, y.lo, z.center);
  const size = new THREE.Vector3(x.size, y.size, z.size).multiplyScalar(1.06);
  return { center, size };
}
