import * as THREE from 'three';

// The rolling supply balls share geometry/materials. Preserve their original
// transforms and collision bodies, but submit each surface as one instanced draw.
export function createMobileSupplyBatches(scene,supply) {
  const batches=new Map(),originalLayers=new Map();
  return {
    update() {
      const currentSources=new Set();
      for(const entry of batches.values())entry.batch.count=0;
      for(const ball of supply.balls){
        ball.mesh.updateWorldMatrix(true,true);
        ball.mesh.traverse(mesh=>{
          if(!mesh.isMesh||Array.isArray(mesh.material)||mesh.material.transparent)return;
          currentSources.add(mesh);
          const key=mesh.geometry.uuid+'/'+mesh.material.uuid;
          let entry=batches.get(key);
          if(!entry){
            const batch=new THREE.InstancedMesh(mesh.geometry,mesh.material,32);
            batch.name='Mobile supply / '+mesh.material.name;
            batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);batch.frustumCulled=false;
            batch.castShadow=false;batch.receiveShadow=true;batch.count=0;scene.add(batch);
            entry={batch};batches.set(key,entry);
          }
          let visible=true;for(let p=mesh;p;p=p.parent)if(!p.visible)visible=false;
          if(visible&&entry.batch.count<32){entry.batch.setMatrixAt(entry.batch.count++,mesh.matrixWorld);if(!originalLayers.has(mesh))originalLayers.set(mesh,mesh.layers.mask);mesh.layers.set(31);}
          else if(visible)mesh.layers.set(0); // capacity overflow keeps the normal draw
        });
      }
      for(const [mesh,mask] of originalLayers)if(!currentSources.has(mesh)){mesh.layers.mask=mask;originalLayers.delete(mesh);}
      for(const {batch} of batches.values())batch.instanceMatrix.needsUpdate=true;
    },
    dispose(){for(const {batch} of batches.values()){batch.removeFromParent();batch.dispose();}for(const [mesh,mask] of originalLayers)mesh.layers.mask=mask;originalLayers.clear();batches.clear();},
  };
}
