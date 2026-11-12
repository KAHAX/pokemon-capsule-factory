// Bound full-scene render targets on large/high-DPI displays. The scene keeps
// the same lights, materials and effects; avoid forced 125% desktop supersampling.
export function scenePixelRatio(width, height, dpr = 1, mobileRatio = null) {
  const wanted = mobileRatio === null ? Math.min(dpr, 1.5) : Math.min(dpr, mobileRatio);
  const maxPixels = mobileRatio === null ? 3686400 : 1000000;
  return Math.min(wanted, Math.sqrt(maxPixels / Math.max(1, width * height)));
}
