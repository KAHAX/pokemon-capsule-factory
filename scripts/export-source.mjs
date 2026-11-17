import { execFileSync } from 'node:child_process';
import { createReadStream, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
if (git('status', '--porcelain').trim()) {
  throw new Error('Commit or resolve working-tree changes before exporting HEAD.');
}
const revision = git('rev-parse', '--short', 'HEAD').trim();
const output = resolve(root, 'share');
mkdirSync(output, { recursive: true });
const archive = resolve(output, `pokemon-capsule-factory-source-${revision}.zip`);
git('archive', '--format=zip', '--prefix=pokemon-capsule-factory/', `--output=${archive}`, 'HEAD');
const hash = createHash('sha256');
for await (const chunk of createReadStream(archive)) hash.update(chunk);
writeFileSync(`${archive}.sha256`, `${hash.digest('hex')}  ${basename(archive)}\n`);
console.log(JSON.stringify({ archive, bytes: statSync(archive).size }, null, 2));
