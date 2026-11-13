// Copies the app into dist/ and stamps the service worker cache name with a hash of the
// shipped files, so every deploy that changes something replaces the cached app shell.
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const FILES = ['index.html', 'app.js', 'manifest.webmanifest', 'icon.png'];
const OUT = 'dist';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT);

const hash = createHash('sha256');
for (const f of FILES) {
  hash.update(await readFile(f));
  await cp(f, `${OUT}/${f}`);
}
const sw = await readFile('sw.js', 'utf8');
hash.update(sw);
const version = hash.digest('hex').slice(0, 10);
const stamped = sw.replace("'lf-shell-v1'", `'lf-shell-${version}'`);
if (stamped === sw) throw new Error('sw.js: cache name placeholder not found');
await writeFile(`${OUT}/sw.js`, stamped);

console.log(`Built ${FILES.length + 1} files into ${OUT}/ (cache lf-shell-${version})`);
