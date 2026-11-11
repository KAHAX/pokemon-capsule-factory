import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { LoadingManager, TextureLoader } from 'three';
import { loadPackedModel } from './asset-transfer.js';

// Bound simultaneous download/decode work so mobile browsers don't parse every
// factory/character asset at once. The original geometry/materials stay intact.
let active = 0;
const waiting = [];
const limit = matchMedia('(pointer: coarse)').matches ? 2 : 3;
function pump() {
  while (active < limit && waiting.length) {
    const {task, resolve, reject} = waiting.shift(); active++;
    task().then(resolve, reject).finally(() => { active--; setTimeout(pump, 0); });
  }
}
export function createAssetLoader() {
  const makeLoader = () => {
    const manager = new LoadingManager();
    const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
    // Use the mature HTML image decoder in embedded mobile browsers. Some
    // WebViews expose createImageBitmap but fail to settle large texture jobs.
    if (matchMedia('(pointer: coarse)').matches) loader.register(parser => {
      parser.textureLoader = new TextureLoader(manager).setCrossOrigin('anonymous');
      return {name:'MobileTextureCompatibility'};
    });
    return loader;
  };
  return { loadAsync(url) { return new Promise((resolve, reject) => {
    waiting.push({task: async () => {
      return loadPackedModel(url, makeLoader);
    }, resolve, reject}); pump();
  }); } };
}
