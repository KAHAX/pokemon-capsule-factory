let entries = new Map();
let pending = null;
export function configureNextPokemon(manifest) {
  entries = new Map(manifest.map(entry => [entry.id, entry]));
  if (pending && !entries.has(pending.id)) pending = null;
}
export function getNextPokemon() { return pending ? { ...pending } : null; }
function notify(used = null) {
  window.dispatchEvent(new CustomEvent('next-pokemon-change', { detail: { pending: getNextPokemon(), used } }));
}
export function selectNextPokemon(id) {
  if (id == null) { pending = null; notify(); return; }
  const entry = entries.get(id);
  if (!entry) throw new Error('该宝可梦不在当前图鉴中');
  pending = { id: entry.id, dex: entry.dex, name: entry.name, english: entry.english, shiny: entry.shiny === true };
  notify();
}
// Called only after the machine accepts a new spin, never while inspecting old prizes.
export function consumeNextPokemon() {
  const chosen = getNextPokemon();
  pending = null;
  if (chosen) notify(chosen);
  return chosen;
}
