// Pull Pokémon that exist in the 流光收藏室 collection (default http://localhost:5180) but not
// yet in this capsule machine: downloads their models into public/assets/pokemon-v5/ and merges
// their entries into manifest.json, so they enter the ball pool and the F12 "next Pokémon" list.
//
//   node scripts/sync-collection.mjs                  # from the web/ folder
//   node scripts/sync-collection.mjs http://host:5180 # another collection address
//   node scripts/sync-collection.mjs --force          # re-download files that already exist
import { createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const force = args.includes('--force');
const origin = (args.find(arg => /^https?:\/\//.test(arg)) || 'http://localhost:5180').replace(/\/$/, '');
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(webRoot, 'public', 'assets');
const manifestPath = join(assets, 'pokemon-v5', 'manifest.json');

const exists = path => access(path).then(() => true, () => false);
const mb = bytes => `${(bytes / 1048576).toFixed(1)} MB`;

async function download(relative) {
  const target = join(assets, ...relative.split('/'));
  if (!force && await exists(target)) return 'kept';
  const response = await fetch(`${origin}/assets/${relative}`);
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
  await mkdir(dirname(target), { recursive: true });
  const partial = `${target}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  await rename(partial, target);
  return mb(Number(response.headers.get('content-length')) || 0);
}

// Optional companion textures some Pokémon use (e.g. 004-fire.png); absent ones are skipped.
async function optional(relative) {
  const target = join(assets, ...relative.split('/'));
  if (!force && await exists(target)) return;
  const response = await fetch(`${origin}/assets/${relative}`, { method: 'HEAD' }).catch(() => null);
  const type = response?.headers.get('content-type') || '';
  if (response?.ok && !type.includes('text/html')) await download(relative);
}

const remote = await fetch(`${origin}/assets/pokemon-v5/manifest.json`).then(response => {
  if (!response.ok) throw new Error(`Collection manifest: HTTP ${response.status}. Is ${origin} running?`);
  return response.json();
});
const local = JSON.parse(await readFile(manifestPath, 'utf8'));
const known = new Set(local.map(entry => entry.id));
const added = remote.filter(entry => !known.has(entry.id));

console.log(`Collection ${origin}: ${remote.length} entries · capsule machine: ${local.length} · new: ${added.length}`);
for (const entry of added) {
  const result = await download(entry.file);
  await optional(`pokemon-v5/${entry.id}-fire.png`);
  console.log(`  #${String(entry.dex).padStart(3, '0')} ${entry.name} (${entry.english}) · ${entry.file} · ${result}`);
}

if (added.length) {
  await copyFile(manifestPath, manifestPath.replace(/\.json$/, `.backup-${Date.now()}.json`));
  // Keep every existing entry as it is; add the new ones and order by Pokédex number.
  const merged = [...local, ...added].sort((a, b) => a.dex - b.dex || Number(a.shiny) - Number(b.shiny) || String(a.id).localeCompare(String(b.id)));
  await writeFile(manifestPath, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`manifest.json updated: ${local.length} → ${merged.length} entries (backup written next to it).`);
} else {
  console.log('Nothing to add — the capsule machine already has every collection Pokémon.');
}
console.log('Refresh the capsule page to use them (they also appear in the F12 next-Pokémon list).');
