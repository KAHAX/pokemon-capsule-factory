import { cp, mkdir, readFile, readdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// Assemble an isolated mobile module tree. Relative imports still resolve
// against the shared sources, with only phone-specific files overlaid.
const root = fileURLToPath(new URL('../', import.meta.url));
const stage = resolve(root, 'mobile/generated');
await mkdir(stage, { recursive: true });
await cp(resolve(root, 'src'), resolve(stage, 'src'), { recursive: true });
await cp(resolve(root, 'mobile/overrides'), resolve(stage, 'src'), { recursive: true });
if (process.argv.includes('--dev')) process.exit(0);

await mkdir(resolve(stage, 'mobile'), { recursive: true });
for (const entry of ['index.html', 'mobile/index.html']) {
  await copyFile(resolve(root, entry), resolve(stage, entry));
}
await build({
  root: stage, configFile: false, publicDir: false,
  build: {
    target: ['chrome80', 'safari14', 'firefox78'],
    rollupOptions: { input: { main: resolve(stage, 'index.html'), mobile: resolve(stage, 'mobile/index.html') } }
  }
});
// Keep the first build's desktop HTML and hashed assets intact.
for (const asset of await readdir(resolve(stage, 'dist/assets'))) {
  const source = await readFile(resolve(stage, 'dist/assets', asset));
  const dest = resolve(root, 'dist/assets', asset);
  try { await writeFile(dest, source, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST' || !(await readFile(dest)).equals(source)) throw error;
  }
}
await copyFile(resolve(stage, 'dist/mobile/index.html'), resolve(root, 'dist/mobile/index.html'));
