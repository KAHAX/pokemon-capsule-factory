const KEY = 'capsule-display-settings-v1';
export const defaults = Object.freeze({ goldChance: 50, parallaxDepth: 1, modelScale: 1, sceneOutline: true });
const limits = { goldChance: [0, 100], parallaxDepth: [0, 2], modelScale: [.5, 1.35] };
export function normalizeSettings(values = {}) {
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    if (typeof fallback === 'boolean') return [key, typeof values[key] === 'boolean' ? values[key] : fallback];
    const value = Number(values[key] ?? fallback), [min, max] = limits[key];
    return [key, Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback];
  }));
}
let saved;
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
// Upgrade the former persisted default once; later manual adjustments still stick.
try {
  const migration = 'capsule-shiny-default-50-v1';
  if (!localStorage.getItem(migration)) {
    if (saved?.goldChance === 10) saved.goldChance = 50;
    localStorage.setItem(KEY, JSON.stringify(saved || {}));
    localStorage.setItem(migration, '1');
  }
} catch { /* Defaults also work when storage is unavailable. */ }
let settings = normalizeSettings(saved || {});
export const getDisplaySettings = () => ({ ...settings });
export function setDisplaySettings(patch) {
  settings = normalizeSettings({ ...settings, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Session settings still work. */ }
  window.dispatchEvent(new CustomEvent('capsule-settings-change', { detail: getDisplaySettings() }));
}
export function choosePrizeIcon(random = Math.random, percent = settings.goldChance) {
  const chance = normalizeSettings({ goldChance: percent }).goldChance / 100;
  const roll = Math.max(0, Math.min(1 - Number.EPSILON, random()));
  if (chance === 1 || roll < chance) return 1;
  return [0, 2, 3][Math.min(2, Math.floor((roll - chance) / (1 - chance) * 3))];
}
