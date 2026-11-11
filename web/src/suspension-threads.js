import * as THREE from 'three';

// Isolated cable components in the authored static meshes; the rest stays untouched.
export function softenSuspensionThreads(object) {
  const spec = object.name.includes('WEB_STATIC_hero_026')
    ? { count: 79080, groups: [[74904,4,160],[78400,2,128],[78824,2,128]] }
    : object.name.includes('WEB_STATIC_background_052')
      ? { count: 44162, groups: [[40886,12,160],[43394,6,128]] } : null;
  const source = object.geometry;
  if (!spec || source.attributes.position.count !== spec.count || !source.index) return null;
  const positions = [], normals = [], heights = [], remap = new Map();
  const position = source.attributes.position, normal = source.attributes.normal;
  for (const [start, strands, count] of spec.groups) {
    for (let strand = 0; strand < strands; strand++) {
      const first = start + strand * count;
      let bottom = Infinity, top = -Infinity;
      for (let i = first; i < first + count; i++) {
        bottom = Math.min(bottom, position.getY(i)); top = Math.max(top, position.getY(i));
      }
      for (let i = first; i < first + count; i++) {
        const height = (position.getY(i) - bottom) / (top - bottom) * 4.5;
        remap.set(i, heights.length);
        positions.push(position.getX(i), bottom + height, position.getZ(i));
        normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        heights.push(height);
      }
    }
  }
  const solidIndices = [], threadIndices = [], indices = source.index.array;
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap.get(indices[i]), b = remap.get(indices[i+1]), c = remap.get(indices[i+2]);
    if (a !== undefined && b !== undefined && c !== undefined) threadIndices.push(a,b,c);
    else solidIndices.push(indices[i],indices[i+1],indices[i+2]);
  }
  object.geometry = source.clone();
  object.geometry.setIndex(solidIndices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('threadHeight', new THREE.Float32BufferAttribute(heights,1));
  geometry.setIndex(threadIndices);
  const material = new THREE.MeshStandardMaterial({
    color: '#89939e', metalness: .18, roughness: .65, envMapIntensity: .35,
    transparent: true, opacity: .72, depthWrite: false, alphaTest: .005,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float threadHeight; varying float vThreadHeight;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvThreadHeight = threadHeight;');
    shader.fragmentShader = 'varying float vThreadHeight;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>',
      'diffuseColor.a *= 1.0 - smoothstep(0.35, 4.3, vThreadHeight);\n#include <alphatest_fragment>');
  };
  material.customProgramCacheKey = () => 'suspension-thread-soft-fade-v1';
  const threads = new THREE.Mesh(geometry, material);
  threads.name = 'Suspension threads / attached ends with upward fade';
  threads.castShadow = false;
  return threads;
}
