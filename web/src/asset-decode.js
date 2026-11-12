import { gunzipSync } from 'fflate';

let worker, unavailable = false, serial = 0;
const pending = new Map();
function fallback() {
  unavailable = true;
  worker?.terminate();
  worker = null;
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    try { item.resolve(gunzipSync(item.bytes)); } catch (error) { item.reject(error); }
  }
  pending.clear();
}
export function decodeAssetChunk(bytes) {
  if (unavailable || typeof Worker === 'undefined') return Promise.resolve().then(() => gunzipSync(bytes));
  if (!worker) {
    try {
      worker = new Worker(new URL('./asset-decode-worker.js', import.meta.url), { type: 'module' });
      worker.onerror = event => { event.preventDefault(); fallback(); };
      worker.onmessage = ({ data }) => {
        const item = pending.get(data.id);
        if (!item) return;
        pending.delete(data.id); clearTimeout(item.timer);
        data.error ? item.reject(new Error(data.error)) : item.resolve(data.output);
      };
    } catch { fallback(); return Promise.resolve().then(() => gunzipSync(bytes)); }
  }
  return new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject, bytes, timer: setTimeout(fallback, 10000) });
    // Keep the small compressed input for older WebViews' worker fallback.
    try { worker.postMessage({ id, bytes }); } catch { fallback(); }
  });
}
