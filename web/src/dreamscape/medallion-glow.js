import * as THREE from 'three';
import { HANGING } from './cleanup.js';

// The portrait reliefs and porcelain faces share merged meshes with other props.
// A vertex mask restores only these two backlit signs, without extra draw calls
// or brightening the rings, suspension hardware, or other porcelain objects.
export function restoreMedallionGlow(scene) {
  const regions = HANGING.filter(item => /^(Pikachu|Charmander) medallion$/.test(item.name))
    .map(item => item.box.clone().translate(new THREE.Vector3(0, item.lift, 0)));
  const point = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse(mesh => {
    if (!mesh.isMesh || !mesh.name.startsWith('V5_STATIC') || Array.isArray(mesh.material)) return;
    const source = mesh.material;
    if (!/^(RELIEF ·|GIF \/ porcelain ivory)/.test(source.name)) return;
    const position = mesh.geometry.attributes.position;
    const glow = new Float32Array(position.count);
    let selected = false;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      if (!regions.some(region => region.containsPoint(point))) continue;
      glow[i] = source.name.startsWith('GIF') ? .55 : 1.25;
      selected = true;
    }
    if (!selected) return;
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('medallionGlow', new THREE.BufferAttribute(glow, 1));
    const material = mesh.material = source.clone();
    material.userData.medallionBacklight = true;
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float medallionGlow; varying float vMedallionGlow;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMedallionGlow = medallionGlow;');
      shader.fragmentShader = 'varying float vMedallionGlow;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vMedallionGlow;');
    };
    material.customProgramCacheKey = () => 'hanging-portrait-backlight-v1';
  });
}
