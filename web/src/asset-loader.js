import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer/decoder';

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
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return { loadAsync(url) { return new Promise((resolve, reject) => {
    waiting.push({task: async () => {
      // A stalled request must not leave a phone on the loading screen forever.
      let timer;
      try {
        return await Promise.race([
          loader.loadAsync(url),
          new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('资源下载超时，请检查网络后重试')), 180000); }),
        ]);
      } finally { clearTimeout(timer); }
    }, resolve, reject}); pump();
  }); } };
}
